import { NextResponse } from 'next/server';
import { worldState } from '@/lib/invites';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// Boot payload for the terminal: live-world occupancy plus the event copy.
export async function GET() {
  const [state, settings] = await Promise.all([worldState(), getSettings()]);
  return NextResponse.json({
    full: state.full,
    accepted: state.accepted,
    capacity: state.capacity,
    spotsRemaining: state.remaining,
    settings: {
      edition: settings.edition,
      eventDate: settings.eventDate,
      eventTime: settings.eventTime,
      hood: settings.hood,
      igHandle: settings.igHandle,
      igUrl: settings.igUrl,
      // Only offer the calendar when there is a real datetime behind it.
      hasCalendar: Boolean(settings.startsAt && settings.endsAt),
    },
  });
}
