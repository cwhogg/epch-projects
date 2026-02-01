import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured } from '@/lib/db';
import { getWeeklyReport, getReportWeekIds } from '@/lib/analytics-db';

// GET — Returns latest report or specific week via ?week=2026-W05
export async function GET(request: NextRequest) {
  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const weekParam = request.nextUrl.searchParams.get('week');
    const report = await getWeeklyReport(weekParam ?? undefined);

    if (!report) {
      const weekIds = await getReportWeekIds();
      return NextResponse.json(
        { error: 'No report found', availableWeeks: weekIds },
        { status: 404 },
      );
    }

    const weekIds = await getReportWeekIds();
    return NextResponse.json({ report, availableWeeks: weekIds });
  } catch (error) {
    console.error('Failed to fetch analytics report:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch report' },
      { status: 500 },
    );
  }
}
