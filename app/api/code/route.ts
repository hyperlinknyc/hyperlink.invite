import { NextResponse } from 'next/server';
import { normalizeCode, isPlausibleCode } from '@/lib/codes';
import { codeInfo, isFull, worldState, killAllUnused } from '@/lib/invites';
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

  return NextResponse.json({
    result: 'valid',
    code,
    demo: info.world === WORLD_DEMO,
    spotsRemaining: state.remaining,
    capacity: state.capacity,
  });
}
