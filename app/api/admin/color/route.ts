import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { colorUncoloredChain } from '@/lib/invites';
import { normalizeCode } from '@/lib/codes';

export const dynamic = 'force-dynamic';

// Colour a chain that has none. Never recolours one that already does.
export async function POST(req: Request) {
  if (!isAuthed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const res = await colorUncoloredChain(normalizeCode(String(body.code ?? '')), {
    color: String(body.color ?? '').toUpperCase(),
    allowDuplicate: body.allowDuplicate === true,
  });
  return NextResponse.json(res.ok ? res : { ok: false, error: res.reason });
}
