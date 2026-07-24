# 💰 Recibosapp — Tu asistente económico

Aplicación para gestionar tu dinero: registra **gastos**, **ingresos** y **ahorros**,
y sobre todo **escanea recibos con una foto** para que la app extraiga automáticamente
el comercio, el lugar, los artículos y el total, y lo guarde todo en una base de datos.

Construida con **Next.js** y desplegable en **Vercel** con base de datos **Neon (Postgres)**.

![Stack](https://img.shields.io/badge/stack-Next.js%20%2B%20Vercel%20%2B%20Neon-000000)

## ✨ Qué hace

- 📸 **Escaneo de recibos**: haz una foto de un ticket y la app lee automáticamente
  el comercio, el lugar, los artículos, sus precios y el total.
- 🔄 **Rotación de modelos**: usa varios modelos de visión de Gemini y va rotando
  entre ellos; si uno se queda sin cuota, salta al siguiente automáticamente, para
  que puedas escanear el máximo de recibos gratis.
- 💸 **Gastos e ingresos**: añádelos a mano cuando quieras.
- 🏦 **Ahorros y objetivos**: crea metas (ej. "Vacaciones: 1000 €") y ve tu progreso.
- 📊 **Panel de control**: cuánto gastas, en qué categorías, en qué comercios y tu balance.
- 🗄️ **Todo en Neon (Postgres)**, incluida la imagen del recibo.
- 📱 **Diseño móvil**: pensada para usarse desde el teléfono.

## 🚀 Desplegar en Vercel + Neon

### 1. Base de datos en Neon
Crea un proyecto en <https://neon.tech> y copia la **connection string** (variante *pooled*).

### 2. Clave de Gemini (para escanear)
Créala en <https://aistudio.google.com/apikey>.

### 3. Vercel
1. Importa este repositorio en <https://vercel.com/new>. Vercel detecta Next.js solo.
2. En **Settings → Environment Variables**, añade:

   | Variable            | Valor                                                 |
   |---------------------|-------------------------------------------------------|
   | `DATABASE_URL`      | La connection string de Neon (pooled, con `sslmode=require`) |
   | `GEMINI_API_KEY`    | Tu clave de Google AI Studio                          |
   | `DEFAULT_CURRENCY`  | `EUR`, `USD`, `CRC`, `MXN`… (la que uses)             |
   | `ANTHROPIC_API_KEY` | *(opcional)* para añadir modelos de Claude a la rotación |
   | `RECEIPT_MODELS`    | *(opcional)* fija el orden de modelos a mano          |

3. **Deploy**. Las tablas se crean solas en la primera petición.

> El esquema se autorepara: si la base ya tenía tablas de otra versión, la app
> añade las columnas que falten sin perder datos.

## 💻 Ejecutar en local

```bash
npm install
# Crea un archivo .env.local con DATABASE_URL, GEMINI_API_KEY y DEFAULT_CURRENCY
npm run dev            # http://localhost:3000
```

Necesitas una `DATABASE_URL` de Neon (o cualquier Postgres) también en local.

## 🧩 Cómo funciona

```
┌─────────────┐   foto     ┌────────────────────┐   fetch    ┌──────────────┐
│  Navegador  │ ─────────► │  Route Handler     │ ─────────► │ Gemini (rota │
│ (móvil/web) │ ◄───────── │  /api/receipts/scan│ ◄───────── │  entre modelos)│
└─────────────┘  resultado └─────────┬──────────┘   datos    └──────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │  Neon        │
                              │  (Postgres)  │
                              └──────────────┘
```

Al subir la foto: el navegador la **comprime** (para respetar el límite de Vercel),
la función la manda a un modelo de visión, y con los datos crea el **recibo** (con
su imagen y artículos) y un **gasto** asociado, todo en Neon.

## 🗂️ Estructura

```
Recibosapp/
├── app/
│   ├── page.tsx            # Interfaz (React, cliente)
│   ├── layout.tsx
│   ├── globals.css
│   └── api/                # Route Handlers (backend)
│       ├── config/         · summary/
│       ├── transactions/   · transactions/[id]/
│       ├── receipts/       · receipts/scan · receipts/[id] · receipts/[id]/image
│       └── goals/          · goals/[id]/contribute
├── lib/
│   ├── db.ts               # Conexión Neon + creación/reparación del esquema
│   ├── scanner.ts          # Escaneo con rotación de modelos y fallback
│   └── constants.ts        # Categorías, modelos, configuración
├── package.json
└── next.config.js
```

## 🔒 Privacidad

Tus datos se guardan en **tu** base de datos de Neon. Las imágenes de los recibos
solo se envían a la API de Gemini para su lectura.
