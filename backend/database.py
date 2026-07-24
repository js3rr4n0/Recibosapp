"""Configuración de SQLAlchemy: motor, sesión y clase base."""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import DATABASE_URL

# check_same_thread=False es necesario para usar SQLite con FastAPI.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
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
