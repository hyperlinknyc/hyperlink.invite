import { NextResponse } from 'next/server';
import { normalizeCode, isPlausibleCode } from '@/lib/codes';
import { acceptInvite } from '@/lib/invites';
import { clientIp, overLimit } from '@/lib/rateLimit';
import { CAPACITY } from '@/lib/config';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  if (await overLimit(clientIp(req))) {
    return NextResponse.json({ result: 'ratelimited' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const code = normalizeCode(String(body.code ?? ''));
  const email = String(body.email ?? '').trim().toLowerCase();

  if (!isPlausibleCode(code)) return NextResponse.json({ result: 'invalid' });
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ result: 'bademail' });
  }

  const res = await acceptInvite(code, email);
  if (!res.ok) return NextResponse.json({ result: res.reason });

  return NextResponse.json({
    result: 'accepted',
    position: res.position,
    capacity: CAPACITY,
    spotsRemaining: res.spotsRemaining,
    childCode: res.childCode,
  });
}
