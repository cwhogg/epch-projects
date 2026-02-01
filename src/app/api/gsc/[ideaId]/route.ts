import { NextRequest, NextResponse } from 'next/server';
import { isGSCConfigured, fetchFullAnalytics } from '@/lib/gsc-client';
import { getGSCLink, saveGSCLink, getGSCAnalytics, saveGSCAnalytics, isRedisConfigured } from '@/lib/db';

async function fetchAndCacheAnalytics(ideaId: string, siteUrl: string) {
  const { timeSeries, queryData, pageData } = await fetchFullAnalytics(siteUrl);

  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 3);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 90);

  const analyticsData = {
    ideaId,
    siteUrl,
    fetchedAt: new Date().toISOString(),
    timeSeries,
    queryData,
    pageData,
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };

  if (isRedisConfigured()) {
    await saveGSCAnalytics(ideaId, analyticsData);
    // Update link's lastFetchedAt
    const link = await getGSCLink(ideaId);
    if (link) {
      await saveGSCLink({ ...link, lastFetchedAt: analyticsData.fetchedAt });
    }
  }

  return analyticsData;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> },
) {
  try {
    if (!isGSCConfigured()) {
      return NextResponse.json({ error: 'GSC not configured' }, { status: 503 });
    }
    if (!isRedisConfigured()) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });
    }

    const { ideaId } = await params;
    const link = await getGSCLink(ideaId);

    if (!link) {
      return NextResponse.json({ error: 'No GSC property linked to this idea' }, { status: 404 });
    }

    // Check cache
    const cached = await getGSCAnalytics(ideaId);
    if (cached) {
      return NextResponse.json({ analytics: cached, cached: true });
    }

    const analytics = await fetchAndCacheAnalytics(ideaId, link.siteUrl);
    return NextResponse.json({ analytics, cached: false });
  } catch (error) {
    console.error('Error fetching GSC analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> },
) {
  try {
    if (!isGSCConfigured()) {
      return NextResponse.json({ error: 'GSC not configured' }, { status: 503 });
    }
    if (!isRedisConfigured()) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });
    }

    const { ideaId } = await params;
    const link = await getGSCLink(ideaId);

    if (!link) {
      return NextResponse.json({ error: 'No GSC property linked to this idea' }, { status: 404 });
    }

    // Force refresh — skip cache
    const analytics = await fetchAndCacheAnalytics(ideaId, link.siteUrl);
    return NextResponse.json({ analytics, cached: false });
  } catch (error) {
    console.error('Error refreshing GSC analytics:', error);
    return NextResponse.json({ error: 'Failed to refresh analytics' }, { status: 500 });
  }
}
