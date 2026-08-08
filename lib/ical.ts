// ── Calendar file ────────────────────────────────────────────────────
// The terminal's date strings ("FRI 08.22") are written for atmosphere,
// not for parsing, so the calendar reads separate machine datetimes.
// If those are blank, no calendar is offered — better than a wrong date.

const TZ = 'America/New_York';

/**
 * Offset of a timezone at a given instant, in minutes. Uses Intl rather
 * than a hardcoded -4/-5 so an event booked in November is still correct
 * after the clocks change.
 */
function tzOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second')
  );
  return (asUtc - instant.getTime()) / 60000;
}

/** Interpret "2026-08-22T21:00" as New York wall-clock time. */
export function nyLocalToUtc(local: string): Date | null {
  const m = local.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/);
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const guess = new Date(naive);
  return new Date(naive - tzOffsetMinutes(guess) * 60000);
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** RFC 5545 says fold long lines at 75 octets; calendars are strict about it. */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const out: string[] = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length > 73) {
    out.push(' ' + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  if (rest) out.push(' ' + rest);
  return out.join('\r\n');
}

const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export type IcsInput = {
  edition: string;
  hood: string;
  igHandle: string;
  startsAt: string;
  endsAt: string;
};

/** Returns null when the datetimes are unset or unparseable. */
export function buildIcs(opts: IcsInput): string | null {
  const start = nyLocalToUtc(opts.startsAt);
  const end = nyLocalToUtc(opts.endsAt);
  if (!start || !end || end <= start) return null;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HYPERLINK//NYC//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // Stable per edition, so re-adding updates rather than duplicates.
    `UID:${opts.edition.replace(/\s+/g, '-').toLowerCase()}@hyperlink.nyc`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`HYPERLINK — ${opts.edition}`)}`,
    // Neighborhood only. The exact address is never in the calendar file.
    `LOCATION:${esc(opts.hood)}`,
    `DESCRIPTION:${esc(
      `You're on the list.\n\nExact address drops on Instagram — follow ${opts.igHandle}. ` +
        `The account is private; request it and we'll let you in.\n\nBYOB. No cover.`
    )}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT3H',
    'ACTION:DISPLAY',
    'DESCRIPTION:HYPERLINK tonight',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n');
}
