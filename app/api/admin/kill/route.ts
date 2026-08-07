import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { killCode } from '@/lib/invites';
import { normalizeCode } from '@/lib/codes';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isAuthed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const code = normalizeCode(String(body.code ?? ''));
  const killed = await killCode(code);
  return NextResponse.json({ ok: true, killed });
}
