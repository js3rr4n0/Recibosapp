import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  await ensureSchema();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 200);
  const receipts = (await sql`
    SELECT id, merchant, address, purchase_date, total, currency, category,
           (image_b64 IS NOT NULL) AS has_image, created_at
    FROM receipts
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as any[];

  for (const r of receipts) {
    r.items = await sql`
      SELECT id, name, quantity, unit_price, total_price
      FROM receipt_items WHERE receipt_id = ${r.id} ORDER BY id
    `;
  }
  return NextResponse.json(receipts);
}
