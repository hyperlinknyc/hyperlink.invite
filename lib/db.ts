// ── Database adapter ─────────────────────────────────────────────────
// Production: Neon Postgres over HTTP (DATABASE_URL set).
// Local dev:  PGlite — a real embedded Postgres stored in .data/ — so the
// exact same SQL (CTEs, FOR UPDATE, constraints) runs in both places.

type Row = Record<string, unknown>;
type Stmt = string | [string, unknown[]];

import { DEFAULTS, WORLD_LIVE, WORLD_DEMO } from './defaults';
import { CHAIN_PALETTE } from './config';

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
  // The redeemer's OWN number, given by them on arrival. More reliable than
  // asking an inviter to look up someone else's, and it is the number that
  // ends up on the door list.
  `ALTER TABLE codes ADD COLUMN IF NOT EXISTS guest_phone TEXT`,
  // First name the inviter says they are sending this to. Not a secret —
  // it lets the recipient confirm the invite is meant for them, and lets
  // admin spot an invite claimed by someone other than who it was sent to.
  `ALTER TABLE codes ADD COLUMN IF NOT EXISTS invited_name TEXT`,
  // Legacy/optional: a number the invite was pre-locked to (admin can still
  // aim a code this way). Null for share-sheet invites.
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

  // Chain colour: the wristband at the door, by palette name (lib/config.ts).
  // A seed gets one when minted; every code inherits its issuer's on accept.
  // Lives only here — never encoded in the code string.
  `ALTER TABLE codes ADD COLUMN IF NOT EXISTS chain_color TEXT`,
  // Backfill, step 1: seeds that predate colours get one in palette order,
  // oldest first, skipping colours a live chain already holds. Only chains
  // someone is still in (an unused or accepted code) count — a killed or
  // declined seed has nobody to hand a wristband to. More live seeds than
  // colours leaves the extras NULL for admin to resolve, rather than doubling
  // up silently. Both steps only ever fill NULLs, so re-running is a no-op.
  [
    `WITH RECURSIVE tree AS (
       SELECT id AS root, id, status FROM codes
       WHERE issuer_id IS NULL AND chain_color IS NULL
       UNION ALL
       SELECT t.root, c.id, c.status FROM codes c JOIN tree t ON c.issuer_id = t.id
     ),
     seeds AS (
       SELECT s.id, s.world,
              ROW_NUMBER() OVER (PARTITION BY s.world ORDER BY s.id) AS rn
       FROM codes s
       WHERE s.id IN (SELECT root FROM tree WHERE status IN ('unused', 'accepted'))
     ),
     free AS (
       SELECT w.world, p.name,
              ROW_NUMBER() OVER (PARTITION BY w.world ORDER BY p.ord) AS rn
       FROM (SELECT DISTINCT world FROM seeds) w
       CROSS JOIN unnest(string_to_array($1, ',')) WITH ORDINALITY AS p(name, ord)
       WHERE NOT EXISTS (
         SELECT 1 FROM codes x
         WHERE x.world = w.world AND x.chain_color = p.name
           AND x.status IN ('unused', 'accepted')
       )
     )
     UPDATE codes c SET chain_color = f.name
     FROM seeds s JOIN free f ON f.world = s.world AND f.rn = s.rn
     WHERE c.id = s.id`,
    [CHAIN_PALETTE.map((p) => p.name).join(',')],
  ],
  // Step 2: every code takes its seed's colour, walking down each chain.
  `WITH RECURSIVE tree AS (
     SELECT id, chain_color FROM codes
     WHERE issuer_id IS NULL AND chain_color IS NOT NULL
     UNION ALL
     SELECT c.id, t.chain_color FROM codes c JOIN tree t ON c.issuer_id = t.id
   )
   UPDATE codes c SET chain_color = t.chain_color
   FROM tree t WHERE c.id = t.id AND c.chain_color IS NULL`,

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
