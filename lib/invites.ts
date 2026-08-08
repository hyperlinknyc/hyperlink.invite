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

export type CodeInfo = {
  status: CodeStatus;
  world: World;
  inviteePhone: string | null;
  /** First name the inviter said they were sending this to, if any. */
  invitedName: string | null;
  /** 0 means a seed you issued yourself; deeper codes came from a guest. */
  depth: number;
};

export async function codeInfo(code: string): Promise<CodeInfo | null> {
  const rows = await q(
    `SELECT status, world, invitee_phone, invited_name, depth
     FROM codes WHERE code = $1`,
    [code]
  );
  if (rows.length === 0) return null;
  return {
    status: rows[0].status as CodeStatus,
    world: Number(rows[0].world) as World,
    inviteePhone: (rows[0].invitee_phone as string) ?? null,
    invitedName: (rows[0].invited_name as string) ?? null,
    depth: Number(rows[0].depth ?? 0),
  };
}

export type NameClaimResult =
  | { ok: true; alreadyNamed: boolean; invitedName: string }
  | { ok: false; reason: 'notfound' | 'spent' };

/**
 * Record who an invitation is being sent to, by first name only.
 *
 * This is the share-sheet path: the inviter never has to look up a phone
 * number, because the OS share sheet is the contact picker. The name is not
 * a secret and does not gate entry — it lets the recipient see the invite
 * was meant for them, and lets admin notice when the person who claimed a
 * code is not the person it was sent to.
 *
 * Conditional on the code still being unused and unnamed, so a refresh or
 * a double-tap cannot silently re-address an invitation already sent.
 */
export async function claimInviteByName(
  code: string,
  invitedName: string
): Promise<NameClaimResult> {
  const rows = await q(
    `UPDATE codes SET invited_name = $2
     WHERE code = $1 AND status = 'unused' AND invited_name IS NULL
     RETURNING invited_name`,
    [code, invitedName]
  );
  if (rows.length > 0) {
    return { ok: true, alreadyNamed: false, invitedName };
  }
  const existing = await q(
    `SELECT status, invited_name FROM codes WHERE code = $1`,
    [code]
  );
  if (existing.length === 0) return { ok: false, reason: 'notfound' };
  if (existing[0].status !== 'unused') return { ok: false, reason: 'spent' };
  return {
    ok: true,
    alreadyNamed: true,
    invitedName: String(existing[0].invited_name ?? ''),
  };
}

/**
 * A code that was dispatched to a specific number can only be opened by
 * someone who knows that number's last four digits. This is what stops a
 * forwarded link from admitting the wrong person: the invitation is bound
 * to whoever it was addressed to, not to whoever holds the URL.
 * Seed codes carry no phone and skip the check.
 */
/**
 * The recipient must produce the first name the invitation was addressed to.
 * The name is never displayed before this passes — showing it would hand the
 * answer to whoever opened the link, which is no check at all.
 *
 * Forgiving on shape (case, accents, punctuation, surrounding whitespace)
 * because a real guest typing their own name should never be turned away on
 * a technicality.
 */
const normalizeName = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export function nameMatches(invitedName: string | null, given: string): boolean {
  if (!invitedName) return true;
  const want = normalizeName(invitedName);
  const got = normalizeName(given);
  if (!want || !got) return false;
  // Accept a full name when only a first name was recorded ("alex rivera"
  // against "alex"), so nobody is blocked for over-answering.
  return got === want || got.startsWith(want);
}

export function phoneMatches(inviteePhone: string | null, last4: string): boolean {
  if (!inviteePhone) return true;
  const digits = last4.replace(/\D/g, '');
  return digits.length === 4 && inviteePhone.slice(-4) === digits;
}

/** Admin escape hatch: unbind a mistyped number so the code can be re-aimed. */
export async function clearInviteClaim(code: string): Promise<boolean> {
  const rows = await q(
    `UPDATE codes SET invitee_phone = NULL, passphrase = NULL,
            sms_status = NULL, sms_error = NULL, sms_at = NULL
     WHERE code = $1 AND status = 'unused' RETURNING id`,
    [code]
  );
  return rows.length > 0;
}

export type AcceptResult =
  | {
      ok: true;
      /** Their number in the chain. Never reused, even after a removal. */
      position: number;
      /** Live occupancy. Falls when a guest is removed; drives capacity. */
      accepted: number;
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
export async function acceptInvite(
  code: string,
  name: string,
  phone: string
): Promise<AcceptResult> {
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
           SET accepted_count = e.accepted_count + 1,
               next_position = e.next_position + 1
           FROM target t
           WHERE e.id = t.world AND e.accepted_count < e.capacity
           RETURNING e.accepted_count, e.capacity, e.next_position, e.id AS world
         ),
         accepted AS (
           UPDATE codes c
           SET status = 'accepted', guest_name = $2, guest_phone = $4,
               decided_at = now(),
               position = (SELECT next_position FROM cap)
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
           (SELECT next_position FROM cap) AS position,
           (SELECT accepted_count FROM cap) AS accepted,
           (SELECT capacity FROM cap) AS capacity,
           (SELECT world FROM cap) AS world,
           (SELECT code FROM child) AS child_code`,
        [code, name, child, phone]
      );

      const position = rows[0]?.position == null ? null : Number(rows[0].position);
      if (position !== null) {
        const capacity = Number(rows[0].capacity);
        const accepted = Number(rows[0].accepted);
        const world = Number(rows[0].world) as World;
        // Occupancy, not chain number, decides whether the room is sealed —
        // they diverge as soon as a guest is removed.
        if (accepted >= capacity) await killAllUnused(world);
        return {
          ok: true,
          position,
          accepted,
          capacity,
          world,
          childCode: (rows[0].child_code as string) ?? null,
          spotsRemaining: Math.max(0, capacity - accepted),
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

export type ClaimResult =
  | { ok: true; alreadySent: false }
  // On a re-submit we return what is actually on file, never the values just
  // typed — otherwise the screen would imply we re-sent to a new number.
  | { ok: true; alreadySent: true; phone: string; passphrase: string }
  | { ok: false; reason: 'notfound' | 'taken' };

/**
 * Attach an invitee's phone + passphrase to a freshly minted code.
 * Conditional on the code still being unused and unclaimed, so a
 * double-submit or a refresh cannot retarget an invitation that has
 * already gone out to someone else.
 */
export async function claimInvite(
  code: string,
  phoneE164: string,
  passphrase: string
): Promise<ClaimResult> {
  const rows = await q(
    `UPDATE codes
     SET invitee_phone = $2, passphrase = $3, sms_status = 'pending'
     WHERE code = $1 AND status = 'unused' AND invitee_phone IS NULL
     RETURNING id`,
    [code, phoneE164, passphrase]
  );
  if (rows.length > 0) return { ok: true, alreadySent: false };

  const existing = await q(
    `SELECT invitee_phone, passphrase FROM codes WHERE code = $1`,
    [code]
  );
  if (existing.length === 0) return { ok: false, reason: 'notfound' };
  // Already pointed at someone — surface that rather than silently retargeting.
  if (existing[0].invitee_phone) {
    return {
      ok: true,
      alreadySent: true,
      phone: String(existing[0].invitee_phone),
      passphrase: String(existing[0].passphrase ?? ''),
    };
  }
  return { ok: false, reason: 'taken' };
}

export async function markSms(
  code: string,
  status: 'sent' | 'failed' | 'handoff',
  error?: string
): Promise<void> {
  await q(
    `UPDATE codes SET sms_status = $2, sms_error = $3, sms_at = now()
     WHERE code = $1`,
    [code, status, error ?? null]
  );
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

export type RevokeResult =
  | { ok: true; name: string; freedChild: string | null; remaining: number }
  | { ok: false; reason: 'notfound' | 'notaccepted' };

/**
 * Admin: remove an accepted guest and give their seat back.
 *
 * Decrements occupancy in the same statement that voids the row, so the
 * seat and the guest can never disagree. Their chain position is released
 * (set NULL) but never reissued — next_position keeps climbing, so nobody
 * inherits their number.
 *
 * Their unused invitation dies with them. Anyone they already brought in
 * stays: that guest accepted in good faith, and cascading would let one
 * removal collapse an arbitrary share of the party.
 */
export async function revokeGuest(code: string): Promise<RevokeResult> {
  const rows = await q(
    `WITH target AS (
       SELECT id, world, guest_name FROM codes
       WHERE code = $1 AND status = 'accepted'
       FOR UPDATE
     ),
     dec AS (
       UPDATE event_state e
       SET accepted_count = GREATEST(0, e.accepted_count - 1)
       FROM target t
       WHERE e.id = t.world
       RETURNING e.accepted_count, e.capacity
     ),
     revoked AS (
       UPDATE codes c
       SET status = 'dead', position = NULL, decided_at = now()
       FROM target t
       WHERE c.id = t.id AND EXISTS (SELECT 1 FROM dec)
       RETURNING c.id
     ),
     orphan AS (
       UPDATE codes c
       SET status = 'dead', decided_at = now()
       WHERE c.issuer_id = (SELECT id FROM revoked) AND c.status = 'unused'
       RETURNING c.code
     )
     SELECT (SELECT id FROM revoked) AS id,
            (SELECT guest_name FROM target) AS name,
            (SELECT code FROM orphan) AS freed_child,
            (SELECT accepted_count FROM dec) AS accepted,
            (SELECT capacity FROM dec) AS capacity`,
    [code]
  );

  if (rows[0]?.id == null) {
    const info = await codeInfo(code);
    return { ok: false, reason: info === null ? 'notfound' : 'notaccepted' };
  }
  return {
    ok: true,
    name: (rows[0].name as string) ?? '(unnamed)',
    freedChild: (rows[0].freed_child as string) ?? null,
    remaining: Math.max(0, Number(rows[0].capacity) - Number(rows[0].accepted)),
  };
}

/** Admin: wipe the demo world back to zero. Never touches the live party. */
export async function purgeDemo(): Promise<number> {
  const rows = await q(`DELETE FROM codes WHERE world = $1 RETURNING id`, [WORLD_DEMO]);
  // next_position resets here, unlike on a removal. Nothing survives a purge,
  // so no position can collide — and leaving it climbing made the next demo
  // guest read as "GUEST 11" in a five-seat world.
  await q(
    `UPDATE event_state SET accepted_count = 0, next_position = 0 WHERE id = $1`,
    [WORLD_DEMO]
  );
  return rows.length;
}

export type CodeRow = {
  id: number;
  code: string;
  status: CodeStatus;
  issuer_id: number | null;
  guest_name: string | null;
  guest_phone: string | null;
  invited_name: string | null;
  depth: number;
  position: number | null;
  world: World;
  invitee_phone: string | null;
  passphrase: string | null;
  sms_status: string | null;
  created_at: string;
  decided_at: string | null;
};

export async function allCodes(world?: World): Promise<CodeRow[]> {
  const sql = `SELECT id, code, status, issuer_id, guest_name, guest_phone,
                      invited_name, depth, position, world,
                      invitee_phone, passphrase, sms_status,
                      created_at::text, decided_at::text
               FROM codes ${world ? 'WHERE world = $1' : ''} ORDER BY id`;
  return (await q(sql, world ? [world] : [])) as unknown as CodeRow[];
}
