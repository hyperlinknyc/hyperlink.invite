import { NextResponse } from 'next/server';
import { normalizeCode, isPlausibleCode } from '@/lib/codes';
import {
  codeInfo,
  isFull,
  worldState,
  killAllUnused,
  phoneMatches,
  nameMatches,
} from '@/lib/invites';
import { clientIp, overLimit } from '@/lib/rateLimit';
import { WORLD_DEMO } from '@/lib/defaults';

export const dynamic = 'force-dynamic';

// Validate a code without consuming it: valid | invalid | dead | full | ratelimited
export async function POST(req: Request) {
  if (await overLimit(clientIp(req))) {
    return NextResponse.json({ result: 'ratelimited' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const code = normalizeCode(String(body.code ?? ''));

  // Resolve the code first, so its own world decides the capacity question —
  // a demo code must keep working after the real party has sealed.
  const info = isPlausibleCode(code) ? await codeInfo(code) : null;

  if (info === null) {
    // Unknown code. Once the live room is sealed, report 'full' rather than
    // 'invalid' so the endpoint stops acting as a code-existence oracle.
    if (await isFull()) {
      await killAllUnused();
      return NextResponse.json({ result: 'full' });
    }
    return NextResponse.json({ result: 'invalid' });
  }

  const state = await worldState(info.world);
  if (state.full) {
    await killAllUnused(info.world);
    return NextResponse.json({ result: 'full' });
  }
  if (info.status !== 'unused') return NextResponse.json({ result: 'dead' });

  // Bound to a number: prove you are the person it was addressed to.
  if (info.inviteePhone) {
    const last4 = String(body.last4 ?? '');
    if (!last4) return NextResponse.json({ result: 'needverify' });
    if (!phoneMatches(info.inviteePhone, last4)) {
      return NextResponse.json({ result: 'wrongphone' });
    }
  }

  // Addressed to a name: they must produce it. The name is never sent back
  // before this passes, so opening the link reveals nothing to guess with.
  if (info.invitedName) {
    const claimed = String(body.claimName ?? '');
    if (!claimed) return NextResponse.json({ result: 'needname' });
    if (!nameMatches(info.invitedName, claimed)) {
      return NextResponse.json({ result: 'wrongname' });
    }
  }

  return NextResponse.json({
    result: 'valid',
    code,
    demo: info.world === WORLD_DEMO,
    // Safe to return only now: they already proved they know it.
    invitedName: info.invitedName,
    spotsRemaining: state.remaining,
    capacity: state.capacity,
  });
}
