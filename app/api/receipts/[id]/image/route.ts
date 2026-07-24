import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureSchema();
  const id = Number(params.id);
  const rows = (await sql`SELECT image_b64, image_mime FROM receipts WHERE id = ${id}`) as any[];

  if (rows.length === 0 || !rows[0].image_b64) {
    return NextResponse.json({ detail: "Imagen no encontrada" }, { status: 404 });
  }

  const buffer = Buffer.from(rows[0].image_b64, "base64");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": rows[0].image_mime || "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
