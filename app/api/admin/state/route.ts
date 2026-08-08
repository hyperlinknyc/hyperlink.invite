import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { allCodes, worldState } from '@/lib/invites';
import { getSettings } from '@/lib/settings';
import { WORLD_DEMO, WORLD_LIVE } from '@/lib/defaults';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isAuthed(req)) return NextResponse.json({ ok: false }, { status: 401 });

  const [codes, live, demo, settings] = await Promise.all([
    allCodes(),
    worldState(WORLD_LIVE),
    worldState(WORLD_DEMO),
    getSettings(),
  ]);

  const liveCodes = codes.filter((c) => c.world === WORLD_LIVE);
  const demoCodes = codes.filter((c) => c.world === WORLD_DEMO);

  const tally = (rows: typeof codes) => ({
    declined: rows.filter((c) => c.status === 'declined').length,
    pending: rows.filter((c) => c.status === 'unused').length,
    dead: rows.filter((c) => c.status === 'dead').length,
  });

  // The door list: live world only, in the order people accepted. Each
  // guest's number is the one their invitation was texted to.
  const guests = liveCodes
    .filter((c) => c.status === 'accepted')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((c) => ({
      position: c.position,
      name: c.guest_name ?? '(unnamed)',
      phone: c.guest_phone ?? c.invitee_phone ?? '',
      code: c.code,
      // What the inviter called them, so a claim by someone else is visible.
      invitedAs: c.invited_name ?? '',
    }));

  return NextResponse.json({
    ok: true,
    counts: {
      accepted: live.accepted,
      capacity: live.capacity,
      remaining: live.remaining,
      ...tally(liveCodes),
    },
    demoCounts: {
      accepted: demo.accepted,
      capacity: demo.capacity,
      remaining: demo.remaining,
      ...tally(demoCodes),
    },
    settings,
    codes: liveCodes,
    demoCodes,
    guests,
  });
}
