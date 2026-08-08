import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { revokeGuest } from '@/lib/invites';
import { normalizeCode } from '@/lib/codes';

export const dynamic = 'force-dynamic';

// Remove an accepted guest and return their seat to the pool.
export async function POST(req: Request) {
  if (!isAuthed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const res = await revokeGuest(normalizeCode(String(body.code ?? '')));
  if (!res.ok) return NextResponse.json({ ok: false, reason: res.reason });
  return NextResponse.json({
    ok: true,
    name: res.name,
    freedChild: res.freedChild,
    remaining: res.remaining,
  });
}
