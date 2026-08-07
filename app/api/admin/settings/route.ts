import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/adminAuth';
import { getSettings, updateSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isAuthed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const res = await updateSettings(body ?? {});
  if (!res.ok) return NextResponse.json(res, { status: 400 });
  return NextResponse.json({ ok: true, settings: await getSettings() });
}
