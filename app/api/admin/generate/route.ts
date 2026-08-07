import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { mintSeedCode } from '@/lib/invites';
import { WORLD_DEMO, WORLD_LIVE } from '@/lib/defaults';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isAuthed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const n = Math.min(Math.max(Number(body.n) || 1, 1), 10);
  const world = body.demo ? WORLD_DEMO : WORLD_LIVE;
  const codes: string[] = [];
  for (let i = 0; i < n; i++) codes.push(await mintSeedCode(world));
  return NextResponse.json({ ok: true, codes, demo: world === WORLD_DEMO });
}
