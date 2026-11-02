import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { PURGE_LIVE_PHRASE, purgeLive } from '@/lib/invites';

export const dynamic = 'force-dynamic';

// Erases the REAL party: every live code, guest and chain. Irreversible, so
// the request must carry the exact phrase — the admin page asks for it, but
// the check is here, so nothing that merely reaches this URL can do it.
export async function POST(req: Request) {
  if (!isAuthed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== PURGE_LIVE_PHRASE) {
    return NextResponse.json({ ok: false, error: 'confirm' }, { status: 400 });
  }
  const { codes, guests } = await purgeLive();
  return NextResponse.json({ ok: true, removed: codes, guests });
}
