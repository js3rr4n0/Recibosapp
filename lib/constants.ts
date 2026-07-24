// Configuración y constantes compartidas.

export const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY?.trim() || "EUR";

// Categorías sugeridas para clasificar los gastos.
export const CATEGORIES = [
  "Alimentación",
  "Restaurantes",
  "Transporte",
  "Hogar",
  "Salud",
  "Ocio",
  "Ropa",
  "Tecnología",
  "Educación",
  "Suscripciones",
  "Viajes",
  "Otros",
];

// Tamaño máximo aceptado para la imagen de un recibo (bytes).
export const MAX_IMAGE_BYTES = 4_000_000;

// Modelos de Gemini a rotar. Cada familia tiene su propia cuota gratuita, así
// que rotar entre ellos multiplica los recibos que puedes escanear gratis.
export const DEFAULT_GEMINI_MODELS = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

// Modelos de Anthropic (solo se usan si hay ANTHROPIC_API_KEY).
export const DEFAULT_ANTHROPIC_MODELS = ["claude-sonnet-5", "claude-haiku-4-5-20251001"];

// Nº máximo de modelos que se prueban por recibo antes de rendirse.
export const MAX_MODEL_ATTEMPTS = 8;

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() || "";
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() || "";

export function scannerEnabled(): boolean {
  return Boolean(GEMINI_API_KEY || ANTHROPIC_API_KEY);
}

// Lista priorizada de [proveedor, modelo]. Se puede sobreescribir con la
// variable RECEIPT_MODELS (formato "proveedor:modelo" separado por comas).
export function getReceiptModels(): Array<[string, string]> {
  const override = process.env.RECEIPT_MODELS?.trim() || "";
  let candidates: Array<[string, string]> = [];

  if (override) {
    for (const entry of override.split(",")) {
      const [provider, model] = entry.split(":").map((s) => s.trim());
      if (provider && model) candidates.push([provider.toLowerCase(), model]);
    }
  } else {
    if (GEMINI_API_KEY) {
      candidates.push(...DEFAULT_GEMINI_MODELS.map((m) => ["gemini", m] as [string, string]));
    }
    if (ANTHROPIC_API_KEY) {
      candidates.push(
        ...DEFAULT_ANTHROPIC_MODELS.map((m) => ["anthropic", m] as [string, string])
      );
    }
  }

  const hasKey: Record<string, boolean> = {
    gemini: Boolean(GEMINI_API_KEY),
    anthropic: Boolean(ANTHROPIC_API_KEY),
  };
  return candidates.filter(([p]) => hasKey[p]);
}
