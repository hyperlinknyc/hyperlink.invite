import { NextResponse } from 'next/server';
import { normalizeCode, isPlausibleCode } from '@/lib/codes';
import {
  acceptInvite,
  codeInfo,
  phoneMatches,
  nameMatches,
} from '@/lib/invites';
import { clientIp, overLimit } from '@/lib/rateLimit';
import { WORLD_DEMO } from '@/lib/defaults';
import { normalizePhone } from '@/lib/phone';

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

  // Optional. Instagram is the channel that matters, so a number is not
  // worth a step in the funnel — but keep it if one is offered.
  const phone = normalizePhone(String(body.phone ?? ''));

  // Re-check the phone binding here, not just in /api/code — this is the
  // route that actually consumes a seat, so it cannot be skipped.
  const info = await codeInfo(code);
  if (info?.inviteePhone && !phoneMatches(info.inviteePhone, String(body.last4 ?? ''))) {
    return NextResponse.json({ result: 'wrongphone' });
  }
  if (info?.invitedName && !nameMatches(info.invitedName, String(body.claimName ?? ''))) {
    return NextResponse.json({ result: 'wrongname' });
  }

  const res = await acceptInvite(code, name, phone.ok ? phone.e164 : '');
  if (!res.ok) return NextResponse.json({ result: res.reason });

  return NextResponse.json({
    result: 'accepted',
    position: res.position,
    // Occupancy at the moment they got in; the seat number guests see.
    accepted: res.accepted,
    capacity: res.capacity,
    spotsRemaining: res.spotsRemaining,
    childCode: res.childCode,
    demo: res.world === WORLD_DEMO,
  });
}
