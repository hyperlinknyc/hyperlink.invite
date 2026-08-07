import { NextResponse } from 'next/server';
import { normalizeCode, isPlausibleCode } from '@/lib/codes';
import { codeStatus, isFull, acceptedCount, killAllUnused } from '@/lib/invites';
import { clientIp, overLimit } from '@/lib/rateLimit';
import { CAPACITY } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Validate a code without consuming it. Result:
//   valid | invalid | dead | full | ratelimited
export async function POST(req: Request) {
  if (await overLimit(clientIp(req))) {
    return NextResponse.json({ result: 'ratelimited' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const code = normalizeCode(String(body.code ?? ''));

  if (await isFull()) {
    await killAllUnused();
    return NextResponse.json({ result: 'full' });
  }

  if (!isPlausibleCode(code)) {
    return NextResponse.json({ result: 'invalid' });
  }

  const status = await codeStatus(code);
  if (status === null) return NextResponse.json({ result: 'invalid' });
  if (status !== 'unused') return NextResponse.json({ result: 'dead' });

  const accepted = await acceptedCount();
  return NextResponse.json({
    result: 'valid',
    code,
    spotsRemaining: Math.max(0, CAPACITY - accepted),
    capacity: CAPACITY,
  });
}
