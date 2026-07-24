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

# Integración con Anthropic para escanear recibos.
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
RECEIPT_MODEL = os.getenv("RECEIPT_MODEL", "claude-sonnet-5").strip()

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
