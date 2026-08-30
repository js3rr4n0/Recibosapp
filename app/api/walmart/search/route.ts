import { NextResponse } from "next/server";
import { buscarLista, estimarPresupuesto } from "@/lib/walmart";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const texto: string = typeof body?.lista === "string" ? body.lista : "";
    const lineas: string[] = Array.isArray(body?.lineas) ? body.lineas : texto.split("\n");

    const limpias = lineas.map((l: string) => String(l).trim()).filter(Boolean);
    if (!limpias.length) {
      return NextResponse.json({ error: "Escribe al menos un producto." }, { status: 400 });
    }

    const resultados = await buscarLista(limpias, 8);
    return NextResponse.json({ resultados, presupuesto: estimarPresupuesto(resultados) });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "No se pudo consultar el catálogo de Walmart." },
      { status: 502 }
    );
  }
}
