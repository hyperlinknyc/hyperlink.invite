import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { purgeDemo } from '@/lib/invites';

export const dynamic = 'force-dynamic';

// Wipes the demo world only. The live guest list is untouchable from here.
export async function POST(req: Request) {
  if (!isAuthed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const removed = await purgeDemo();
  return NextResponse.json({ ok: true, removed });
}
