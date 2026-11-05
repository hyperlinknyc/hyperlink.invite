import { NextResponse } from 'next/server';
import { normalizeCode, isPlausibleCode } from '@/lib/codes';
import { sessionStillValid } from '@/lib/invites';

export const dynamic = 'force-dynamic';

// Does a returning browser's saved session still match a real, accepted
// guest? ok | gone. Deliberately not counted against the attempt limit —
// every returning visit makes one of these — and it says nothing beyond
// whether *this* browser's own code is still seated.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = normalizeCode(String(body.code ?? ''));
  if (!isPlausibleCode(code)) return NextResponse.json({ result: 'gone' });

  const epoch = body.epoch ? String(body.epoch) : undefined;
  const ok = await sessionStillValid(code, epoch);
  return NextResponse.json({ result: ok ? 'ok' : 'gone' });
}
