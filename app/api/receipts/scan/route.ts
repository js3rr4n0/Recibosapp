import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { MAX_IMAGE_BYTES } from "@/lib/constants";
import { scanReceipt, ScannerError } from "@/lib/scanner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  await ensureSchema();

  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ detail: "No se recibió ninguna imagen." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) {
    return NextResponse.json({ detail: "El archivo está vacío." }, { status: 400 });
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { detail: "La imagen es demasiado grande. Prueba con una foto de menor resolución." },
      { status: 413 }
    );
  }

  const mime = (file as File).type || "image/jpeg";

  let scan;
  try {
    scan = await scanReceipt(bytes, mime);
  } catch (e) {
    const msg = e instanceof ScannerError ? e.message : "Error al escanear el recibo.";
    return NextResponse.json({ detail: msg }, { status: 422 });
  }

  // Guardamos el recibo.
  const receiptRows = await sql`
    INSERT INTO receipts (merchant, address, purchase_date, total, currency, category, image_b64, image_mime)
    VALUES (
      ${scan.merchant}, ${scan.address}, ${scan.purchase_date},
      ${scan.total}, ${scan.currency}, ${scan.category},
      ${bytes.toString("base64")}, ${mime}
    )
    RETURNING id
  `;
  const receiptId = receiptRows[0].id as number;

  // Guardamos los artículos.
  for (const it of scan.items) {
    await sql`
      INSERT INTO receipt_items (receipt_id, name, quantity, unit_price, total_price)
      VALUES (${receiptId}, ${it.name}, ${it.quantity}, ${it.unit_price}, ${it.total_price})
    `;
  }

  // Creamos automáticamente el gasto asociado.
  await sql`
    INSERT INTO transactions (type, amount, currency, category, merchant, note, occurred_on, source, receipt_id)
    VALUES (
      'expense', ${scan.total}, ${scan.currency}, ${scan.category}, ${scan.merchant},
      'Generado automáticamente desde un recibo escaneado',
      ${scan.purchase_date || new Date().toISOString().slice(0, 10)},
      'receipt', ${receiptId}
    )
  `;

  return NextResponse.json({
    id: receiptId,
    merchant: scan.merchant,
    address: scan.address,
    purchase_date: scan.purchase_date,
    total: scan.total,
    currency: scan.currency,
    category: scan.category,
    has_image: true,
    items: scan.items,
    model: scan.model,
  });
}
