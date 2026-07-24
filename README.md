# 💰 Recibosapp — Tu asistente económico

Aplicación para gestionar tu dinero: registra **gastos**, **ingresos** y **ahorros**,
y sobre todo **escanea recibos con una foto** para que la app extraiga automáticamente
el comercio, la fecha, los artículos y el total, y lo guarde todo en una base de datos.

![Recibosapp](https://img.shields.io/badge/hecho%20con-FastAPI%20%2B%20SQLite-6366f1)

## ✨ Qué hace

- 📸 **Escaneo de recibos**: haz una foto de un ticket y la app lee automáticamente
  el comercio, el lugar, los artículos, sus precios y el total (usando la visión de Claude).
- 💸 **Gastos e ingresos**: añádelos a mano cuando quieras.
- 🏦 **Ahorros y objetivos**: crea metas de ahorro (ej. "Vacaciones: 1000 €") y ve tu progreso.
- 📊 **Panel de control**: cuánto gastas, en qué categorías, en qué comercios y tu balance.
- 🗄️ **Todo en una base de datos** (SQLite) en tu propio equipo.
- 📱 **Diseño móvil**: pensada para usarse desde el teléfono y hacer la foto al momento.

## 🚀 Puesta en marcha

### Requisitos
- Python 3.10 o superior.
- (Opcional pero recomendado) Una clave de API de Anthropic para el escaneo de recibos:
  consíguela en <https://console.anthropic.com/>.

### 1. Configura tu clave (para el escaneo automático)

```bash
cp .env.example .env
# Edita .env y pega tu clave en ANTHROPIC_API_KEY=...
```

> Sin clave, la app funciona igual para registrar gastos, ingresos y ahorros a mano;
> solo se desactiva el escaneo automático de fotos.

### 2. Arranca la app

**Opción fácil (Linux/macOS):**

```bash
./run.sh
```

**Opción manual:**

```bash
python3 -m venv .venv
source .venv/bin/activate        # En Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

### 3. Abre la app

Ve a <http://localhost:8000> en tu navegador.
Para usarla desde el móvil en tu red local, arranca con
`uvicorn backend.main:app --host 0.0.0.0 --port 8000` y entra desde el teléfono
a `http://IP-DE-TU-ORDENADOR:8000`.

## 🧩 Cómo funciona

```
┌─────────────┐     foto      ┌──────────────┐   JSON    ┌──────────────┐
│  Navegador  │ ────────────► │   FastAPI    │ ────────► │ Claude Visión│
│ (móvil/web) │ ◄──────────── │  (backend)   │ ◄──────── │  (escaneo)   │
└─────────────┘   resultado   └──────┬───────┘   datos   └──────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │   SQLite DB  │
                              │ transacciones│
                              │   recibos    │
                              │   artículos  │
                              │   objetivos  │
                              └──────────────┘
```

Al subir la foto de un recibo:
1. Se guarda la imagen y se envía al modelo de visión.
2. El modelo devuelve los datos estructurados (comercio, fecha, artículos, total, categoría).
3. Se crea el **recibo** con sus **artículos** y, automáticamente, un **gasto** asociado.

## 🗂️ Estructura del proyecto

```
Recibosapp/
├── backend/
│   ├── main.py             # API FastAPI y servidor de la web
│   ├── config.py           # Configuración y variables de entorno
│   ├── database.py         # Conexión SQLAlchemy
│   ├── models.py           # Tablas de la base de datos
│   ├── schemas.py          # Validación de datos (Pydantic)
│   ├── crud.py             # Operaciones de base de datos y resúmenes
│   └── receipt_scanner.py  # Escaneo de recibos con Claude
├── frontend/
│   ├── index.html          # Interfaz
│   ├── styles.css          # Estilos (tema oscuro, móvil)
│   └── app.js              # Lógica del cliente
├── requirements.txt
├── run.sh
└── .env.example
```

## 🔌 API principal

| Método | Ruta                             | Descripción                                  |
|--------|----------------------------------|----------------------------------------------|
| GET    | `/api/summary`                   | Resumen: totales, categorías, comercios      |
| GET    | `/api/transactions`              | Lista de movimientos                         |
| POST   | `/api/transactions`              | Añadir gasto/ingreso/ahorro                  |
| DELETE | `/api/transactions/{id}`         | Eliminar un movimiento                       |
| POST   | `/api/receipts/scan`             | Subir foto y escanear un recibo              |
| GET    | `/api/receipts/{id}`             | Detalle de un recibo                         |
| GET    | `/api/goals`                     | Objetivos de ahorro                          |
| POST   | `/api/goals`                     | Crear objetivo                               |
| POST   | `/api/goals/{id}/contribute`     | Aportar a un objetivo                        |

La documentación interactiva de la API está en <http://localhost:8000/docs>.

## 🔒 Privacidad

Todos tus datos se guardan **localmente** en el archivo `data/recibos.db`.
Las imágenes de los recibos solo se envían a la API de Anthropic para su lectura.

## 🛣️ Ideas para el futuro

- Autenticación de usuario y multiusuario.
- Exportar a CSV/Excel.
- Presupuestos mensuales con alertas.
- Gráficos de evolución en el tiempo.
- App móvil nativa (PWA instalable).
