# 💰 Recibosapp — Tu asistente económico

Aplicación para gestionar tu dinero: registra **gastos**, **ingresos** y **ahorros**,
y sobre todo **escanea recibos con una foto** para que la app extraiga automáticamente
el comercio, la fecha, los artículos y el total, y lo guarde todo en una base de datos.

Pensada para desplegarse en **Vercel** con base de datos **Neon (Postgres)**.

![Stack](https://img.shields.io/badge/stack-FastAPI%20%2B%20Vercel%20%2B%20Neon-6366f1)

## ✨ Qué hace

- 📸 **Escaneo de recibos**: haz una foto de un ticket y la app lee automáticamente
  el comercio, el lugar, los artículos, sus precios y el total (usando la visión de Claude).
- 💸 **Gastos e ingresos**: añádelos a mano cuando quieras.
- 🏦 **Ahorros y objetivos**: crea metas de ahorro (ej. "Vacaciones: 1000 €") y ve tu progreso.
- 📊 **Panel de control**: cuánto gastas, en qué categorías, en qué comercios y tu balance.
- 🗄️ **Todo en base de datos** (Neon/Postgres en producción, SQLite en local).
- 📱 **Diseño móvil**: pensada para usarse desde el teléfono y hacer la foto al momento.

---

## 🚀 Desplegar en Vercel + Neon (producción)

### 1. Crea la base de datos en Neon

1. Entra en <https://neon.tech> y crea un proyecto (el plan gratuito basta).
2. Copia la **cadena de conexión** (Connection string). Usa la variante **"Pooled connection"**.
   Tendrá esta forma:
   ```
   postgresql://usuario:clave@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
   ```

### 2. Consigue tu clave de Anthropic (para escanear recibos)

Créala en <https://console.anthropic.com/> → API Keys.

### 3. Despliega en Vercel

1. Sube este repositorio a GitHub (ver abajo) e impórtalo en <https://vercel.com/new>.
2. Vercel detecta automáticamente la configuración (`vercel.json`, la función en
   `api/` y el frontend en `public/`). No hace falta tocar los ajustes de build.
3. En **Settings → Environment Variables**, añade:

   | Variable            | Valor                                                    |
   |---------------------|----------------------------------------------------------|
   | `DATABASE_URL`      | La cadena de conexión de Neon (pooled)                   |
   | `ANTHROPIC_API_KEY` | Tu clave de Anthropic                                    |
   | `DEFAULT_CURRENCY`  | `EUR` (o la que uses)                                    |
   | `RECEIPT_MODEL`     | `claude-sonnet-5` (opcional)                             |

4. Pulsa **Deploy**. Las tablas de la base de datos se crean solas en el primer arranque.

¡Listo! Abre la URL que te da Vercel desde el móvil y empieza a escanear recibos.

---

## 💻 Ejecutar en local (desarrollo)

En local puedes usar SQLite sin configurar nada (deja `DATABASE_URL` vacío).

```bash
cp .env.example .env        # añade tu ANTHROPIC_API_KEY para el escaneo
./run.sh                    # abre http://localhost:8000
```

**Manual:**

```bash
python3 -m venv .venv
source .venv/bin/activate        # En Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

> Sin `ANTHROPIC_API_KEY`, la app funciona igual para registrar gastos, ingresos y
> ahorros a mano; solo se desactiva el escaneo automático de fotos.
> Si defines `DATABASE_URL` con tu cadena de Neon, en local usarás la misma base
> de datos que en producción.

---

## 🧩 Cómo funciona

```
┌─────────────┐     foto      ┌──────────────┐   JSON    ┌──────────────┐
│  Navegador  │ ────────────► │  Función     │ ────────► │ Claude Visión│
│ (móvil/web) │ ◄──────────── │  Python/API  │ ◄──────── │  (escaneo)   │
└─────────────┘   resultado   └──────┬───────┘   datos   └──────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │  Neon        │
                              │  (Postgres)  │
                              │ transacciones│
                              │   recibos    │
                              │   artículos  │
                              │   objetivos  │
                              └──────────────┘
```

Al subir la foto de un recibo:
1. El navegador **comprime** la imagen (para respetar el límite de 4.5 MB de Vercel).
2. La función Python la envía al modelo de visión.
3. El modelo devuelve los datos estructurados (comercio, fecha, artículos, total, categoría).
4. Se crea el **recibo** (con su imagen y sus **artículos**) y, automáticamente, un **gasto** asociado.

## 🗂️ Estructura del proyecto

```
Recibosapp/
├── api/
│   └── index.py            # Punto de entrada de la función serverless (Vercel)
├── backend/
│   ├── main.py             # API FastAPI y servidor de la web
│   ├── config.py           # Configuración y variables de entorno
│   ├── database.py         # Conexión SQLAlchemy (SQLite o Postgres/Neon)
│   ├── models.py           # Tablas de la base de datos
│   ├── schemas.py          # Validación de datos (Pydantic)
│   ├── crud.py             # Operaciones de base de datos y resúmenes
│   └── receipt_scanner.py  # Escaneo de recibos con Claude
├── public/                 # Frontend estático (servido por la CDN de Vercel)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── vercel.json             # Configuración de Vercel
├── requirements.txt
├── run.sh                  # Arranque en local
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
| GET    | `/api/receipts/{id}/image`       | Imagen del recibo                            |
| GET    | `/api/goals`                     | Objetivos de ahorro                          |
| POST   | `/api/goals`                     | Crear objetivo                               |
| POST   | `/api/goals/{id}/contribute`     | Aportar a un objetivo                        |

En local, la documentación interactiva está en <http://localhost:8000/docs>.

## 🔒 Privacidad

Tus datos se guardan en **tu** base de datos de Neon. Las imágenes de los recibos
solo se envían a la API de Anthropic para su lectura.

## 🛣️ Ideas para el futuro

- Autenticación de usuario y multiusuario.
- Exportar a CSV/Excel.
- Presupuestos mensuales con alertas.
- Gráficos de evolución en el tiempo.
- App móvil nativa (PWA instalable).
