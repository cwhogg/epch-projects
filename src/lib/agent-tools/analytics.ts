import Anthropic from '@anthropic-ai/sdk';
import type { ToolDefinition } from '@/types';
import { fetchSearchAnalytics } from '@/lib/gsc-client';
import {
  saveWeeklySnapshot,
  getWeeklySnapshot,
  saveSiteSnapshot,
  saveWeeklyReport,
  addPerformanceAlerts,
} from '@/lib/analytics-db';
import {
  getWeekId,
  buildSlugLookup,
  createPieceSnapshots,
  detectChanges,
} from '@/lib/analytics-agent';
import type {
  PieceSnapshot,
  WeeklyReport,
  GSCQueryRow,
  ContentType,
} from '@/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

/**
 * Build all tools for the analytics agent.
 * siteUrl is injected from the environment at agent construction time.
 */
export function createAnalyticsTools(siteUrl: string): ToolDefinition[] {
  // Shared state across tool calls within a single agent run
  let cachedPageData: GSCQueryRow[] | null = null;
  let cachedQueryPageData: GSCQueryRow[] | null = null;
  let cachedSlugLookup: Map<string, { ideaId: string; pieceId: string; title: string; type: ContentType }> | null = null;
  let cachedSnapshots: PieceSnapshot[] | null = null;
  let cachedUnmatchedPages: GSCQueryRow[] | null = null;
  let cachedWeekId: string | null = null;

  return [
    {
      name: 'fetch_gsc_page_data',
      description:
        'Fetch page-level Google Search Console analytics for the past 7 days (with 3-day delay). Returns click/impression/position data per page URL.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        const weekId = getWeekId();
        cachedWeekId = weekId;

        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 3);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 7);

        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        cachedPageData = (await fetchSearchAnalytics(siteUrl, startStr, endStr, ['page'], 500)) as GSCQueryRow[];

        return {
          weekId,
          dateRange: `${startStr} to ${endStr}`,
          pageCount: cachedPageData.length,
          topPages: cachedPageData.slice(0, 10).map((p) => ({
            page: p.query,
            clicks: p.clicks,
            impressions: p.impressions,
            position: Math.round(p.position * 10) / 10,
          })),
        };
      },
    },

    {
      name: 'fetch_gsc_query_data',
      description:
        'Fetch query+page level GSC data — shows which search queries drive traffic to each page. Run after fetch_gsc_page_data.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 3);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 7);

        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        cachedQueryPageData = (await fetchSearchAnalytics(siteUrl, startStr, endStr, ['query', 'page'], 1000)) as GSCQueryRow[];

        return {
          rowCount: cachedQueryPageData.length,
          topQueries: cachedQueryPageData
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 15)
            .map((q) => ({
              query: q.query,
              page: q.page,
              clicks: q.clicks,
              impressions: q.impressions,
              position: Math.round(q.position * 10) / 10,
            })),
        };
      },
    },

    {
      name: 'load_published_pieces',
      description:
        'Load all published content pieces and build a slug lookup map. Returns the number of published pieces and their slugs.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        cachedSlugLookup = await buildSlugLookup();
        const slugs = Array.from(cachedSlugLookup.entries()).map(([slug, info]) => ({
          slug,
          title: info.title,
          type: info.type,
          ideaId: info.ideaId,
        }));
        return {
          publishedPieceCount: cachedSlugLookup.size,
          pieces: slugs,
        };
      },
    },

    {
      name: 'match_pages_to_pieces',
      description:
        'Match GSC page data to published content pieces by slug. Creates piece snapshots and identifies unmatched pages. Requires fetch_gsc_page_data, fetch_gsc_query_data, and load_published_pieces to have been called first.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!cachedPageData || !cachedQueryPageData || !cachedSlugLookup || !cachedWeekId) {
          return { error: 'Must call fetch_gsc_page_data, fetch_gsc_query_data, and load_published_pieces first' };
        }

        const { snapshots, unmatchedPages } = createPieceSnapshots(
          cachedWeekId,
          cachedPageData,
          cachedQueryPageData,
          cachedSlugLookup,
        );

        cachedSnapshots = snapshots;
        cachedUnmatchedPages = unmatchedPages;

        // Save snapshots
        await saveWeeklySnapshot(cachedWeekId, snapshots);

        return {
          matchedPieces: snapshots.length,
          unmatchedPages: unmatchedPages.length,
          snapshots: snapshots.map((s) => ({
            slug: s.slug,
            title: s.title,
            clicks: s.clicks,
            impressions: s.impressions,
            position: s.position,
            topQueries: s.topQueries.slice(0, 3),
          })),
        };
      },
    },

    {
      name: 'compare_weeks',
      description:
        'Compare current week snapshots against previous week. Detects significant changes and generates performance alerts. Requires match_pages_to_pieces to have been called first.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!cachedSnapshots || !cachedWeekId) {
          return { error: 'Must call match_pages_to_pieces first' };
        }

        // Parse previous week
        const [yearStr, weekStr] = cachedWeekId.split('-W');
        const year = parseInt(yearStr);
        const week = parseInt(weekStr);
        const jan4 = new Date(Date.UTC(year, 0, 4));
        const dayOfWeek = jan4.getUTCDay() || 7;
        const monday = new Date(jan4);
        monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
        monday.setUTCDate(monday.getUTCDate() - 7);
        const previousWeekId = getWeekId(monday);

        const previousSnapshots = await getWeeklySnapshot(previousWeekId);
        const alerts = detectChanges(cachedSnapshots, previousSnapshots);

        // Calculate site-level summaries
        const totalClicks = cachedSnapshots.reduce((sum, s) => sum + s.clicks, 0);
        const totalImpressions = cachedSnapshots.reduce((sum, s) => sum + s.impressions, 0);
        const prevTotalClicks = previousSnapshots.reduce((sum, s) => sum + s.clicks, 0);
        const prevTotalImpressions = previousSnapshots.reduce((sum, s) => sum + s.impressions, 0);

        return {
          currentWeek: cachedWeekId,
          previousWeek: previousWeekId,
          hasPreviousData: previousSnapshots.length > 0,
          siteSummary: {
            totalClicks,
            totalImpressions,
            clicksChange: previousSnapshots.length > 0 ? totalClicks - prevTotalClicks : null,
            impressionsChange: previousSnapshots.length > 0 ? totalImpressions - prevTotalImpressions : null,
          },
          alerts: alerts.map((a) => ({
            piece: a.pieceTitle,
            severity: a.severity,
            message: a.message,
          })),
          previousSnapshotCount: previousSnapshots.length,
        };
      },
    },

    {
      name: 'generate_insights',
      description:
        'Generate actionable insights from the analytics data using an LLM. Provide the raw data summary (site totals, per-piece performance, alerts, week-over-week changes) and get back a structured analysis with specific recommendations. Call this after compare_weeks.',
      input_schema: {
        type: 'object',
        properties: {
          dataSummary: {
            type: 'string',
            description: 'A summary of the analytics data including site totals, top-performing pieces, alerts, and week-over-week changes',
          },
        },
        required: ['dataSummary'],
      },
      execute: async (input) => {
        const summary = input.dataSummary as string;

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: `You are an SEO analytics expert interpreting Google Search Console data for a content marketing site.

DATA:
${summary}

Produce a concise analysis with these sections:
1. **Key Wins** — What content is performing well and why (2-3 bullet points)
2. **Concerns** — What content is underperforming or declining (2-3 bullet points)
3. **Recommendations** — Specific, actionable next steps (3-5 bullet points). Examples:
   - "Write a follow-up to [post X] targeting related keyword [Y]"
   - "Update [post Z] with more comprehensive H2 sections to improve position"
   - "The [keyword] cluster is showing strong impressions — create a comparison piece"
4. **Priority Keywords** — Top 3 keywords to focus on next week, with reasoning

Be specific — reference actual post titles, keywords, and numbers. No generic advice.`,
          }],
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        return { insights: text };
      },
    },

    {
      name: 'save_report',
      description:
        'Compile and save the final weekly analytics report to Redis. Call this after all analysis is complete. Provide your insights summary as the insights parameter.',
      input_schema: {
        type: 'object',
        properties: {
          insights: {
            type: 'string',
            description: 'Your analysis and actionable recommendations based on the data',
          },
        },
        required: ['insights'],
      },
      execute: async (input) => {
        if (!cachedSnapshots || !cachedWeekId || !cachedSlugLookup) {
          return { error: 'Must complete data collection steps first' };
        }

        const insights = input.insights as string;

        // Calculate all needed summaries
        const totalClicks = cachedSnapshots.reduce((sum, s) => sum + s.clicks, 0);
        const totalImpressions = cachedSnapshots.reduce((sum, s) => sum + s.impressions, 0);
        const averagePosition = cachedSnapshots.length > 0
          ? Math.round((cachedSnapshots.reduce((sum, s) => sum + s.position, 0) / cachedSnapshots.length) * 10) / 10
          : 0;
        const averageCtr = totalImpressions > 0
          ? Math.round((totalClicks / totalImpressions) * 10000) / 10000
          : 0;

        // Get previous week data
        const [yearStr, weekStr] = cachedWeekId.split('-W');
        const year = parseInt(yearStr);
        const week = parseInt(weekStr);
        const jan4 = new Date(Date.UTC(year, 0, 4));
        const dayOfWeek = jan4.getUTCDay() || 7;
        const monday = new Date(jan4);
        monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
        monday.setUTCDate(monday.getUTCDate() - 7);
        const previousWeekId = getWeekId(monday);

        const previousSnapshots = await getWeeklySnapshot(previousWeekId);
        const prevTotalClicks = previousSnapshots.reduce((sum, s) => sum + s.clicks, 0);
        const prevTotalImpressions = previousSnapshots.reduce((sum, s) => sum + s.impressions, 0);

        const alerts = detectChanges(cachedSnapshots, previousSnapshots);

        // Build per-piece comparison (include all published pieces)
        const prevMap = new Map<string, PieceSnapshot>();
        for (const snap of previousSnapshots) {
          prevMap.set(snap.slug, snap);
        }

        const matchedSlugs = new Set(cachedSnapshots.map((s) => s.slug));
        const allSnapshots = [...cachedSnapshots];
        for (const [slug, info] of cachedSlugLookup) {
          if (!matchedSlugs.has(slug)) {
            allSnapshots.push({
              ideaId: info.ideaId,
              pieceId: info.pieceId,
              slug,
              title: info.title,
              type: info.type,
              weekId: cachedWeekId,
              clicks: 0,
              impressions: 0,
              ctr: 0,
              position: 0,
              topQueries: [],
            });
          }
        }

        const pieces = allSnapshots
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

        const report: WeeklyReport = {
          weekId: cachedWeekId,
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
          unmatchedPages: cachedUnmatchedPages || [],
          alerts,
        };

        await saveSiteSnapshot(cachedWeekId, {
          totalClicks,
          totalImpressions,
          averagePosition,
          averageCtr,
        });
        await saveWeeklyReport(report);
        await addPerformanceAlerts(alerts);

        return {
          success: true,
          weekId: cachedWeekId,
          piecesTracked: pieces.length,
          alertCount: alerts.length,
          insights,
        };
      },
    },
  ];
}
