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

      // Use unmatchedPages which contain site-level data with actual impressions
      // The query field contains the page URL like "https://carecircle-six.vercel.app/"
      for (const page of report.unmatchedPages) {
        if (page.impressions === 0) continue;

        // Extract domain from URL for grouping
        let siteName: string;
        try {
          const url = new URL(page.query);
          siteName = url.hostname.replace('www.', '');
        } catch {
          // If not a URL, use the query as-is (truncated)
          siteName = page.query.length > 25 ? page.query.slice(0, 22) + '...' : page.query;
        }

        sites[siteName] = (sites[siteName] || 0) + page.impressions;
        totalImpressions += page.impressions;
        allSites.add(siteName);
      }

      // Also include matched pieces with impressions
      for (const piece of report.pieces) {
        if (piece.current.impressions === 0) continue;
        if (ideaId && piece.ideaId !== ideaId) continue;

        // Use a site identifier based on piece slug domain if available
        const siteName = piece.slug.split('/')[0] || 'content';
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
