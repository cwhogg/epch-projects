import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured } from '@/lib/db';
import { getWeeklyReport, getReportWeekIds } from '@/lib/analytics-db';

export interface WeeklyChartData {
  weekId: string;
  sites: { [siteName: string]: number }; // siteName -> impressions
  totalImpressions: number;
}

// GET — Returns impressions by week and site for stacked bar chart
export async function GET(request: NextRequest) {
  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const ideaId = request.nextUrl.searchParams.get('ideaId');
    const weekIds = await getReportWeekIds();

    // Limit to last 8 weeks for chart readability
    const recentWeeks = weekIds.slice(0, 8).reverse(); // oldest first for chart

    const chartData: WeeklyChartData[] = [];
    const allSites = new Set<string>();

    for (const weekId of recentWeeks) {
      const report = await getWeeklyReport(weekId);
      if (!report) continue;

      const sites: { [siteName: string]: number } = {};
      let totalImpressions = 0;

      // Group by ideaId (as "site" name)
      for (const piece of report.pieces) {
        // If ideaId filter is set, skip pieces from other ideas
        if (ideaId && piece.ideaId !== ideaId) continue;

        // Use piece title or a short slug as the site name for stacking
        const siteName = piece.title.length > 30
          ? piece.title.slice(0, 27) + '...'
          : piece.title;

        sites[siteName] = (sites[siteName] || 0) + piece.current.impressions;
        totalImpressions += piece.current.impressions;
        allSites.add(siteName);
      }

      chartData.push({ weekId, sites, totalImpressions });
    }

    return NextResponse.json({
      chartData,
      sites: Array.from(allSites),
    });
  } catch (error) {
    console.error('Failed to fetch chart data:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch chart data' },
      { status: 500 },
    );
  }
}
