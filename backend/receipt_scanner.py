"""Escáner de recibos con rotación de modelos y fallback por cuota.

Envía la foto del recibo a un modelo de visión y devuelve los datos
estructurados: comercio, dirección, fecha, artículos, total y categoría.

Para maximizar los recibos que puedes escanear gratis, la app **rota** entre
todos los modelos disponibles (por defecto, todos los flash de Gemini y, si
hay clave, también Claude) y hace **fallback** automático al siguiente cuando
uno se queda sin cuota o falla.
"""
import base64
import json
import random
from typing import Any

import httpx

from .config import (
    ANTHROPIC_API_KEY,
    CATEGORIES,
    GEMINI_API_KEY,
    MAX_MODEL_ATTEMPTS,
    get_receipt_models,
)

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
    """Error final del escaneo (ningún modelo pudo procesar el recibo)."""


class _RetryableModelError(Exception):
    """Un modelo concreto falló (cuota, límite, no disponible): probar el siguiente."""


# ---------- Utilidades ----------
def _media_type(filename: str, content_type: str | None) -> str:
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
        lines = [ln for ln in text.splitlines() if not ln.strip().startswith("```")]
        text = "\n".join(lines).strip()
    return text


# ---------- Proveedores ----------
def _gemini_generate(model: str, image_b64: str, media_type: str) -> str:
    """Llama a la API de Gemini y devuelve el texto (JSON) de la respuesta."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": _EXTRACTION_PROMPT},
                    {"inline_data": {"mime_type": media_type, "data": image_b64}},
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
        },
    }
    try:
        resp = httpx.post(
            url, params={"key": GEMINI_API_KEY}, json=payload, timeout=25.0
        )
    except httpx.HTTPError as exc:
        raise _RetryableModelError(f"gemini/{model}: error de red ({exc})") from exc

    # Cuota agotada, límite de peticiones o modelo saturado/no encontrado:
    # se reintenta con el siguiente modelo.
    if resp.status_code in (429, 500, 503, 404):
        raise _RetryableModelError(f"gemini/{model}: HTTP {resp.status_code}")
    if resp.status_code == 400 and "API_KEY_INVALID" in resp.text:
        raise ScannerError("La clave GEMINI_API_KEY no es válida.")
    if resp.status_code != 200:
        raise _RetryableModelError(f"gemini/{model}: HTTP {resp.status_code} {resp.text[:120]}")

    data = resp.json()
    try:
        parts = data["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts)
    except (KeyError, IndexError) as exc:
        # Respuesta bloqueada por seguridad o vacía: probar otro modelo.
        raise _RetryableModelError(f"gemini/{model}: respuesta sin contenido") from exc


def _anthropic_generate(model: str, image_b64: str, media_type: str) -> str:
    """Llama a la API de Anthropic (Claude) y devuelve el texto de la respuesta."""
    try:
        from anthropic import Anthropic
    except ImportError as exc:  # pragma: no cover
        raise _RetryableModelError("anthropic no instalado") from exc

    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    try:
        message = client.messages.create(
            model=model,
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
                                "data": image_b64,
                            },
                        },
                        {"type": "text", "text": _EXTRACTION_PROMPT},
                    ],
                }
            ],
        )
    except Exception as exc:  # pragma: no cover - depende de la red/API
        raise _RetryableModelError(f"anthropic/{model}: {exc}") from exc

    return "".join(
        b.text for b in message.content if getattr(b, "type", None) == "text"
    )


# ---------- Orquestador ----------
def scan_receipt(image_bytes: bytes, filename: str, content_type: str | None) -> dict[str, Any]:
    """Escanea un recibo probando varios modelos en orden aleatorio.

    Rota entre los modelos disponibles (para repartir la cuota) y hace fallback
    al siguiente si uno falla. Lanza ScannerError solo si ninguno funciona.
    """
    candidates = get_receipt_models()
    if not candidates:
        raise ScannerError(
            "No hay ninguna clave de API configurada. Añade GEMINI_API_KEY "
            "(o ANTHROPIC_API_KEY) para poder escanear recibos automáticamente."
        )

    # Barajamos para repartir la carga entre modelos y limitamos los intentos.
    random.shuffle(candidates)
    candidates = candidates[:MAX_MODEL_ATTEMPTS]

    media_type = _media_type(filename, content_type)
    image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    errors: list[str] = []
    for provider, model in candidates:
        try:
            if provider == "gemini":
                raw = _gemini_generate(model, image_b64, media_type)
            elif provider == "anthropic":
                raw = _anthropic_generate(model, image_b64, media_type)
            else:
                continue
            data = json.loads(_clean_json(raw))
            result = _normalize(data)
            result["_model"] = f"{provider}/{model}"
            return result
        except ScannerError:
            raise  # Error definitivo (p. ej. clave inválida): no seguir probando.
        except _RetryableModelError as exc:
            errors.append(str(exc))
        except json.JSONDecodeError:
            errors.append(f"{provider}/{model}: respuesta no válida (no era JSON)")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{provider}/{model}: {exc}")

    raise ScannerError(
        "No se pudo escanear el recibo con ningún modelo disponible. "
        "Puede que se haya agotado la cuota; inténtalo de nuevo en un momento. "
        f"(Detalles: {' | '.join(errors[:4])})"
    )


# ---------- Normalización ----------
def _to_float(value: Any) -> float | None:
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
