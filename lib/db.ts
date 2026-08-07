// ── Database adapter ─────────────────────────────────────────────────
// Production: Neon Postgres over HTTP (DATABASE_URL set).
// Local dev:  PGlite — a real embedded Postgres stored in .data/ — so the
// exact same SQL (CTEs, FOR UPDATE, constraints) runs in both places.

type Row = Record<string, unknown>;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS event_state (
    id INT PRIMARY KEY CHECK (id = 1),
    accepted_count INT NOT NULL DEFAULT 0 CHECK (accepted_count >= 0)
  )`,
  `INSERT INTO event_state (id, accepted_count) VALUES (1, 0) ON CONFLICT (id) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS codes (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'unused'
      CHECK (status IN ('unused','accepted','declined','dead')),
    issuer_id INT REFERENCES codes(id),
    email TEXT,
    depth INT NOT NULL DEFAULT 0,
    position INT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS attempts (
    id SERIAL PRIMARY KEY,
    ip TEXT NOT NULL,
    ts TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS attempts_ip_ts ON attempts (ip, ts)`,
];

// Cache across hot reloads (dev) and across invocations (serverless warm starts).
const g = globalThis as unknown as {
  __hl_pglite?: Promise<import('@electric-sql/pglite').PGlite>;
  __hl_schema_ready?: Promise<void>;
};

async function rawQuery(text: string, params: unknown[] = []): Promise<Row[]> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    return (await sql.query(text, params)) as Row[];
  }
  if (!g.__hl_pglite) {
    g.__hl_pglite = (async () => {
      const { mkdirSync } = await import('fs');
      mkdirSync('.data', { recursive: true });
      const { PGlite } = await import('@electric-sql/pglite');
      return new PGlite('.data/pglite');
    })();
  }
  const db = await g.__hl_pglite;
  return (await db.query(text, params)).rows as Row[];
}

async function ensureSchema(): Promise<void> {
  if (!g.__hl_schema_ready) {
    g.__hl_schema_ready = (async () => {
      for (const stmt of SCHEMA) await rawQuery(stmt);
    })().catch((e) => {
      g.__hl_schema_ready = undefined; // allow retry on next request
      throw e;
    });
  }
  return g.__hl_schema_ready;
}

/** Run a parameterized query; schema is created on first use. */
export async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  await ensureSchema();
  return rawQuery(text, params);
}
