import { fetchSearchAnalytics } from '@/lib/gsc-client';
import { CLAUDE_MODEL } from './config';
import { getAllPublishedPiecesMeta, getContentPieces, getAllGSCLinks } from '@/lib/db';
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
import {
  runAgent,
  resumeAgent,
  getAgentState,
  deleteAgentState,
  saveActiveRun,
  getActiveRunId,
  clearActiveRun,
} from '@/lib/agent-runtime';
import { createAnalyticsTools } from '@/lib/agent-tools/analytics';
import { createPlanTools, createScratchpadTools } from '@/lib/agent-tools/common';
import type { AgentConfig } from '@/types';

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
export function getPreviousWeekId(weekId: string): string {
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

// Build per-piece comparison data — include ALL published pieces, even with no GSC data.
// Shared between V1 orchestrator (runAnalyticsAgent) and V2 agent tool (save_report).
export function buildWeeklyReport(
  snapshots: PieceSnapshot[],
  previousSnapshots: PieceSnapshot[],
  slugLookup: Map<string, SlugInfo>,
  weekId: string,
): WeeklyReport['pieces'] {
  const prevMap = new Map<string, PieceSnapshot>();
  for (const snap of previousSnapshots) {
    prevMap.set(snap.slug, snap);
  }

  const matchedSlugs = new Set(snapshots.map((s) => s.slug));

  // Create zero-data snapshots for published pieces not in GSC
  const allSnapshots = [...snapshots];
  for (const [slug, info] of slugLookup) {
    if (!matchedSlugs.has(slug)) {
      allSnapshots.push({
        ideaId: info.ideaId,
        pieceId: info.pieceId,
        slug,
        title: info.title,
        type: info.type,
        weekId,
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
        topQueries: [],
      });
    }
  }

  return allSnapshots
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
  } catch (error) {
    console.debug('[analytics] URL parse failed:', error);
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
  // Get all GSC-linked properties from the database
  const gscLinks = await getAllGSCLinks();

  // Fall back to ANALYTICS_SITE_URL if no GSC links configured
  const fallbackSiteUrl = process.env.ANALYTICS_SITE_URL;

  if (gscLinks.length === 0 && !fallbackSiteUrl) {
    throw new Error('No GSC properties linked. Link a property in the Analytics page or set ANALYTICS_SITE_URL.');
  }

  const siteUrls = gscLinks.length > 0
    ? gscLinks.map(link => link.siteUrl)
    : [fallbackSiteUrl!];

  const weekId = getWeekId();
  const previousWeekId = getPreviousWeekId(weekId);

  console.log(`[analytics] Running for week ${weekId}, sites: ${siteUrls.join(', ')}`);

  // Calculate 7-day window (with 3-day GSC delay)
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 3);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 7);

  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);

  console.log(`[analytics] GSC date range: ${startStr} to ${endStr}`);

  // Fetch GSC data from all linked properties
  const allPageData: GSCQueryRow[] = [];
  const allQueryPageData: GSCQueryRow[] = [];

  for (const siteUrl of siteUrls) {
    try {
      const [pageData, queryPageData] = await Promise.all([
        fetchSearchAnalytics(siteUrl, startStr, endStr, ['page'], 500) as Promise<GSCQueryRow[]>,
        fetchSearchAnalytics(siteUrl, startStr, endStr, ['query', 'page'], 1000) as Promise<GSCQueryRow[]>,
      ]);
      allPageData.push(...pageData);
      allQueryPageData.push(...queryPageData);
      console.log(`[analytics] Fetched ${pageData.length} pages from ${siteUrl}`);
    } catch (error) {
      console.error(`[analytics] Failed to fetch from ${siteUrl}:`, error);
      // Continue with other properties
    }
  }

  console.log(`[analytics] Total: ${allPageData.length} pages, ${allQueryPageData.length} query+page rows across ${siteUrls.length} properties`);

  // Use aggregated data
  const pageData = allPageData;
  const queryPageData = allQueryPageData;

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

  // Calculate site summary from ALL GSC data (not just matched pieces)
  // This ensures homepage and other non-content pages are included in totals
  const totalClicks = pageData.reduce((sum, row) => sum + row.clicks, 0);
  const totalImpressions = pageData.reduce((sum, row) => sum + row.impressions, 0);
  const averagePosition = pageData.length > 0
    ? Math.round((pageData.reduce((sum, row) => sum + row.position, 0) / pageData.length) * 10) / 10
    : 0;
  const averageCtr = totalImpressions > 0
    ? Math.round((totalClicks / totalImpressions) * 10000) / 10000
    : 0;

  const prevTotalClicks = previousSnapshots.reduce((sum, s) => sum + s.clicks, 0);
  const prevTotalImpressions = previousSnapshots.reduce((sum, s) => sum + s.impressions, 0);

  const pieces = buildWeeklyReport(snapshots, previousSnapshots, slugLookup, weekId);

  // Build report
  const report: WeeklyReport = {
    weekId,
    generatedAt: new Date().toISOString(),
    siteUrl: siteUrls.length === 1 ? siteUrls[0] : `${siteUrls.length} properties`,
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

// ---------------------------------------------------------------------------
// V2: Agentic analytics with tool use and LLM-powered insights
// ---------------------------------------------------------------------------

const ANALYTICS_SYSTEM_PROMPT = `You are an analytics agent that tracks SEO performance for content marketing sites using Google Search Console data.

Your job:
1. Create a plan for your analysis
2. Fetch GSC page-level and query-level data
3. Load published content pieces to match against GSC data
4. Match pages to pieces to create performance snapshots
5. Compare current week against previous week to detect changes
6. Call generate_insights with a summary of the data — this uses an LLM to produce expert-level interpretation with specific recommendations
7. Save the final report, using the generated insights as the insights parameter

USING generate_insights:
- After compare_weeks, compile a text summary of the key data points: site totals, top/bottom performing pieces, alerts, week-over-week changes for each piece, and notable queries
- Pass this summary to generate_insights to get structured analysis with Key Wins, Concerns, Recommendations, and Priority Keywords
- Use the returned insights text as the insights parameter when calling save_report

Be specific in your data summaries. Include actual numbers, piece titles, keyword names, and position changes so the insights tool can reference them.

Always call create_plan before starting work, and update_plan as you complete steps.
Use the scratchpad (write_scratchpad / read_scratchpad) to store intermediate calculations or notes you want to reference later in the run.`;

async function runAnalyticsAgentV2(): Promise<WeeklyReport> {
  const siteUrl = process.env.ANALYTICS_SITE_URL;
  if (!siteUrl) {
    throw new Error('ANALYTICS_SITE_URL environment variable is required');
  }

  const weekId = getWeekId();

  // --- Check for a paused run to resume ---
  const existingRunId = await getActiveRunId('analytics', weekId);
  let pausedState = existingRunId ? await getAgentState(existingRunId) : null;
  if (pausedState && pausedState.status !== 'paused') {
    pausedState = null;
  }

  const runId = pausedState ? pausedState.runId : `analytics-${weekId}-${Date.now()}`;

  const tools = [
    ...createPlanTools(runId),
    ...createAnalyticsTools(siteUrl),
    ...createScratchpadTools(),
  ];

  const config: AgentConfig = {
    agentId: 'analytics',
    runId,
    model: CLAUDE_MODEL,
    maxTokens: 4096,
    maxTurns: 15,
    tools,
    systemPrompt: ANALYTICS_SYSTEM_PROMPT,
    onProgress: async (step, detail) => {
      console.log(`[analytics-v2] ${step}: ${detail ?? ''}`);
    },
  };

  // --- Run or resume ---
  let state;
  if (pausedState) {
    console.log(`[analytics-v2] Resuming paused run ${runId} (resume #${pausedState.resumeCount + 1})`);
    state = await resumeAgent(config, pausedState);
  } else {
    const initialMessage = `Run the weekly analytics report for site ${siteUrl}. Current week: ${weekId}. Fetch the data, analyze performance changes, and save a report with actionable insights.`;
    state = await runAgent(config, initialMessage);
  }

  // --- Handle result ---
  if (state.status === 'paused') {
    await saveActiveRun('analytics', weekId, runId);
    throw new Error('AGENT_PAUSED');
  }

  await clearActiveRun('analytics', weekId);
  await deleteAgentState(runId);

  if (state.status === 'error') {
    throw new Error(state.error || 'Analytics agent failed');
  }

  // The report was saved by the save_report tool — fetch it
  const { getWeeklyReport: getReport } = await import('@/lib/analytics-db');
  const report = await getReport(weekId);
  if (!report) {
    throw new Error('Report not found after agent completed');
  }

  return report;
}

/**
 * Entry point that switches between v1 (procedural) and v2 (agentic) based
 * on the AGENT_V2 environment variable.
 */
export async function runAnalyticsAgentAuto(): Promise<WeeklyReport> {
  if (process.env.AGENT_V2 === 'true') {
    return runAnalyticsAgentV2();
  }
  return runAnalyticsAgent();
}
