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
  // Sorted so the door list reads top-to-bottom in arrival order.
  const header =
    'position,name,phone,code,status,sms_status,depth,issuer_id,created_at,decided_at';
  const ordered = [...codes].sort((a, b) => {
    // Accepted guests first, in arrival order; everything else after.
    if (a.position != null && b.position != null) return a.position - b.position;
    if (a.position != null) return -1;
    if (b.position != null) return 1;
    return a.id - b.id;
  });
  const lines = ordered.map((c) =>
    [
      c.position,
      c.guest_name,
      c.invitee_phone,
      c.code,
      c.status,
      c.sms_status,
      c.depth,
      c.issuer_id,
      c.created_at,
      c.decided_at,
    ]
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
