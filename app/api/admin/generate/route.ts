import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { mintSeedCode } from '@/lib/invites';
import { WORLD_DEMO, WORLD_LIVE } from '@/lib/defaults';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isAuthed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const world = body.demo ? WORLD_DEMO : WORLD_LIVE;
  const color = body.color ? String(body.color) : undefined;
  // A named colour is one chain's colour, so it mints exactly one seed.
  const n = color ? 1 : Math.min(Math.max(Number(body.n) || 1, 1), 10);
  const codes: string[] = [];
  const colors: string[] = [];
  for (let i = 0; i < n; i++) {
    const res = await mintSeedCode(world, {
      color,
      allowDuplicate: body.allowDuplicate === true,
    });
    if (!res.ok) {
      // Whatever was minted before the palette ran out still stands.
      return NextResponse.json({
        ok: false,
        error: res.reason,
        codes,
        colors,
        demo: world === WORLD_DEMO,
      });
    }
    codes.push(res.code);
    colors.push(res.color);
  }
  return NextResponse.json({ ok: true, codes, colors, demo: world === WORLD_DEMO });
}
