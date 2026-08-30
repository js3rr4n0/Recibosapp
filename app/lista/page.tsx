"use client";

import { useMemo, useState } from "react";
import type { Opcion, ResultadoItem } from "@/lib/walmart";

type Presupuesto = { min: number; max: number; sinResultados: string[] };

const EJEMPLO = "desodorante hombre\nhuevos\nleche galón\nqueso procesado";

const money = (n: number) =>
  new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" }).format(n);

export default function ListaPage() {
  const [texto, setTexto] = useState(EJEMPLO);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultados, setResultados] = useState<ResultadoItem[] | null>(null);
  const [presupuesto, setPresupuesto] = useState<Presupuesto | null>(null);
  // consulta -> productId elegido (o null = descartado)
  const [elegidos, setElegidos] = useState<Record<string, string | null>>({});

  async function buscar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/walmart/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lista: texto }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudo buscar.");
      setResultados(data.resultados);
      setPresupuesto(data.presupuesto);
      setElegidos({});
    } catch (e: any) {
      setError(e?.message ?? "Error inesperado.");
      setResultados(null);
      setPresupuesto(null);
    } finally {
      setCargando(false);
    }
  }

  const aceptados = useMemo(() => {
    if (!resultados) return { items: [] as { r: ResultadoItem; o: Opcion }[], total: 0 };
    const items: { r: ResultadoItem; o: Opcion }[] = [];
    let total = 0;
    for (const r of resultados) {
      const id = elegidos[r.consulta];
      if (!id) continue;
      const o = r.opciones.find((x) => x.productId === id);
      if (!o || o.precio === null) continue;
      items.push({ r, o });
      total += o.precio * r.cantidad;
    }
    return { items, total: Number(total.toFixed(2)) };
  }, [resultados, elegidos]);

  return (
    <main className="wrap">
      <header>
        <h1>Lista de compras · Walmart El Salvador</h1>
        <p className="sub">
          Escribe un producto por línea. Puedes anteponer la cantidad, por ejemplo{" "}
          <code>2 leche galón</code>.
        </p>
      </header>

      <section className="card">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder={EJEMPLO}
          aria-label="Lista de productos"
        />
        <button className="primary" onClick={buscar} disabled={cargando || !texto.trim()}>
          {cargando ? "Buscando en Walmart…" : "Buscar precios"}
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      {presupuesto && (
        <section className="card resumen">
          <h2>Tu presupuesto con todo sería</h2>
          <p className="rango">
            de <strong>{money(presupuesto.min)}</strong> a <strong>{money(presupuesto.max)}</strong>
          </p>
          <p className="sub">
            El mínimo toma la opción más barata de cada producto y el máximo la más cara, según lo
            que hay disponible hoy en walmart.com.sv.
          </p>
          {presupuesto.sinResultados.length > 0 && (
            <p className="warn">
              Sin resultados disponibles para: {presupuesto.sinResultados.join(", ")}
            </p>
          )}
          {aceptados.items.length > 0 && (
            <p className="aceptado">
              Aceptaste {aceptados.items.length} de {resultados?.length} productos ·{" "}
              <strong>{money(aceptados.total)}</strong>
            </p>
          )}
        </section>
      )}

      {resultados?.map((r) => {
        const elegido = elegidos[r.consulta];
        return (
          <section className="card" key={r.consulta}>
            <h3>
              {r.consulta}
              {r.cantidad > 1 && <span className="cant">× {r.cantidad}</span>}
            </h3>
            {r.error && <p className="error">{r.error}</p>}
            {!r.error && r.opciones.length === 0 && (
              <p className="warn">No encontramos opciones para este producto.</p>
            )}
            <ul className="opciones">
              {r.opciones.map((o) => (
                <li key={o.productId} className={elegido === o.productId ? "op elegida" : "op"}>
                  {o.imagen ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.imagen} alt="" width={64} height={64} loading="lazy" />
                  ) : (
                    <div className="sinimg" aria-hidden="true" />
                  )}
                  <div className="info">
                    <span className="nombre">{o.nombre}</span>
                    <span className="meta">
                      {o.marca && <em>{o.marca}</em>}
                      {!o.disponible && <span className="agotado">sin stock</span>}
                    </span>
                    <span className="precio">
                      {o.precio !== null ? money(o.precio) : "Precio no disponible"}
                      {o.precioLista !== null && o.precio !== null && o.precioLista > o.precio && (
                        <s>{money(o.precioLista)}</s>
                      )}
                    </span>
                  </div>
                  <div className="acciones">
                    <button
                      className="accept"
                      disabled={!o.disponible}
                      onClick={() =>
                        setElegidos((prev) => ({
                          ...prev,
                          [r.consulta]: prev[r.consulta] === o.productId ? null : o.productId,
                        }))
                      }
                    >
                      {elegido === o.productId ? "Aceptado ✓" : "Aceptar"}
                    </button>
                    <a href={o.url} target="_blank" rel="noopener noreferrer">
                      Ver en Walmart ↗
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <style jsx>{`
        .wrap { max-width: 860px; margin: 0 auto; padding: 28px 16px 80px; display: grid; gap: 18px; }
        h1 { font-size: 1.6rem; }
        h2 { font-size: 1.15rem; }
        h3 { font-size: 1.05rem; display: flex; gap: 10px; align-items: baseline; }
        .cant { font-size: 0.85rem; color: var(--muted); }
        .sub { color: var(--muted); font-size: 0.9rem; }
        code { background: rgba(148,163,214,0.16); padding: 1px 6px; border-radius: 6px; }
        .card {
          background: var(--glass); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 18px; display: grid; gap: 12px;
          backdrop-filter: blur(10px);
        }
        textarea {
          width: 100%; resize: vertical; font: inherit; color: var(--text);
          background: rgba(11,16,32,0.6); border: 1px solid var(--border);
          border-radius: 12px; padding: 12px;
        }
        button.primary {
          background: var(--grad); color: #0b1020; font-weight: 700;
          border: 0; border-radius: 12px; padding: 12px 18px; cursor: pointer;
        }
        button:disabled { opacity: 0.55; cursor: not-allowed; }
        .error { color: var(--expense); font-size: 0.9rem; }
        .warn { color: #fbbf24; font-size: 0.9rem; }
        .aceptado { color: var(--income); font-size: 0.95rem; }
        .rango { font-size: 1.5rem; }
        .rango strong { color: var(--saving); }
        ul.opciones { list-style: none; display: grid; gap: 10px; }
        .op {
          display: grid; grid-template-columns: 64px 1fr auto; gap: 12px; align-items: center;
          border: 1px solid var(--border); border-radius: 14px; padding: 10px;
          background: rgba(11,16,32,0.45);
        }
        .op.elegida { border-color: var(--income); box-shadow: 0 0 0 1px var(--income) inset; }
        .op img, .sinimg { border-radius: 10px; background: #fff; object-fit: contain; width: 64px; height: 64px; }
        .info { display: grid; gap: 3px; min-width: 0; }
        .nombre { font-size: 0.95rem; }
        .meta { font-size: 0.8rem; color: var(--muted); display: flex; gap: 8px; }
        .agotado { color: var(--expense); }
        .precio { font-weight: 700; }
        .precio s { color: var(--muted); font-weight: 400; margin-left: 8px; font-size: 0.85rem; }
        .acciones { display: grid; gap: 6px; justify-items: stretch; text-align: center; }
        .accept {
          background: transparent; color: var(--text); border: 1px solid var(--border);
          border-radius: 10px; padding: 8px 12px; cursor: pointer; font: inherit;
        }
        .op.elegida .accept { border-color: var(--income); color: var(--income); }
        .acciones a { color: var(--primary); font-size: 0.85rem; text-decoration: none; }
        @media (max-width: 560px) {
          .op { grid-template-columns: 48px 1fr; }
          .op img, .sinimg { width: 48px; height: 48px; }
          .acciones { grid-column: 1 / -1; grid-auto-flow: column; }
        }
      `}</style>
    </main>
  );
}
