import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { DEFAULT_CURRENCY } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await ensureSchema();
  const rows = await sql`
    SELECT id, name, target_amount, current_amount, currency
    FROM savings_goals ORDER BY id DESC
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  const body = await req.json();
  const name = String(body.name || "").trim();
  const target = Number(body.target_amount);
  if (!name || !(target > 0)) {
    return NextResponse.json({ detail: "Nombre o importe no válido." }, { status: 400 });
  }
  const rows = await sql`
    INSERT INTO savings_goals (name, target_amount, currency)
    VALUES (${name}, ${Math.round(target * 100) / 100}, ${body.currency || DEFAULT_CURRENCY})
    RETURNING id, name, target_amount, current_amount, currency
  `;
  return NextResponse.json(rows[0]);
}
