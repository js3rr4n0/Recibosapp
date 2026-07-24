import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureSchema();
  const id = Number(params.id);
  const rows = (await sql`
    SELECT id, merchant, address, purchase_date, total, currency, category,
           (image_b64 IS NOT NULL) AS has_image, created_at
    FROM receipts WHERE id = ${id}
  `) as any[];

  if (rows.length === 0) {
    return NextResponse.json({ detail: "Recibo no encontrado" }, { status: 404 });
  }
  const receipt = rows[0];
  receipt.items = await sql`
    SELECT id, name, quantity, unit_price, total_price
    FROM receipt_items WHERE receipt_id = ${id} ORDER BY id
  `;
  return NextResponse.json(receipt);
}
