"""Configuración central de la aplicación.

Lee las variables de entorno (opcionalmente desde un archivo .env) y expone
los valores usados en el resto de la app.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# Carga las variables definidas en .env si el archivo existe.
load_dotenv()

# Directorios base del proyecto.
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"

# Nos aseguramos de que las carpetas de datos existan.
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Base de datos SQLite (un único archivo local).
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'recibos.db'}")

# Integración con Anthropic para escanear recibos.
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
RECEIPT_MODEL = os.getenv("RECEIPT_MODEL", "claude-sonnet-5").strip()

# Moneda por defecto de la aplicación.
DEFAULT_CURRENCY = os.getenv("DEFAULT_CURRENCY", "EUR").strip()

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
