import { NextResponse } from 'next/server';
import { acceptedCount } from '@/lib/invites';
import { CAPACITY } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const accepted = await acceptedCount();
  return NextResponse.json({
    full: accepted >= CAPACITY,
    accepted,
    capacity: CAPACITY,
    spotsRemaining: Math.max(0, CAPACITY - accepted),
  });
}
