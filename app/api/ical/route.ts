import { getSettings } from '@/lib/settings';
import { buildIcs } from '@/lib/ical';

export const dynamic = 'force-dynamic';

// Public: contains the date, hour, and neighborhood only — never the street.
export async function GET() {
  const s = await getSettings();
  const ics = buildIcs({
    edition: s.edition,
    hood: s.hood,
    igHandle: s.igHandle,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
  });
  if (!ics) return new Response('calendar not configured', { status: 404 });

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="hyperlink.ics"',
      'Cache-Control': 'no-store',
    },
  });
}
