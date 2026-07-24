import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { DEFAULT_CURRENCY } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  await ensureSchema();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 100, 500);
  const rows = await sql`
    SELECT id, type, amount, currency, category, merchant, note,
           occurred_on, source, receipt_id
    FROM transactions
    ORDER BY occurred_on DESC, id DESC
    LIMIT ${limit}
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  const body = await req.json();

  const type = body.type;
  const amount = Number(body.amount);
  if (!["expense", "income", "saving"].includes(type) || !(amount > 0)) {
    return NextResponse.json({ detail: "Tipo o importe no válido." }, { status: 400 });
  }

  const rows = await sql`
    INSERT INTO transactions (type, amount, currency, category, merchant, note, occurred_on, source)
    VALUES (
      ${type},
      ${Math.round(amount * 100) / 100},
      ${body.currency || DEFAULT_CURRENCY},
      ${body.category || "Otros"},
      ${body.merchant || null},
      ${body.note || null},
      ${body.occurred_on || new Date().toISOString().slice(0, 10)},
      'manual'
    )
    RETURNING id, type, amount, currency, category, merchant, note, occurred_on, source, receipt_id
  `;
  return NextResponse.json(rows[0]);
}
