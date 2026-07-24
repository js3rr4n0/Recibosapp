#!/usr/bin/env bash
# Script para arrancar Recibosapp fácilmente.
set -e

cd "$(dirname "$0")"

# Crea el entorno virtual si no existe.
if [ ! -d ".venv" ]; then
  echo "📦 Creando entorno virtual..."
  python3 -m venv .venv
fi

# Activa el entorno virtual.
# shellcheck disable=SC1091
source .venv/bin/activate

# Instala dependencias.
echo "📥 Instalando dependencias..."
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

# Avisa si falta el archivo .env.
if [ ! -f ".env" ]; then
  echo "⚠️  No se encontró .env. Copia .env.example a .env y añade tu ANTHROPIC_API_KEY"
  echo "    para activar el escaneo de recibos. La app funcionará igualmente para gastos manuales."
fi

echo "🚀 Iniciando Recibosapp en http://localhost:8000"
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
