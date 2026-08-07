import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { mintSeedCode } from '@/lib/invites';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isAuthed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const n = Math.min(Math.max(Number(body.n) || 1, 1), 10);
  const codes: string[] = [];
  for (let i = 0; i < n; i++) codes.push(await mintSeedCode());
  return NextResponse.json({ ok: true, codes });
}
