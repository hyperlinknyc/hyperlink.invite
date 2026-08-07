import { q } from './db';
import { generateCode } from './codes';
import { WORLD_DEMO, WORLD_LIVE } from './defaults';

export type CodeStatus = 'unused' | 'accepted' | 'declined' | 'dead';
export type World = typeof WORLD_LIVE | typeof WORLD_DEMO;

/**
 * A "world" is an isolated copy of the party mechanics. World 1 is the real
 * event; world 2 is the demo sandbox. Codes carry their world, and every
 * capacity check reads that world's own event_state row — so demo runs
 * exercise the identical accept/decline/capacity code path without ever
 * touching the live guest count.
 */

export async function acceptedCount(world: World = WORLD_LIVE): Promise<number> {
  const rows = await q(`SELECT accepted_count FROM event_state WHERE id = $1`, [world]);
  return Number(rows[0]?.accepted_count ?? 0);
}

export async function capacityOf(world: World = WORLD_LIVE): Promise<number> {
  const rows = await q(`SELECT capacity FROM event_state WHERE id = $1`, [world]);
  return Number(rows[0]?.capacity ?? 0);
}

export async function worldState(
  world: World = WORLD_LIVE
): Promise<{ accepted: number; capacity: number; full: boolean; remaining: number }> {
  const rows = await q(
    `SELECT accepted_count, capacity FROM event_state WHERE id = $1`,
    [world]
  );
  const accepted = Number(rows[0]?.accepted_count ?? 0);
  const capacity = Number(rows[0]?.capacity ?? 0);
  return {
    accepted,
    capacity,
    full: accepted >= capacity,
    remaining: Math.max(0, capacity - accepted),
  };
}

export async function isFull(world: World = WORLD_LIVE): Promise<boolean> {
  return (await worldState(world)).full;
}

/** Kill every unused code in a world (capacity reached, or admin action). */
export async function killAllUnused(world: World = WORLD_LIVE): Promise<number> {
  const rows = await q(
    `UPDATE codes SET status = 'dead', decided_at = now()
     WHERE status = 'unused' AND world = $1 RETURNING id`,
    [world]
  );
  return rows.length;
}

export type CodeInfo = { status: CodeStatus; world: World };

export async function codeInfo(code: string): Promise<CodeInfo | null> {
  const rows = await q(`SELECT status, world FROM codes WHERE code = $1`, [code]);
  if (rows.length === 0) return null;
  return {
    status: rows[0].status as CodeStatus,
    world: Number(rows[0].world) as World,
  };
}

export type AcceptResult =
  | {
      ok: true;
      position: number;
      capacity: number;
      childCode: string | null;
      spotsRemaining: number;
      world: World;
    }
  | { ok: false; reason: 'invalid' | 'dead' | 'full' };

/**
 * Atomically accept an invite. One SQL statement, so it is all-or-nothing:
 *  1. lock the code row if it is still unused,
 *  2. increment that world's counter ONLY while under its capacity — this is
 *     the database-level gate. Concurrent accepts serialize on the
 *     event_state row, and the loser re-evaluates `accepted_count < capacity`
 *     against the winner's committed value, so the room cannot oversell,
 *  3. mark the code accepted and stamp its chain position,
 *  4. mint the child code, skipped for the final seat.
 * If any gate fails the whole statement is a no-op.
 */
export async function acceptInvite(code: string, email: string): Promise<AcceptResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const child = generateCode();
    try {
      const rows = await q(
        `WITH target AS (
           SELECT id, depth, world FROM codes
           WHERE code = $1 AND status = 'unused'
           FOR UPDATE
         ),
         cap AS (
           UPDATE event_state e
           SET accepted_count = e.accepted_count + 1
           FROM target t
           WHERE e.id = t.world AND e.accepted_count < e.capacity
           RETURNING e.accepted_count, e.capacity, e.id AS world
         ),
         accepted AS (
           UPDATE codes c
           SET status = 'accepted', email = $2, decided_at = now(),
               position = (SELECT accepted_count FROM cap)
           FROM target t
           WHERE c.id = t.id AND EXISTS (SELECT 1 FROM cap)
           RETURNING c.id, c.depth, c.world
         ),
         child AS (
           INSERT INTO codes (code, issuer_id, depth, world)
           SELECT $3, a.id, a.depth + 1, a.world FROM accepted a
           WHERE (SELECT accepted_count FROM cap) < (SELECT capacity FROM cap)
           RETURNING code
         )
         SELECT
           (SELECT accepted_count FROM cap) AS position,
           (SELECT capacity FROM cap) AS capacity,
           (SELECT world FROM cap) AS world,
           (SELECT code FROM child) AS child_code`,
        [code, email, child]
      );

      const position = rows[0]?.position == null ? null : Number(rows[0].position);
      if (position !== null) {
        const capacity = Number(rows[0].capacity);
        const world = Number(rows[0].world) as World;
        if (position >= capacity) await killAllUnused(world);
        return {
          ok: true,
          position,
          capacity,
          world,
          childCode: (rows[0].child_code as string) ?? null,
          spotsRemaining: Math.max(0, capacity - position),
        };
      }

      // No-op — work out why. A sealed room outranks the code's own status:
      // a racer who lost by milliseconds should hear that the last seat went,
      // not that their code was already spent.
      const info = await codeInfo(code);
      if (info === null) return { ok: false, reason: 'invalid' };
      if (await isFull(info.world)) {
        await killAllUnused(info.world);
        return { ok: false, reason: 'full' };
      }
      return { ok: false, reason: 'dead' };
    } catch (e: unknown) {
      // 23505 = unique_violation: freak collision on the child code — retry.
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
  const info = await codeInfo(code);
  return { ok: false, reason: info === null ? 'invalid' : 'dead' };
}

/** Admin: mint a seed code (no issuer, depth 0) in the given world. */
export async function mintSeedCode(world: World = WORLD_LIVE): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode();
    try {
      await q(`INSERT INTO codes (code, world) VALUES ($1, $2)`, [code, world]);
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

/** Admin: wipe the demo world back to zero. Never touches the live party. */
export async function purgeDemo(): Promise<number> {
  const rows = await q(`DELETE FROM codes WHERE world = $1 RETURNING id`, [WORLD_DEMO]);
  await q(`UPDATE event_state SET accepted_count = 0 WHERE id = $1`, [WORLD_DEMO]);
  return rows.length;
}

export type CodeRow = {
  id: number;
  code: string;
  status: CodeStatus;
  issuer_id: number | null;
  email: string | null;
  depth: number;
  position: number | null;
  world: World;
  created_at: string;
  decided_at: string | null;
};

export async function allCodes(world?: World): Promise<CodeRow[]> {
  const sql = `SELECT id, code, status, issuer_id, email, depth, position, world,
                      created_at::text, decided_at::text
               FROM codes ${world ? 'WHERE world = $1' : ''} ORDER BY id`;
  return (await q(sql, world ? [world] : [])) as unknown as CodeRow[];
}
