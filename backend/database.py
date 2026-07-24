"""Configuración de SQLAlchemy: motor, sesión y clase base.

Soporta SQLite (local) y Postgres/Neon (producción en Vercel).
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

from .config import DATABASE_URL, IS_SQLITE

if IS_SQLITE:
    # check_same_thread=False es necesario para usar SQLite con FastAPI.
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    # En entornos serverless (Vercel) cada invocación es efímera: usamos
    # NullPool para no reutilizar conexiones muertas a través del pooler de
    # Neon, y pre_ping para descartar conexiones caídas.
    engine = create_engine(
        DATABASE_URL,
        poolclass=NullPool,
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependencia de FastAPI que entrega una sesión de base de datos."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
