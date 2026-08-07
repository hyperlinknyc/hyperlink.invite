import { isAuthed } from '@/lib/adminAuth';
import { allCodes } from '@/lib/invites';
import { WORLD_LIVE } from '@/lib/defaults';

export const dynamic = 'force-dynamic';

function csvField(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  if (!isAuthed(req)) return new Response('unauthorized', { status: 401 });
  // Live world only — a demo run must never end up on the door list.
  const codes = await allCodes(WORLD_LIVE);
  const header = 'code,status,email,position,depth,issuer_id,created_at,decided_at';
  const lines = codes.map((c) =>
    [c.code, c.status, c.email, c.position, c.depth, c.issuer_id, c.created_at, c.decided_at]
      .map(csvField)
      .join(',')
  );
  return new Response([header, ...lines].join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="hyperlink-guests.csv"',
    },
  });
}
