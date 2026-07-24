"""Punto de entrada para Vercel (función serverless de Python).

Vercel detecta la variable ASGI `app` y la ejecuta para cada petición a /api/*.
"""
import os
import sys

# Asegura que el paquete `backend` (en la raíz del proyecto) sea importable.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.main import app  # noqa: E402

# Vercel usa esta variable `app` como aplicación ASGI.
__all__ = ["app"]
