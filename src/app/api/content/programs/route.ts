import { NextResponse } from 'next/server';
import { isRedisConfigured, getAllContentCalendars } from '@/lib/db';

export async function GET() {
  if (!isRedisConfigured()) {
    return NextResponse.json([]);
  }

  try {
    const calendars = await getAllContentCalendars();
    return NextResponse.json(
      calendars.map((cal) => ({
        ideaId: cal.ideaId,
        ideaName: cal.ideaName,
      })),
    );
  } catch {
    return NextResponse.json([]);
  }
}
