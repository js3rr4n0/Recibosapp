import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureSchema();
  const id = Number(params.id);
  const body = await req.json();
  const amount = Number(body.amount);
  if (!(amount > 0)) {
    return NextResponse.json({ detail: "Importe no válido." }, { status: 400 });
  }

  const goals = (await sql`SELECT id, name, currency FROM savings_goals WHERE id = ${id}`) as any[];
  if (goals.length === 0) {
    return NextResponse.json({ detail: "Objetivo no encontrado" }, { status: 404 });
  }
  const goal = goals[0];

  const updated = await sql`
    UPDATE savings_goals
    SET current_amount = ROUND((current_amount + ${amount})::numeric, 2)
    WHERE id = ${id}
    RETURNING id, name, target_amount, current_amount, currency
  `;

  // Registramos el ahorro como transacción.
  await sql`
    INSERT INTO transactions (type, amount, currency, category, merchant, note, occurred_on, source)
    VALUES (
      'saving', ${Math.round(amount * 100) / 100}, ${goal.currency}, 'Ahorro', ${goal.name},
      ${"Aportación al objetivo '" + goal.name + "'"},
      ${new Date().toISOString().slice(0, 10)}, 'manual'
    )
  `;

  return NextResponse.json(updated[0]);
}
