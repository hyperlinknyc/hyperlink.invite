import { q } from './db';
import { WORLD_DEMO, WORLD_LIVE } from './defaults';

export type Settings = {
  edition: string;
  eventDate: string;
  eventTime: string;
  hood: string;
  igHandle: string;
  igUrl: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  demoCapacity: number;
};

export const SETTING_FIELDS = [
  'edition',
  'eventDate',
  'eventTime',
  'hood',
  'igHandle',
  'igUrl',
  'startsAt',
  'endsAt',
] as const;

export async function getSettings(): Promise<Settings> {
  const rows = await q(
    `SELECT s.edition, s.event_date, s.event_time, s.hood, s.ig_handle, s.ig_url, s.starts_at, s.ends_at,
            (SELECT capacity FROM event_state WHERE id = $1) AS capacity,
            (SELECT capacity FROM event_state WHERE id = $2) AS demo_capacity
     FROM settings s WHERE s.id = 1`,
    [WORLD_LIVE, WORLD_DEMO]
  );
  const r = rows[0] ?? {};
  return {
    edition: String(r.edition ?? ''),
    eventDate: String(r.event_date ?? ''),
    eventTime: String(r.event_time ?? ''),
    hood: String(r.hood ?? ''),
    igHandle: String(r.ig_handle ?? ''),
    igUrl: String(r.ig_url ?? ''),
    startsAt: String(r.starts_at ?? ''),
    endsAt: String(r.ends_at ?? ''),
    capacity: Number(r.capacity ?? 0),
    demoCapacity: Number(r.demo_capacity ?? 0),
  };
}

const COLUMN: Record<string, string> = {
  edition: 'edition',
  eventDate: 'event_date',
  eventTime: 'event_time',
  hood: 'hood',
  igHandle: 'ig_handle',
  igUrl: 'ig_url',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
};

/**
 * Patch any subset of the settings. Capacity is stored on the world's
 * event_state row, since the accept gate compares against it in SQL.
 * Lowering live capacity below the number already admitted is refused —
 * that would leave the party in an inconsistent, permanently-full state.
 */
export async function updateSettings(
  patch: Partial<Record<string, string | number>>
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const key of SETTING_FIELDS) {
    const v = patch[key];
    if (v === undefined) continue;
    const text = String(v).trim();
    if (key === 'startsAt' || key === 'endsAt') {
      // Blank is allowed: it simply means no calendar file is offered.
      if (text && !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/.test(text)) {
        return { ok: false, error: `${key} must look like 2026-08-22T21:00` };
      }
      await q(`UPDATE settings SET ${COLUMN[key]} = $1 WHERE id = 1`, [text]);
      continue;
    }
    if (!text) return { ok: false, error: `${key} cannot be empty` };
    if (text.length > 200) return { ok: false, error: `${key} is too long` };
    if (key === 'igUrl' && !/^https?:\/\//i.test(text)) {
      return { ok: false, error: 'igUrl must start with http:// or https://' };
    }
    await q(`UPDATE settings SET ${COLUMN[key]} = $1 WHERE id = 1`, [text]);
  }

  for (const [key, world] of [
    ['capacity', WORLD_LIVE],
    ['demoCapacity', WORLD_DEMO],
  ] as const) {
    const v = patch[key];
    if (v === undefined) continue;
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 1 || n > 10000) {
      return { ok: false, error: `${key} must be between 1 and 10000` };
    }
    const rows = await q(
      `UPDATE event_state SET capacity = $1
       WHERE id = $2 AND accepted_count <= $1
       RETURNING capacity`,
      [n, world]
    );
    if (rows.length === 0) {
      const cur = await q(`SELECT accepted_count FROM event_state WHERE id = $1`, [
        world,
      ]);
      return {
        ok: false,
        error: `cannot set ${key} to ${n} — ${cur[0]?.accepted_count} already accepted`,
      };
    }
  }

  return { ok: true };
}
