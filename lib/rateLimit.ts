import { q } from './db';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MIN } from './config';

/** Best-effort client IP (Vercel sets x-forwarded-for; locally falls back). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : 'local';
}

/**
 * Sliding-window rate limit backed by Postgres (shared across serverless
 * instances). Records the attempt, then checks the window. Returns true
 * if the caller is over the limit and should be refused.
 */
export async function overLimit(ip: string): Promise<boolean> {
  await q(`INSERT INTO attempts (ip) VALUES ($1)`, [ip]);
  // Opportunistic cleanup so the table never grows unbounded.
  await q(`DELETE FROM attempts WHERE ts < now() - interval '1 day'`);
  const rows = await q(
    `SELECT count(*)::int AS n FROM attempts
     WHERE ip = $1 AND ts > now() - ($2 || ' minutes')::interval`,
    [ip, String(RATE_LIMIT_WINDOW_MIN)]
  );
  return Number(rows[0]?.n ?? 0) > RATE_LIMIT_MAX;
}
