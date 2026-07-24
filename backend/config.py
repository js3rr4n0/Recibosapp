"""Configuración central de la aplicación.

Lee las variables de entorno (opcionalmente desde un archivo .env) y expone
los valores usados en el resto de la app. Funciona tanto en local (SQLite)
como en Vercel + Neon (Postgres).
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# Carga las variables definidas en .env si el archivo existe (solo en local;
# en Vercel las variables vienen del panel del proyecto).
load_dotenv()

# Directorio base del proyecto.
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


def _resolve_database_url() -> str:
    """Determina la URL de la base de datos.

    - Si hay DATABASE_URL (Neon/Postgres en Vercel), la usa.
    - Si no, cae a un SQLite local para desarrollo.
    """
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        # Desarrollo local: SQLite en la carpeta data/.
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{DATA_DIR / 'recibos.db'}"

    # Neon y otros proveedores a veces entregan "postgres://"; SQLAlchemy 2.x
    # requiere el esquema "postgresql://".
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


DATABASE_URL = _resolve_database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")

# --- Escaneo de recibos (visión) ---
# Se admiten dos proveedores. Puedes configurar uno o los dos: la app rota
# entre todos los modelos disponibles y hace fallback cuando uno se queda sin
# cuota, para maximizar el número de recibos que puedes escanear gratis.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()

# Modelos de Gemini a rotar (todos admiten visión y tienen cuota gratuita
# separada, así que rotar entre ellos multiplica los recibos que puedes
# escanear gratis). Los alias "-latest" apuntan siempre al modelo estable
# vigente, y cada familia tiene su propia cuota diaria.
DEFAULT_GEMINI_MODELS = [
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
]

# Modelos de Anthropic (solo se usan si hay ANTHROPIC_API_KEY).
DEFAULT_ANTHROPIC_MODELS = [
    "claude-sonnet-5",
    "claude-haiku-4-5-20251001",
]

# Nº máximo de modelos que se prueban por recibo antes de rendirse. Los fallos
# por cuota (429) o modelo no disponible (404) son casi instantáneos, así que
# probar toda la lista sigue siendo rápido y garantiza el fallback completo.
MAX_MODEL_ATTEMPTS = 8


def get_receipt_models() -> list[tuple[str, str]]:
    """Devuelve la lista priorizada de (proveedor, modelo) a usar.

    Se puede sobreescribir con la variable RECEIPT_MODELS, una lista separada
    por comas con el formato "proveedor:modelo", por ejemplo:
        gemini:gemini-2.0-flash,gemini:gemini-2.5-flash,anthropic:claude-sonnet-5
    Si no se define, se construye a partir de las claves disponibles.
    """
    override = os.getenv("RECEIPT_MODELS", "").strip()
    candidates: list[tuple[str, str]] = []
    if override:
        for entry in override.split(","):
            entry = entry.strip()
            if not entry:
                continue
            provider, _, model = entry.partition(":")
            provider, model = provider.strip().lower(), model.strip()
            if provider and model:
                candidates.append((provider, model))
    else:
        if GEMINI_API_KEY:
            candidates += [("gemini", m) for m in DEFAULT_GEMINI_MODELS]
        if ANTHROPIC_API_KEY:
            candidates += [("anthropic", m) for m in DEFAULT_ANTHROPIC_MODELS]

    # Solo dejamos los proveedores para los que hay clave configurada.
    keyed = {"gemini": bool(GEMINI_API_KEY), "anthropic": bool(ANTHROPIC_API_KEY)}
    return [(p, m) for (p, m) in candidates if keyed.get(p)]


def scanner_enabled() -> bool:
    """Indica si el escaneo automático está disponible."""
    return bool(GEMINI_API_KEY or ANTHROPIC_API_KEY)

# Moneda por defecto de la aplicación.
DEFAULT_CURRENCY = os.getenv("DEFAULT_CURRENCY", "EUR").strip()

# Tamaño máximo aceptado para la imagen de un recibo (en bytes).
# Vercel limita el cuerpo de las funciones serverless a ~4.5 MB.
MAX_IMAGE_BYTES = 4_000_000

# Categorías sugeridas para clasificar los gastos.
CATEGORIES = [
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
]
