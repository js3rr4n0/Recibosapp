// Escáner de recibos con rotación de modelos y fallback por cuota.
import {
  ANTHROPIC_API_KEY,
  CATEGORIES,
  GEMINI_API_KEY,
  MAX_MODEL_ATTEMPTS,
  getReceiptModels,
} from "./constants";

export interface ScannedItem {
  name: string;
  quantity: number;
  unit_price: number | null;
  total_price: number;
}

export interface ScanResult {
  merchant: string | null;
  address: string | null;
  purchase_date: string | null;
  currency: string;
  category: string;
  total: number;
  items: ScannedItem[];
  model?: string;
}

// Error final: ningún modelo pudo procesar el recibo (o clave inválida).
export class ScannerError extends Error {}
// Error de un modelo concreto (cuota/límite/no disponible): probar el siguiente.
class RetryableModelError extends Error {}

const EXTRACTION_PROMPT = `Eres un asistente que lee tickets y recibos de compra.
Analiza la imagen del recibo y devuelve ÚNICAMENTE un objeto JSON válido, sin texto adicional, con esta estructura exacta:

{
  "merchant": "nombre del comercio o tienda",
  "address": "dirección o ciudad si aparece, si no null",
  "purchase_date": "fecha de la compra en formato YYYY-MM-DD, si no aparece null",
  "currency": "código de moneda de 3 letras, por ejemplo EUR o USD",
  "category": "una de estas categorías: ${CATEGORIES.join(", ")}",
  "total": número con el importe total pagado,
  "items": [
    { "name": "nombre del artículo", "quantity": número, "unit_price": precio por unidad o null, "total_price": precio total de la línea }
  ]
}

Reglas:
- Usa punto decimal para los números (ej. 12.50), nunca coma.
- Si un dato no aparece, usa null (o [] para la lista de artículos).
- Elige la categoría más adecuada según el comercio y los productos.
- No inventes artículos que no estén en el recibo.
- Responde solo con el JSON, sin explicaciones ni bloques de código markdown.`;

function cleanJson(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t
      .split("\n")
      .filter((l) => !l.trim().startsWith("```"))
      .join("\n")
      .trim();
  }
  return t;
}

function toFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const n = parseFloat(String(value).replace(",", ".").replace("€", "").trim());
  return Number.isNaN(n) ? null : n;
}

function normalize(data: any): ScanResult {
  const items: ScannedItem[] = [];
  for (const raw of data.items || []) {
    if (!raw || typeof raw !== "object") continue;
    const name = String(raw.name || "").trim();
    if (!name) continue;
    items.push({
      name,
      quantity: toFloat(raw.quantity) || 1,
      unit_price: toFloat(raw.unit_price),
      total_price: toFloat(raw.total_price) || 0,
    });
  }

  let category = String(data.category || "Otros").trim();
  if (!CATEGORIES.includes(category)) category = "Otros";

  let total = toFloat(data.total);
  if (!total) total = items.reduce((s, it) => s + it.total_price, 0);

  return {
    merchant: data.merchant ? String(data.merchant).trim() : null,
    address: data.address ? String(data.address).trim() : null,
    purchase_date: data.purchase_date || null,
    currency: String(data.currency || "EUR").trim().toUpperCase().slice(0, 8),
    category,
    total: Math.round((total || 0) * 100) / 100,
    items,
  };
}

// ---------- Proveedores ----------
async function geminiGenerate(model: string, imageB64: string, mime: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    contents: [
      {
        parts: [
          { text: EXTRACTION_PROMPT },
          { inline_data: { mime_type: mime, data: imageB64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  };

  let resp: Response;
  try {
    resp = await fetch(`${url}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
  } catch (e) {
    throw new RetryableModelError(`gemini/${model}: error de red`);
  }

  if ([429, 500, 503, 404].includes(resp.status)) {
    throw new RetryableModelError(`gemini/${model}: HTTP ${resp.status}`);
  }
  const text = await resp.text();
  if (resp.status === 400 && text.includes("API_KEY_INVALID")) {
    throw new ScannerError("La clave GEMINI_API_KEY no es válida.");
  }
  if (resp.status !== 200) {
    throw new RetryableModelError(`gemini/${model}: HTTP ${resp.status}`);
  }

  try {
    const data = JSON.parse(text);
    const parts = data.candidates[0].content.parts;
    return parts.map((p: any) => p.text || "").join("");
  } catch {
    throw new RetryableModelError(`gemini/${model}: respuesta sin contenido`);
  }
}

async function anthropicGenerate(model: string, imageB64: string, mime: string): Promise<string> {
  let resp: Response;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mime, data: imageB64 } },
              { type: "text", text: EXTRACTION_PROMPT },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new RetryableModelError(`anthropic/${model}: error de red`);
  }

  if ([429, 500, 503, 529].includes(resp.status)) {
    throw new RetryableModelError(`anthropic/${model}: HTTP ${resp.status}`);
  }
  const text = await resp.text();
  if (resp.status !== 200) {
    throw new RetryableModelError(`anthropic/${model}: HTTP ${resp.status}`);
  }
  const data = JSON.parse(text);
  return (data.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Orquestador ----------
export async function scanReceipt(imageBytes: Buffer, mime: string): Promise<ScanResult> {
  let candidates = getReceiptModels();
  if (candidates.length === 0) {
    throw new ScannerError(
      "No hay ninguna clave de API configurada. Añade GEMINI_API_KEY (o ANTHROPIC_API_KEY) para escanear recibos."
    );
  }

  candidates = shuffle(candidates).slice(0, MAX_MODEL_ATTEMPTS);
  const imageB64 = imageBytes.toString("base64");
  const errors: string[] = [];

  for (const [provider, model] of candidates) {
    try {
      let raw: string;
      if (provider === "gemini") raw = await geminiGenerate(model, imageB64, mime);
      else if (provider === "anthropic") raw = await anthropicGenerate(model, imageB64, mime);
      else continue;

      const result = normalize(JSON.parse(cleanJson(raw)));
      result.model = `${provider}/${model}`;
      return result;
    } catch (e) {
      if (e instanceof ScannerError) throw e;
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  throw new ScannerError(
    "No se pudo escanear el recibo con ningún modelo. Puede que se haya agotado la cuota; inténtalo de nuevo en un momento. (" +
      errors.slice(0, 4).join(" | ") +
      ")"
  );
}
