"""Escáner de recibos.

Envía la foto del recibo al modelo de visión de Claude y devuelve los datos
estructurados: comercio, dirección, fecha, artículos, total y categoría.
"""
import base64
import json
from typing import Any

from .config import ANTHROPIC_API_KEY, CATEGORIES, RECEIPT_MODEL

# Prompt que le pide al modelo devolver EXCLUSIVAMENTE un JSON con los datos.
_EXTRACTION_PROMPT = f"""Eres un asistente que lee tickets y recibos de compra.
Analiza la imagen del recibo y devuelve ÚNICAMENTE un objeto JSON válido, sin texto adicional, con esta estructura exacta:

{{
  "merchant": "nombre del comercio o tienda",
  "address": "dirección o ciudad si aparece, si no null",
  "purchase_date": "fecha de la compra en formato YYYY-MM-DD, si no aparece null",
  "currency": "código de moneda de 3 letras, por ejemplo EUR o USD",
  "category": "una de estas categorías: {', '.join(CATEGORIES)}",
  "total": número con el importe total pagado,
  "items": [
    {{
      "name": "nombre del artículo",
      "quantity": número (por defecto 1),
      "unit_price": precio por unidad o null,
      "total_price": precio total de esa línea
    }}
  ]
}}

Reglas:
- Usa punto decimal para los números (ej. 12.50), nunca coma.
- Si un dato no aparece en el recibo, usa null (o [] para la lista de artículos).
- Elige la categoría más adecuada según el tipo de comercio y los productos.
- No inventes artículos que no estén en el recibo.
- Responde solo con el JSON, sin explicaciones ni bloques de código markdown."""


class ScannerError(Exception):
    """Error controlado durante el escaneo de un recibo."""


def _media_type(filename: str, content_type: str | None) -> str:
    """Determina el tipo de imagen para la API a partir del nombre/tipo."""
    if content_type and content_type.startswith("image/"):
        return content_type
    lower = filename.lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".gif"):
        return "image/gif"
    return "image/jpeg"


def _clean_json(text: str) -> str:
    """Quita posibles vallas de código markdown alrededor del JSON."""
    text = text.strip()
    if text.startswith("```"):
        # Elimina la primera línea (```json) y la última (```).
        lines = text.splitlines()
        lines = [ln for ln in lines if not ln.strip().startswith("```")]
        text = "\n".join(lines).strip()
    return text


def scan_receipt(image_bytes: bytes, filename: str, content_type: str | None) -> dict[str, Any]:
    """Escanea un recibo y devuelve un diccionario con los datos extraídos.

    Lanza ScannerError si no hay clave de API o si la respuesta no es válida.
    """
    if not ANTHROPIC_API_KEY:
        raise ScannerError(
            "No hay clave de API configurada. Añade ANTHROPIC_API_KEY en el archivo .env "
            "para poder escanear recibos automáticamente."
        )

    # Importación diferida para que la app arranque aunque el paquete no esté.
    try:
        from anthropic import Anthropic
    except ImportError as exc:  # pragma: no cover
        raise ScannerError("El paquete 'anthropic' no está instalado.") from exc

    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    encoded = base64.standard_b64encode(image_bytes).decode("utf-8")
    media_type = _media_type(filename, content_type)

    try:
        message = client.messages.create(
            model=RECEIPT_MODEL,
            max_tokens=2048,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": encoded,
                            },
                        },
                        {"type": "text", "text": _EXTRACTION_PROMPT},
                    ],
                }
            ],
        )
    except Exception as exc:  # pragma: no cover - depende de la red/API
        raise ScannerError(f"Error al contactar con la API de visión: {exc}") from exc

    raw_text = "".join(
        block.text for block in message.content if getattr(block, "type", None) == "text"
    )

    try:
        data = json.loads(_clean_json(raw_text))
    except json.JSONDecodeError as exc:
        raise ScannerError(
            "El modelo no devolvió un JSON válido. Inténtalo de nuevo con una foto más nítida."
        ) from exc

    return _normalize(data)


def _to_float(value: Any) -> float | None:
    """Convierte un valor a float de forma tolerante (acepta comas)."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace(",", ".").replace("€", "").strip())
    except ValueError:
        return None


def _normalize(data: dict[str, Any]) -> dict[str, Any]:
    """Da forma consistente a los datos devueltos por el modelo."""
    items = []
    for raw in data.get("items") or []:
        if not isinstance(raw, dict):
            continue
        name = str(raw.get("name") or "").strip()
        if not name:
            continue
        items.append(
            {
                "name": name,
                "quantity": _to_float(raw.get("quantity")) or 1.0,
                "unit_price": _to_float(raw.get("unit_price")),
                "total_price": _to_float(raw.get("total_price")) or 0.0,
            }
        )

    category = str(data.get("category") or "Otros").strip()
    if category not in CATEGORIES:
        category = "Otros"

    total = _to_float(data.get("total"))
    if not total:
        # Si no hay total, lo calculamos sumando los artículos.
        total = sum(it["total_price"] for it in items)

    return {
        "merchant": (str(data.get("merchant")).strip() if data.get("merchant") else None),
        "address": (str(data.get("address")).strip() if data.get("address") else None),
        "purchase_date": data.get("purchase_date") or None,
        "currency": (str(data.get("currency") or "EUR").strip().upper()[:8]),
        "category": category,
        "total": round(total or 0.0, 2),
        "items": items,
    }
