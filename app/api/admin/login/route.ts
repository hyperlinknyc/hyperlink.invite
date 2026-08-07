import { NextResponse } from 'next/server';
import { checkPassword, sessionCookie } from '@/lib/adminAuth';
import { clientIp, overLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (await overLimit(clientIp(req))) {
    return NextResponse.json({ ok: false, reason: 'ratelimited' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  if (!checkPassword(String(body.password ?? ''))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.headers.set('Set-Cookie', sessionCookie());
  return res;
}
