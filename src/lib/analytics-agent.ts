import { fetchSearchAnalytics } from '@/lib/gsc-client';
import { getAllPublishedPiecesMeta, getContentPieces } from '@/lib/db';
import {
  saveWeeklySnapshot,
  getWeeklySnapshot,
  saveSiteSnapshot,
  saveWeeklyReport,
  addPerformanceAlerts,
} from '@/lib/analytics-db';
import {
  PieceSnapshot,
  PerformanceAlert,
  WeeklyReport,
  GSCQueryRow,
  ContentType,
} from '@/types';

// Returns ISO week string like "2026-W05"
export function getWeekId(date?: Date): string {
  const d = date ? new Date(date) : new Date();
  d.setUTCHours(0, 0, 0, 0);
  // Thursday of the current week determines the year
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getUTCDay() + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Get the previous week's ID
function getPreviousWeekId(weekId: string): string {
  // Parse the week ID and go back 7 days
  const [yearStr, weekStr] = weekId.split('-W');
  const year = parseInt(yearStr);
  const week = parseInt(weekStr);

  // Create a date in that week (Thursday), then subtract 7 days
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  monday.setUTCDate(monday.getUTCDate() - 7);
  return getWeekId(monday);
}

interface SlugInfo {
  ideaId: string;
  pieceId: string;
  title: string;
  type: ContentType;
}

// Build slug → piece info lookup from published_pieces_meta + content_pieces
export async function buildSlugLookup(): Promise<Map<string, SlugInfo>> {
  const allMeta = await getAllPublishedPiecesMeta();
  const lookup = new Map<string, SlugInfo>();

  // Group by ideaId to batch content piece lookups
  const ideaIds = new Set<string>();
  const metaByKey: Record<string, { ideaId: string; pieceId: string; slug: string }> = {};

  for (const [key, meta] of Object.entries(allMeta)) {
    const [ideaId, pieceId] = key.split(':');
    ideaIds.add(ideaId);
    metaByKey[key] = { ideaId, pieceId, slug: meta.slug };
  }

  // Fetch content pieces to get title and type
  const piecesMap = new Map<string, { title: string; type: ContentType }>();
  for (const ideaId of ideaIds) {
    const pieces = await getContentPieces(ideaId);
    for (const piece of pieces) {
      piecesMap.set(`${ideaId}:${piece.id}`, { title: piece.title, type: piece.type });
    }
  }

  for (const [key, { ideaId, pieceId, slug }] of Object.entries(metaByKey)) {
    const pieceInfo = piecesMap.get(key);
    lookup.set(slug, {
      ideaId,
      pieceId,
      title: pieceInfo?.title ?? slug,
      type: pieceInfo?.type ?? 'blog-post',
    });
  }

  return lookup;
}

// Extract slug from a GSC page URL path
export function matchUrlToSlug(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    // Expect format like /blog/some-slug or /landing-page/some-slug
    if (parts.length >= 2) {
      return parts[parts.length - 1];
    }
    return null;
  } catch {
    return null;
  }
}

// Create piece snapshots by matching GSC pages to published pieces
export function createPieceSnapshots(
  weekId: string,
  gscPageData: GSCQueryRow[],
  gscQueryPageData: GSCQueryRow[],
  slugLookup: Map<string, SlugInfo>,
): { snapshots: PieceSnapshot[]; unmatchedPages: GSCQueryRow[] } {
  const snapshots: PieceSnapshot[] = [];
  const unmatchedPages: GSCQueryRow[] = [];

  // Build per-page query data lookup
  const queryByPage = new Map<string, GSCQueryRow[]>();
  for (const row of gscQueryPageData) {
    if (row.page) {
      const existing = queryByPage.get(row.page) || [];
      existing.push(row);
      queryByPage.set(row.page, existing);
    }
  }

  for (const pageRow of gscPageData) {
    const pageUrl = pageRow.query; // In page-dimension results, the URL is in the query field
    const slug = matchUrlToSlug(pageUrl);

    if (!slug) {
      unmatchedPages.push(pageRow);
      continue;
    }

    const pieceInfo = slugLookup.get(slug);
    if (!pieceInfo) {
      unmatchedPages.push(pageRow);
      continue;
    }

    // Get top queries for this page
    const pageQueries = queryByPage.get(pageUrl) || [];
    const topQueries = pageQueries
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, 10)
      .map((q) => ({
        query: q.query,
        clicks: q.clicks,
        impressions: q.impressions,
        position: Math.round(q.position * 10) / 10,
      }));

    snapshots.push({
      ideaId: pieceInfo.ideaId,
      pieceId: pieceInfo.pieceId,
      slug,
      title: pieceInfo.title,
      type: pieceInfo.type,
      weekId,
      clicks: pageRow.clicks,
      impressions: pageRow.impressions,
      ctr: Math.round(pageRow.ctr * 10000) / 10000,
      position: Math.round(pageRow.position * 10) / 10,
      topQueries,
    });
  }

  return { snapshots, unmatchedPages };
}

// Detect significant changes between current and previous week
export function detectChanges(
  currentSnapshots: PieceSnapshot[],
  previousSnapshots: PieceSnapshot[],
): PerformanceAlert[] {
  const alerts: PerformanceAlert[] = [];
  const prevMap = new Map<string, PieceSnapshot>();
  for (const snap of previousSnapshots) {
    prevMap.set(snap.slug, snap);
  }

  for (const current of currentSnapshots) {
    const prev = prevMap.get(current.slug);
    const minImpressions = 10;

    // First appearance check
    if (!prev && current.impressions >= minImpressions) {
      alerts.push({
        pieceSlug: current.slug,
        pieceTitle: current.title,
        severity: 'info',
        message: `First appearance in GSC with ${current.impressions} impressions and ${current.clicks} clicks`,
        metric: 'impressions',
        previousValue: 0,
        currentValue: current.impressions,
      });
      continue;
    }

    if (!prev) continue;

    // Skip noisy low-impression pieces
    if (current.impressions < minImpressions && prev.impressions < minImpressions) continue;

    // Clicks up >= 50%
    if (prev.clicks > 0 && current.clicks >= prev.clicks * 1.5) {
      alerts.push({
        pieceSlug: current.slug,
        pieceTitle: current.title,
        severity: 'positive',
        message: `Clicks up ${Math.round(((current.clicks - prev.clicks) / prev.clicks) * 100)}% (${prev.clicks} → ${current.clicks})`,
        metric: 'clicks',
        previousValue: prev.clicks,
        currentValue: current.clicks,
      });
    }

    // Clicks down >= 30%
    if (prev.clicks > 0 && current.clicks <= prev.clicks * 0.7) {
      alerts.push({
        pieceSlug: current.slug,
        pieceTitle: current.title,
        severity: 'warning',
        message: `Clicks down ${Math.round(((prev.clicks - current.clicks) / prev.clicks) * 100)}% (${prev.clicks} → ${current.clicks})`,
        metric: 'clicks',
        previousValue: prev.clicks,
        currentValue: current.clicks,
      });
    }

    // Position improved by >= 5 (lower is better)
    if (prev.position - current.position >= 5) {
      alerts.push({
        pieceSlug: current.slug,
        pieceTitle: current.title,
        severity: 'positive',
        message: `Position improved by ${Math.round((prev.position - current.position) * 10) / 10} (${prev.position} → ${current.position})`,
        metric: 'position',
        previousValue: prev.position,
        currentValue: current.position,
      });
    }

    // Position dropped by >= 5
    if (current.position - prev.position >= 5) {
      alerts.push({
        pieceSlug: current.slug,
        pieceTitle: current.title,
        severity: 'warning',
        message: `Position dropped by ${Math.round((current.position - prev.position) * 10) / 10} (${prev.position} → ${current.position})`,
        metric: 'position',
        previousValue: prev.position,
        currentValue: current.position,
      });
    }

    // Had >5 clicks, now 0
    if (prev.clicks > 5 && current.clicks === 0) {
      alerts.push({
        pieceSlug: current.slug,
        pieceTitle: current.title,
        severity: 'warning',
        message: `Traffic lost — had ${prev.clicks} clicks, now 0`,
        metric: 'clicks',
        previousValue: prev.clicks,
        currentValue: 0,
      });
    }
  }

  return alerts;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Main orchestrator
export async function runAnalyticsAgent(): Promise<WeeklyReport> {
  const siteUrl = process.env.ANALYTICS_SITE_URL;
  if (!siteUrl) {
    throw new Error('ANALYTICS_SITE_URL environment variable is required');
  }

  const weekId = getWeekId();
  const previousWeekId = getPreviousWeekId(weekId);

  console.log(`[analytics] Running for week ${weekId}, site: ${siteUrl}`);

  // Calculate 28-day window (with 3-day GSC delay)
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 3);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 28);

  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);

  console.log(`[analytics] GSC date range: ${startStr} to ${endStr}`);

  // Fetch GSC data: page-level and query+page level
  const [pageData, queryPageData] = await Promise.all([
    fetchSearchAnalytics(siteUrl, startStr, endStr, ['page'], 500) as Promise<GSCQueryRow[]>,
    fetchSearchAnalytics(siteUrl, startStr, endStr, ['query', 'page'], 1000) as Promise<GSCQueryRow[]>,
  ]);

  console.log(`[analytics] Fetched ${pageData.length} pages, ${queryPageData.length} query+page rows`);

  // Build slug lookup from published pieces
  const slugLookup = await buildSlugLookup();
  console.log(`[analytics] Built slug lookup with ${slugLookup.size} published pieces`);

  // Match pages to pieces
  const { snapshots, unmatchedPages } = createPieceSnapshots(weekId, pageData, queryPageData, slugLookup);
  console.log(`[analytics] Matched ${snapshots.length} pieces, ${unmatchedPages.length} unmatched pages`);

  // Store current week snapshots
  await saveWeeklySnapshot(weekId, snapshots);

  // Get previous week for comparison
  const previousSnapshots = await getWeeklySnapshot(previousWeekId);
  console.log(`[analytics] Previous week ${previousWeekId}: ${previousSnapshots.length} snapshots`);

  // Detect changes
  const alerts = detectChanges(snapshots, previousSnapshots);
  console.log(`[analytics] Generated ${alerts.length} alerts`);

  // Calculate site summary
  const totalClicks = snapshots.reduce((sum, s) => sum + s.clicks, 0);
  const totalImpressions = snapshots.reduce((sum, s) => sum + s.impressions, 0);
  const averagePosition = snapshots.length > 0
    ? Math.round((snapshots.reduce((sum, s) => sum + s.position, 0) / snapshots.length) * 10) / 10
    : 0;
  const averageCtr = totalImpressions > 0
    ? Math.round((totalClicks / totalImpressions) * 10000) / 10000
    : 0;

  const prevTotalClicks = previousSnapshots.reduce((sum, s) => sum + s.clicks, 0);
  const prevTotalImpressions = previousSnapshots.reduce((sum, s) => sum + s.impressions, 0);

  // Build per-piece comparison data
  const prevMap = new Map<string, PieceSnapshot>();
  for (const snap of previousSnapshots) {
    prevMap.set(snap.slug, snap);
  }

  const pieces = snapshots
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .map((current) => {
      const prev = prevMap.get(current.slug) ?? null;
      return {
        ideaId: current.ideaId,
        pieceId: current.pieceId,
        slug: current.slug,
        title: current.title,
        type: current.type,
        current,
        previous: prev,
        clicksChange: prev ? current.clicks - prev.clicks : null,
        impressionsChange: prev ? current.impressions - prev.impressions : null,
        positionChange: prev ? Math.round((current.position - prev.position) * 10) / 10 : null,
      };
    });

  // Build report
  const report: WeeklyReport = {
    weekId,
    generatedAt: new Date().toISOString(),
    siteUrl,
    siteSummary: {
      totalClicks,
      totalImpressions,
      averagePosition,
      averageCtr,
      clicksChange: previousSnapshots.length > 0 ? totalClicks - prevTotalClicks : null,
      impressionsChange: previousSnapshots.length > 0 ? totalImpressions - prevTotalImpressions : null,
    },
    pieces,
    unmatchedPages,
    alerts,
  };

  // Store site snapshot
  await saveSiteSnapshot(weekId, {
    totalClicks,
    totalImpressions,
    averagePosition,
    averageCtr,
  });

  // Store report and alerts
  await saveWeeklyReport(report);
  await addPerformanceAlerts(alerts);

  console.log(`[analytics] Report saved for week ${weekId}`);

  return report;
}
