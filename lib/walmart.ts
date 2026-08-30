// Cliente del catálogo de Walmart El Salvador (VTEX Search API pública).

const BASE = "https://www.walmart.com.sv";

export type Opcion = {
  productId: string;
  nombre: string;
  marca: string;
  precio: number | null;
  precioLista: number | null;
  disponible: boolean;
  imagen: string | null;
  url: string;
};

export type ResultadoItem = {
  consulta: string;
  cantidad: number;
  opciones: Opcion[];
  error?: string;
};

/** Separa "2 leche galón" en cantidad + término de búsqueda. */
export function parsearLinea(linea: string): { consulta: string; cantidad: number } {
  const limpia = linea.trim().replace(/\s+/g, " ");
  const m = limpia.match(/^(\d{1,3})\s*(?:x|X|\*)?\s+(.+)$/);
  if (m) {
    const cantidad = parseInt(m[1], 10);
    if (cantidad > 0 && cantidad <= 99) return { consulta: m[2], cantidad };
  }
  return { consulta: limpia, cantidad: 1 };
}

function mapear(p: any): Opcion | null {
  const item = p?.items?.[0];
  const oferta = item?.sellers?.[0]?.commertialOffer;
  if (!item) return null;
  const precio = typeof oferta?.Price === "number" && oferta.Price > 0 ? oferta.Price : null;
  return {
    productId: String(p.productId),
    nombre: p.productName ?? item.nameComplete ?? "Sin nombre",
    marca: p.brand ?? "",
    precio,
    precioLista:
      typeof oferta?.ListPrice === "number" && oferta.ListPrice > 0 ? oferta.ListPrice : null,
    disponible: (oferta?.AvailableQuantity ?? 0) > 0 && precio !== null,
    imagen: item.images?.[0]?.imageUrl ?? null,
    url: p.link ?? `${BASE}/${p.linkText}/p`,
  };
}

export async function buscar(consulta: string, limite = 8): Promise<Opcion[]> {
  const url =
    `${BASE}/api/catalog_system/pub/products/search/` +
    `?ft=${encodeURIComponent(consulta)}&_from=0&_to=${Math.max(0, limite - 1)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; RecibosApp/1.0)" },
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error(`Walmart respondió ${res.status}`);

  const datos = await res.json();
  if (!Array.isArray(datos)) return [];

  const opciones = datos.map(mapear).filter((o): o is Opcion => o !== null);
  // Primero lo disponible, luego de menor a mayor precio.
  return opciones.sort((a, b) => {
    if (a.disponible !== b.disponible) return a.disponible ? -1 : 1;
    return (a.precio ?? Infinity) - (b.precio ?? Infinity);
  });
}

export async function buscarLista(lineas: string[], porItem = 8): Promise<ResultadoItem[]> {
  const entradas = lineas
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map(parsearLinea);

  return Promise.all(
    entradas.map(async ({ consulta, cantidad }) => {
      try {
        return { consulta, cantidad, opciones: await buscar(consulta, porItem) };
      } catch (e: any) {
        return { consulta, cantidad, opciones: [], error: e?.message ?? "Error de búsqueda" };
      }
    })
  );
}

/** Presupuesto estimado: mínimo y máximo entre las opciones disponibles de cada ítem. */
export function estimarPresupuesto(resultados: ResultadoItem[]) {
  let min = 0;
  let max = 0;
  const sinResultados: string[] = [];

  for (const r of resultados) {
    const precios = r.opciones
      .filter((o) => o.disponible && o.precio !== null)
      .map((o) => o.precio as number);
    if (!precios.length) {
      sinResultados.push(r.consulta);
      continue;
    }
    min += Math.min(...precios) * r.cantidad;
    max += Math.max(...precios) * r.cantidad;
  }

  return {
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    sinResultados,
  };
}
