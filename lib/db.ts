// Conexión a Neon (Postgres) y creación del esquema.
import { neon, NeonQueryFunction } from "@neondatabase/serverless";

// El cliente se construye de forma perezosa (lazy): así el build de Next.js
// no falla cuando DATABASE_URL todavía no está disponible.
let _sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL no está configurada. Añádela en las variables de entorno de Vercel."
      );
    }
    // cache: "no-store" evita que Next.js cachee las consultas del driver de
    // Neon (que van por HTTP fetch). Sin esto, Next guarda el resultado de
    // forma persistente y devuelve datos obsoletos.
    _sql = neon(url, { fetchOptions: { cache: "no-store" } });
  }
  return _sql;
}

// Cliente SQL HTTP de Neon (ideal para funciones serverless, sin pool).
// Se usa como plantilla etiquetada: sql`SELECT ...`.
export const sql: NeonQueryFunction<false, false> = ((...args: any[]) =>
  (getSql() as any)(...args)) as NeonQueryFunction<false, false>;

// Cacheamos que el esquema ya existe para no ejecutar los CREATE en cada
// invocación caliente de la función.
let schemaReady = false;

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS receipts (
      id SERIAL PRIMARY KEY,
      merchant TEXT,
      address TEXT,
      purchase_date DATE,
      total DOUBLE PRECISION DEFAULT 0,
      currency TEXT DEFAULT 'EUR',
      category TEXT DEFAULT 'Otros',
      image_b64 TEXT,
      image_mime TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS receipt_items (
      id SERIAL PRIMARY KEY,
      receipt_id INTEGER REFERENCES receipts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      quantity DOUBLE PRECISION DEFAULT 1,
      unit_price DOUBLE PRECISION,
      total_price DOUBLE PRECISION DEFAULT 0
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      currency TEXT DEFAULT 'EUR',
      category TEXT DEFAULT 'Otros',
      merchant TEXT,
      note TEXT,
      occurred_on DATE DEFAULT CURRENT_DATE,
      source TEXT DEFAULT 'manual',
      receipt_id INTEGER REFERENCES receipts(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS savings_goals (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      target_amount DOUBLE PRECISION DEFAULT 0,
      current_amount DOUBLE PRECISION DEFAULT 0,
      currency TEXT DEFAULT 'EUR',
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  // Reconciliación idempotente: si ya existían tablas de una versión anterior
  // (p. ej. con otro esquema), añadimos las columnas que falten y fijamos los
  // valores por defecto para que los INSERT nunca fallen. Es seguro ejecutarlo
  // siempre: sobre una base nueva son operaciones sin efecto.
  await sql`ALTER TABLE receipts ADD COLUMN IF NOT EXISTS image_b64 TEXT`;
  await sql`ALTER TABLE receipts ADD COLUMN IF NOT EXISTS image_mime TEXT`;
  await sql`ALTER TABLE receipts ALTER COLUMN total SET DEFAULT 0`;
  await sql`ALTER TABLE receipts ALTER COLUMN created_at SET DEFAULT now()`;
  await sql`ALTER TABLE transactions ALTER COLUMN created_at SET DEFAULT now()`;
  await sql`ALTER TABLE transactions ALTER COLUMN occurred_on SET DEFAULT CURRENT_DATE`;
  await sql`ALTER TABLE savings_goals ALTER COLUMN current_amount SET DEFAULT 0`;
  await sql`ALTER TABLE savings_goals ALTER COLUMN target_amount SET DEFAULT 0`;
  await sql`ALTER TABLE savings_goals ALTER COLUMN created_at SET DEFAULT now()`;

  schemaReady = true;
}
