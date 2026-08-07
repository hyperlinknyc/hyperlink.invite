import { q } from './db';
import { generateCode } from './codes';
import { CAPACITY } from './config';

export type CodeStatus = 'unused' | 'accepted' | 'declined' | 'dead';

export async function acceptedCount(): Promise<number> {
  const rows = await q(`SELECT accepted_count FROM event_state WHERE id = 1`);
  return Number(rows[0]?.accepted_count ?? 0);
}

export async function isFull(): Promise<boolean> {
  return (await acceptedCount()) >= CAPACITY;
}

/** Kill every unused code. Called when capacity is reached (and by admin "kill"). */
export async function killAllUnused(): Promise<number> {
  const rows = await q(
    `UPDATE codes SET status = 'dead', decided_at = now()
     WHERE status = 'unused' RETURNING id`
  );
  return rows.length;
}

export async function codeStatus(code: string): Promise<CodeStatus | null> {
  const rows = await q(`SELECT status FROM codes WHERE code = $1`, [code]);
  return (rows[0]?.status as CodeStatus) ?? null;
}

export type AcceptResult =
  | { ok: true; position: number; childCode: string | null; spotsRemaining: number }
  | { ok: false; reason: 'invalid' | 'dead' | 'full' };

/**
 * Atomically accept an invite. A single SQL statement:
 *  1. locks the code row (FOR UPDATE) if it is still unused,
 *  2. increments the accepted counter ONLY if under capacity — this is the
 *     database-level capacity gate; two simultaneous accepts serialize on
 *     the event_state row and the loser sees the updated count,
 *  3. marks the code accepted with the email and its chain position,
 *  4. mints the child code (skipped for the final spot).
 * If any gate fails the whole statement is a no-op.
 */
export async function acceptInvite(code: string, email: string): Promise<AcceptResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const child = generateCode();
    try {
      const rows = await q(
        `WITH target AS (
           SELECT id, depth FROM codes
           WHERE code = $1 AND status = 'unused'
           FOR UPDATE
         ),
         cap AS (
           UPDATE event_state
           SET accepted_count = accepted_count + 1
           WHERE id = 1 AND accepted_count < $2
             AND EXISTS (SELECT 1 FROM target)
           RETURNING accepted_count
         ),
         accepted AS (
           UPDATE codes c
           SET status = 'accepted', email = $3, decided_at = now(),
               position = (SELECT accepted_count FROM cap)
           FROM target t
           WHERE c.id = t.id AND EXISTS (SELECT 1 FROM cap)
           RETURNING c.id, c.depth
         ),
         child AS (
           INSERT INTO codes (code, issuer_id, depth)
           SELECT $4, a.id, a.depth + 1 FROM accepted a
           WHERE (SELECT accepted_count FROM cap) < $2
           RETURNING code
         )
         SELECT
           (SELECT accepted_count FROM cap) AS position,
           (SELECT code FROM child) AS child_code`,
        [code, CAPACITY, email, child]
      );

      const position = rows[0]?.position == null ? null : Number(rows[0].position);
      if (position !== null) {
        if (position >= CAPACITY) await killAllUnused();
        return {
          ok: true,
          position,
          childCode: (rows[0].child_code as string) ?? null,
          spotsRemaining: Math.max(0, CAPACITY - position),
        };
      }

      // Statement was a no-op — figure out why.
      // A full room outranks the code's own status: someone who lost the race
      // by milliseconds should hear "the last seat went", not "your code was
      // already spent" (a concurrent accept may have burned it a beat earlier).
      if (await isFull()) {
        await killAllUnused();
        return { ok: false, reason: 'full' };
      }
      const status = await codeStatus(code);
      if (status === null) return { ok: false, reason: 'invalid' };
      return { ok: false, reason: 'dead' };
    } catch (e: unknown) {
      // 23505 = unique_violation: freak collision on the generated child code — retry.
      if ((e as { code?: string })?.code === '23505' && attempt < 2) continue;
      throw e;
    }
  }
  throw new Error('could not generate a unique child code');
}

export type DeclineResult = { ok: true } | { ok: false; reason: 'invalid' | 'dead' };

export async function declineInvite(code: string): Promise<DeclineResult> {
  const rows = await q(
    `UPDATE codes SET status = 'declined', decided_at = now()
     WHERE code = $1 AND status = 'unused' RETURNING id`,
    [code]
  );
  if (rows.length > 0) return { ok: true };
  const status = await codeStatus(code);
  return { ok: false, reason: status === null ? 'invalid' : 'dead' };
}

/** Admin: mint a seed code (no issuer, depth 0). */
export async function mintSeedCode(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode();
    try {
      await q(`INSERT INTO codes (code) VALUES ($1)`, [code]);
      return code;
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === '23505' && attempt < 2) continue;
      throw e;
    }
  }
  throw new Error('could not generate a unique seed code');
}

/** Admin: kill one specific unused code. */
export async function killCode(code: string): Promise<boolean> {
  const rows = await q(
    `UPDATE codes SET status = 'dead', decided_at = now()
     WHERE code = $1 AND status = 'unused' RETURNING id`,
    [code]
  );
  return rows.length > 0;
}

export type CodeRow = {
  id: number;
  code: string;
  status: CodeStatus;
  issuer_id: number | null;
  email: string | null;
  depth: number;
  position: number | null;
  created_at: string;
  decided_at: string | null;
};

export async function allCodes(): Promise<CodeRow[]> {
  return (await q(
    `SELECT id, code, status, issuer_id, email, depth, position,
            created_at::text, decided_at::text
     FROM codes ORDER BY id`
  )) as unknown as CodeRow[];
}
