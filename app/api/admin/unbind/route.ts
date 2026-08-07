import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { clearInviteClaim } from '@/lib/invites';
import { normalizeCode } from '@/lib/codes';

export const dynamic = 'force-dynamic';

// Escape hatch: someone fat-fingered their friend's number and the invite is
// now locked to a phone nobody holds. Unbind it so it can be re-aimed.
export async function POST(req: Request) {
  if (!isAuthed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const code = normalizeCode(String(body.code ?? ''));
  const cleared = await clearInviteClaim(code);
  return NextResponse.json({ ok: true, cleared });
}
