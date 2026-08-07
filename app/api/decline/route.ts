import { NextResponse } from 'next/server';
import { normalizeCode, isPlausibleCode } from '@/lib/codes';
import { declineInvite } from '@/lib/invites';
import { clientIp, overLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (await overLimit(clientIp(req))) {
    return NextResponse.json({ result: 'ratelimited' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const code = normalizeCode(String(body.code ?? ''));
  if (!isPlausibleCode(code)) return NextResponse.json({ result: 'invalid' });

  const res = await declineInvite(code);
  return NextResponse.json({ result: res.ok ? 'declined' : res.reason });
}
