import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureSchema();
  const id = Number(params.id);
  const rows = await sql`DELETE FROM transactions WHERE id = ${id} RETURNING id`;
  if (rows.length === 0) {
    return NextResponse.json({ detail: "Transacción no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
