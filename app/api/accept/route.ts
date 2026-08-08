import { NextResponse } from 'next/server';
import { normalizeCode, isPlausibleCode } from '@/lib/codes';
import { acceptInvite, codeInfo, phoneMatches } from '@/lib/invites';
import { clientIp, overLimit } from '@/lib/rateLimit';
import { WORLD_DEMO } from '@/lib/defaults';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (await overLimit(clientIp(req))) {
    return NextResponse.json({ result: 'ratelimited' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const code = normalizeCode(String(body.code ?? ''));
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');

  if (!isPlausibleCode(code)) return NextResponse.json({ result: 'invalid' });
  if (name.length < 2 || name.length > 60) {
    return NextResponse.json({ result: 'badname' });
  }

  // Re-check the phone binding here, not just in /api/code — this is the
  // route that actually consumes a seat, so it cannot be skipped.
  const info = await codeInfo(code);
  if (info?.inviteePhone && !phoneMatches(info.inviteePhone, String(body.last4 ?? ''))) {
    return NextResponse.json({ result: 'wrongphone' });
  }

  const res = await acceptInvite(code, name);
  if (!res.ok) return NextResponse.json({ result: res.reason });

  return NextResponse.json({
    result: 'accepted',
    position: res.position,
    capacity: res.capacity,
    spotsRemaining: res.spotsRemaining,
    childCode: res.childCode,
    demo: res.world === WORLD_DEMO,
  });
}
