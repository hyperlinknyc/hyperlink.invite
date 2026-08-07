import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { allCodes, acceptedCount } from '@/lib/invites';
import { CAPACITY } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isAuthed(req)) return NextResponse.json({ ok: false }, { status: 401 });

  const codes = await allCodes();
  const accepted = await acceptedCount();
  const counts = {
    accepted,
    declined: codes.filter((c) => c.status === 'declined').length,
    pending: codes.filter((c) => c.status === 'unused').length,
    dead: codes.filter((c) => c.status === 'dead').length,
    capacity: CAPACITY,
    remaining: Math.max(0, CAPACITY - accepted),
  };
  const emails = codes
    .filter((c) => c.status === 'accepted' && c.email)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((c) => c.email as string);

  return NextResponse.json({ ok: true, counts, codes, emails });
}
