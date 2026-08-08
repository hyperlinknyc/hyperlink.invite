// ── Database adapter ─────────────────────────────────────────────────
// Production: Neon Postgres over HTTP (DATABASE_URL set).
// Local dev:  PGlite — a real embedded Postgres stored in .data/ — so the
// exact same SQL (CTEs, FOR UPDATE, constraints) runs in both places.

type Row = Record<string, unknown>;
type Stmt = string | [string, unknown[]];

import { DEFAULTS, WORLD_LIVE, WORLD_DEMO } from './defaults';

const SCHEMA: Stmt[] = [
  // ── event_state: one row per world (1 = live party, 2 = demo sandbox) ──
  `CREATE TABLE IF NOT EXISTS event_state (
    id INT PRIMARY KEY,
    accepted_count INT NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
    capacity INT NOT NULL DEFAULT 40 CHECK (capacity >= 0)
  )`,
  // Installs predating the demo world had CHECK (id = 1) and no capacity column.
  `ALTER TABLE event_state DROP CONSTRAINT IF EXISTS event_state_id_check`,
  `ALTER TABLE event_state ADD COLUMN IF NOT EXISTS capacity INT NOT NULL DEFAULT 40`,
  // accepted_count is occupancy and can fall when a guest is removed.
  // next_position only ever climbs, so a freed seat never hands the next
  // arrival a chain number that is already taken.
  `ALTER TABLE event_state ADD COLUMN IF NOT EXISTS next_position INT NOT NULL DEFAULT 0`,
  [
    `INSERT INTO event_state (id, accepted_count, capacity)
     VALUES ($1, 0, $2) ON CONFLICT (id) DO NOTHING`,
    [WORLD_LIVE, DEFAULTS.capacity],
  ],
  [
    `INSERT INTO event_state (id, accepted_count, capacity)
     VALUES ($1, 0, $2) ON CONFLICT (id) DO NOTHING`,
    [WORLD_DEMO, DEFAULTS.demoCapacity],
  ],

  // ── codes ──────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS codes (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'unused'
      CHECK (status IN ('unused','accepted','declined','dead')),
    issuer_id INT REFERENCES codes(id),
    email TEXT,
    depth INT NOT NULL DEFAULT 0,
    position INT,
    world INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at TIMESTAMPTZ
  )`,
  `ALTER TABLE codes ADD COLUMN IF NOT EXISTS world INT NOT NULL DEFAULT 1`,
  // Invitations are delivered by text: the issuer supplies their friend's
  // number plus a passphrase only the two of them would recognise.
  // What the guest calls themselves — this is the door list. Email was
  // dropped: the phone already reaches them, and a name is what you read
  // out at the door.
  `ALTER TABLE codes ADD COLUMN IF NOT EXISTS guest_name TEXT`,
  `ALTER TABLE codes ADD COLUMN IF NOT EXISTS invitee_phone TEXT`,
  `ALTER TABLE codes ADD COLUMN IF NOT EXISTS passphrase TEXT`,
  `ALTER TABLE codes ADD COLUMN IF NOT EXISTS sms_status TEXT`,
  `ALTER TABLE codes ADD COLUMN IF NOT EXISTS sms_error TEXT`,
  `ALTER TABLE codes ADD COLUMN IF NOT EXISTS sms_at TIMESTAMPTZ`,
  // Position is unique per world, not globally.
  `ALTER TABLE codes DROP CONSTRAINT IF EXISTS codes_position_key`,
  `CREATE UNIQUE INDEX IF NOT EXISTS codes_world_position
     ON codes (world, position)`,
  // Backfill next_position for databases that predate it. Lives here, after
  // `codes` exists, because it reads the highest position already issued.
  `UPDATE event_state e SET next_position = GREATEST(
     e.accepted_count,
     COALESCE((SELECT MAX(position) FROM codes WHERE world = e.id), 0)
   ) WHERE e.next_position < e.accepted_count
      OR e.next_position < COALESCE(
           (SELECT MAX(position) FROM codes WHERE world = e.id), 0)`,

  // ── event settings, editable from the admin console ────────────────────
  `CREATE TABLE IF NOT EXISTS settings (
    id INT PRIMARY KEY,
    edition TEXT NOT NULL,
    event_date TEXT NOT NULL,
    event_time TEXT NOT NULL,
    hood TEXT NOT NULL,
    ig_handle TEXT NOT NULL,
    ig_url TEXT NOT NULL
  )`,
  [
    `INSERT INTO settings (id, edition, event_date, event_time, hood, ig_handle, ig_url)
     VALUES (1, $1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
    [
      DEFAULTS.edition,
      DEFAULTS.eventDate,
      DEFAULTS.eventTime,
      DEFAULTS.hood,
      DEFAULTS.igHandle,
      DEFAULTS.igUrl,
    ],
  ],
  // Machine datetimes for the calendar file. Added after the CREATE above,
  // since ALTER on a table that does not exist yet aborts the whole schema.
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS starts_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS ends_at TEXT NOT NULL DEFAULT ''`,
  [
    `UPDATE settings SET starts_at = $1, ends_at = $2
     WHERE id = 1 AND starts_at = '' AND ends_at = ''`,
    [DEFAULTS.startsAt, DEFAULTS.endsAt],
  ],

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
      for (const stmt of SCHEMA) {
        if (typeof stmt === 'string') await rawQuery(stmt);
        else await rawQuery(stmt[0], stmt[1]);
      }
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
