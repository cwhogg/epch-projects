import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PieceSnapshot, ContentType, PerformanceAlert } from '@/types';

// --- Mocks ---

vi.mock('@/lib/gsc-client', () => ({
  fetchSearchAnalytics: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/analytics-db', () => ({
  saveWeeklySnapshot: vi.fn().mockResolvedValue(undefined),
  getWeeklySnapshot: vi.fn().mockResolvedValue([]),
  saveSiteSnapshot: vi.fn().mockResolvedValue(undefined),
  saveWeeklyReport: vi.fn().mockResolvedValue(undefined),
  addPerformanceAlerts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/analytics-agent', () => ({
  getWeekId: vi.fn().mockReturnValue('2026-W07'),
  getPreviousWeekId: vi.fn().mockReturnValue('2026-W06'),
  buildSlugLookup: vi.fn().mockResolvedValue(new Map()),
  buildWeeklyReport: vi.fn().mockReturnValue([]),
  createPieceSnapshots: vi.fn().mockReturnValue({ snapshots: [], unmatchedPages: [] }),
  detectChanges: vi.fn().mockReturnValue([]),
}));

vi.mock('../../anthropic', () => ({
  getAnthropic: vi.fn().mockReturnValue({
    messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '' }] }) },
  }),
}));

vi.mock('../../config', () => ({
  CLAUDE_MODEL: 'test-model',
}));

import { createAnalyticsTools } from '../analytics';
import { getWeeklySnapshot } from '@/lib/analytics-db';
import { detectChanges, createPieceSnapshots, buildSlugLookup, buildWeeklyReport } from '@/lib/analytics-agent';
import { fetchSearchAnalytics } from '@/lib/gsc-client';

// --- Helpers ---

function makePieceSnapshot(overrides: Partial<PieceSnapshot> = {}): PieceSnapshot {
  return {
    ideaId: 'idea-1',
    pieceId: 'piece-1',
    slug: 'test-post',
    title: 'Test Post',
    type: 'blog-post' as ContentType,
    weekId: '2026-W07',
    clicks: 10,
    impressions: 100,
    ctr: 0.1,
    position: 5.2,
    topQueries: [{ query: 'test', clicks: 5, impressions: 50, position: 3 }],
    ...overrides,
  };
}

function makeAlert(overrides: Partial<PerformanceAlert> = {}): PerformanceAlert {
  return {
    pieceSlug: 'test-post',
    pieceTitle: 'Test Post',
    severity: 'positive',
    message: 'Clicks up',
    metric: 'clicks',
    previousValue: 5,
    currentValue: 10,
    ...overrides,
  };
}

function findTool(tools: ReturnType<typeof createAnalyticsTools>, name: string) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool;
}

/** Run the prerequisite tools (fetch_gsc, load_pieces, match) so that compare_weeks / save_report can execute. */
async function runPrerequisites(tools: ReturnType<typeof createAnalyticsTools>) {
  await findTool(tools, 'fetch_gsc_page_data').execute({});
  await findTool(tools, 'fetch_gsc_query_data').execute({});
  await findTool(tools, 'load_published_pieces').execute({});
  await findTool(tools, 'match_pages_to_pieces').execute({});
}

// --- Tests ---

describe('analytics tools caching', () => {
  const currentSnapshots = [makePieceSnapshot()];
  const previousSnapshots = [makePieceSnapshot({ weekId: '2026-W06', clicks: 5 })];
  const alerts = [makeAlert()];
  const slugLookup = new Map([['test-post', { ideaId: 'idea-1', pieceId: 'piece-1', title: 'Test Post', type: 'blog-post' as ContentType }]]);

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up standard mock returns
    (fetchSearchAnalytics as ReturnType<typeof vi.fn>).mockResolvedValue([
      { query: 'https://example.com/blog/test-post', page: 'https://example.com/blog/test-post', clicks: 10, impressions: 100, ctr: 0.1, position: 5.2 },
    ]);
    (buildSlugLookup as ReturnType<typeof vi.fn>).mockResolvedValue(slugLookup);
    (createPieceSnapshots as ReturnType<typeof vi.fn>).mockReturnValue({ snapshots: currentSnapshots, unmatchedPages: [] });
    (getWeeklySnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(previousSnapshots);
    (detectChanges as ReturnType<typeof vi.fn>).mockReturnValue(alerts);
    (buildWeeklyReport as ReturnType<typeof vi.fn>).mockReturnValue([]);
  });

  it('when compare_weeks runs before save_report, getWeeklySnapshot is called once for previous week', async () => {
    const tools = createAnalyticsTools('https://example.com');
    await runPrerequisites(tools);

    // compare_weeks fetches previous snapshots
    await findTool(tools, 'compare_weeks').execute({});
    expect(getWeeklySnapshot).toHaveBeenCalledTimes(1);
    expect(getWeeklySnapshot).toHaveBeenCalledWith('2026-W06');

    // save_report should reuse cached data, NOT call getWeeklySnapshot again
    await findTool(tools, 'save_report').execute({ insights: 'test insights' });
    expect(getWeeklySnapshot).toHaveBeenCalledTimes(1);
  });

  it('when compare_weeks runs before save_report, detectChanges is called once', async () => {
    const tools = createAnalyticsTools('https://example.com');
    await runPrerequisites(tools);

    await findTool(tools, 'compare_weeks').execute({});
    expect(detectChanges).toHaveBeenCalledTimes(1);

    await findTool(tools, 'save_report').execute({ insights: 'test insights' });
    expect(detectChanges).toHaveBeenCalledTimes(1);
  });

  it('when save_report runs without prior compare_weeks, it still fetches and works', async () => {
    const tools = createAnalyticsTools('https://example.com');
    await runPrerequisites(tools);

    // Skip compare_weeks, go straight to save_report
    const result = await findTool(tools, 'save_report').execute({ insights: 'test insights' });
    expect(getWeeklySnapshot).toHaveBeenCalledTimes(1);
    expect(getWeeklySnapshot).toHaveBeenCalledWith('2026-W06');
    expect(detectChanges).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true, weekId: '2026-W07' });
  });

  it('save_report uses cached alerts in the report when compare_weeks ran first', async () => {
    const tools = createAnalyticsTools('https://example.com');
    await runPrerequisites(tools);

    await findTool(tools, 'compare_weeks').execute({});
    const result = await findTool(tools, 'save_report').execute({ insights: 'test insights' });

    expect(result).toMatchObject({ success: true, alertCount: 1 });
  });

  // Error path tests

  it('getWeeklySnapshot rejection propagates from compare_weeks', async () => {
    (getWeeklySnapshot as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Redis connection failed'));

    const tools = createAnalyticsTools('https://example.com');
    await runPrerequisites(tools);

    await expect(findTool(tools, 'compare_weeks').execute({})).rejects.toThrow('Redis connection failed');
  });

  it('getWeeklySnapshot rejection propagates from save_report fallback path', async () => {
    (getWeeklySnapshot as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Redis timeout'));

    const tools = createAnalyticsTools('https://example.com');
    await runPrerequisites(tools);

    // No prior compare_weeks, so save_report must fetch — and it should fail
    await expect(findTool(tools, 'save_report').execute({ insights: 'test' })).rejects.toThrow('Redis timeout');
  });
});
