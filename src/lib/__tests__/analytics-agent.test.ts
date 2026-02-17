import { describe, it, expect } from 'vitest';
import { getWeekId, matchUrlToSlug, detectChanges, getPreviousWeekId, buildWeeklyReport } from '../analytics-agent';
import type { PieceSnapshot, ContentType } from '@/types';

describe('getWeekId', () => {
  it('returns ISO week string format YYYY-Www', () => {
    const result = getWeekId(new Date('2026-01-05'));
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('handles Jan 1', () => {
    const result = getWeekId(new Date('2026-01-01'));
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('handles Dec 31', () => {
    const result = getWeekId(new Date('2026-12-31'));
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('uses current date when no argument provided', () => {
    const result = getWeekId();
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('returns consistent results for same-week dates', () => {
    // Monday and Friday of same week should return same week ID
    const mon = getWeekId(new Date('2026-02-02')); // Monday
    const fri = getWeekId(new Date('2026-02-06')); // Friday
    expect(mon).toBe(fri);
  });
});

describe('matchUrlToSlug', () => {
  it('extracts slug from /blog/some-slug URL', () => {
    expect(matchUrlToSlug('https://example.com/blog/my-article')).toBe('my-article');
  });

  it('extracts slug from deeper path', () => {
    expect(matchUrlToSlug('https://example.com/compare/a-vs-b')).toBe('a-vs-b');
  });

  it('returns null for root URL', () => {
    expect(matchUrlToSlug('https://example.com/')).toBeNull();
  });

  it('returns null for single-segment path', () => {
    expect(matchUrlToSlug('https://example.com/about')).toBeNull();
  });

  it('returns null for invalid URL', () => {
    expect(matchUrlToSlug('not-a-url')).toBeNull();
  });
});

describe('detectChanges', () => {
  const makeSnapshot = (overrides: Record<string, unknown> = {}) => ({
    ideaId: 'idea-1',
    pieceId: 'piece-1',
    slug: 'test-article',
    title: 'Test Article',
    type: 'blog-post' as const,
    weekId: '2026-W05',
    clicks: 10,
    impressions: 100,
    ctr: 0.1,
    position: 15,
    topQueries: [],
    ...overrides,
  });

  it('returns empty array when no changes detected', () => {
    const current = [makeSnapshot()];
    const previous = [makeSnapshot()];
    expect(detectChanges(current, previous)).toEqual([]);
  });

  it('detects first appearance', () => {
    const current = [makeSnapshot({ impressions: 50 })];
    const alerts = detectChanges(current, []);
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('info');
    expect(alerts[0].message).toContain('First appearance');
  });

  it('detects clicks up >= 50%', () => {
    const current = [makeSnapshot({ clicks: 20 })];
    const previous = [makeSnapshot({ clicks: 10 })];
    const alerts = detectChanges(current, previous);
    expect(alerts.some((a) => a.severity === 'positive' && a.metric === 'clicks')).toBe(true);
  });

  it('detects clicks down >= 30%', () => {
    const current = [makeSnapshot({ clicks: 5 })];
    const previous = [makeSnapshot({ clicks: 10 })];
    const alerts = detectChanges(current, previous);
    expect(alerts.some((a) => a.severity === 'warning' && a.metric === 'clicks')).toBe(true);
  });

  it('detects position improved by >= 5', () => {
    const current = [makeSnapshot({ position: 5 })];
    const previous = [makeSnapshot({ position: 15 })];
    const alerts = detectChanges(current, previous);
    expect(alerts.some((a) => a.severity === 'positive' && a.metric === 'position')).toBe(true);
  });

  it('detects position dropped by >= 5', () => {
    const current = [makeSnapshot({ position: 25 })];
    const previous = [makeSnapshot({ position: 15 })];
    const alerts = detectChanges(current, previous);
    expect(alerts.some((a) => a.severity === 'warning' && a.metric === 'position')).toBe(true);
  });

  it('detects traffic lost (had >5 clicks, now 0)', () => {
    const current = [makeSnapshot({ clicks: 0 })];
    const previous = [makeSnapshot({ clicks: 10 })];
    const alerts = detectChanges(current, previous);
    expect(alerts.some((a) => a.message.includes('Traffic lost'))).toBe(true);
  });

  it('ignores low-impression noise', () => {
    const current = [makeSnapshot({ impressions: 3, clicks: 0 })];
    const previous = [makeSnapshot({ impressions: 5, clicks: 1 })];
    const alerts = detectChanges(current, previous);
    expect(alerts).toEqual([]);
  });
});

describe('getPreviousWeekId', () => {
  it('returns a week ID earlier than the input', () => {
    const prev = getPreviousWeekId('2026-W07');
    expect(prev).toMatch(/^\d{4}-W\d{2}$/);
    // The function consistently returns a prior week
    expect(prev < '2026-W07').toBe(true);
  });

  it('handles week 1 rollover to previous year', () => {
    const prev = getPreviousWeekId('2026-W01');
    expect(prev).toBe('2025-W52');
  });
});

describe('buildWeeklyReport', () => {
  const makeSnap = (overrides: Partial<PieceSnapshot> = {}): PieceSnapshot => ({
    ideaId: 'idea-1',
    pieceId: 'piece-1',
    slug: 'test-article',
    title: 'Test Article',
    type: 'blog-post' as ContentType,
    weekId: '2026-W07',
    clicks: 10,
    impressions: 100,
    ctr: 0.1,
    position: 15,
    topQueries: [],
    ...overrides,
  });

  it('returns zero-padded snapshot for a published piece slug not in GSC data', () => {
    const snapshots = [makeSnap({ slug: 'matched-article' })];
    const previousSnapshots: PieceSnapshot[] = [];
    const slugLookup = new Map<string, { ideaId: string; pieceId: string; title: string; type: ContentType }>([
      ['matched-article', { ideaId: 'idea-1', pieceId: 'piece-1', title: 'Matched', type: 'blog-post' }],
      ['unmatched-article', { ideaId: 'idea-2', pieceId: 'piece-2', title: 'Unmatched', type: 'blog-post' }],
    ]);

    const pieces = buildWeeklyReport(snapshots, previousSnapshots, slugLookup, '2026-W07');

    const unmatched = pieces.find(p => p.slug === 'unmatched-article');
    expect(unmatched).toBeDefined();
    expect(unmatched!.current.clicks).toBe(0);
    expect(unmatched!.current.impressions).toBe(0);
  });

  it('calculates correct clicksChange and impressionsChange deltas from previous week', () => {
    const snapshots = [makeSnap({ slug: 'article-a', clicks: 20, impressions: 200 })];
    const previousSnapshots = [makeSnap({ slug: 'article-a', clicks: 15, impressions: 150, weekId: '2026-W06' })];
    const slugLookup = new Map([
      ['article-a', { ideaId: 'idea-1', pieceId: 'piece-1', title: 'Article A', type: 'blog-post' as ContentType }],
    ]);

    const pieces = buildWeeklyReport(snapshots, previousSnapshots, slugLookup, '2026-W07');

    const article = pieces.find(p => p.slug === 'article-a')!;
    expect(article.clicksChange).toBe(5);     // 20 - 15
    expect(article.impressionsChange).toBe(50); // 200 - 150
  });

  it('returns null deltas when no previous snapshot exists for a piece', () => {
    const snapshots = [makeSnap({ slug: 'new-article' })];
    const previousSnapshots: PieceSnapshot[] = [];
    const slugLookup = new Map([
      ['new-article', { ideaId: 'idea-1', pieceId: 'piece-1', title: 'New Article', type: 'blog-post' as ContentType }],
    ]);

    const pieces = buildWeeklyReport(snapshots, previousSnapshots, slugLookup, '2026-W07');

    expect(pieces[0].clicksChange).toBeNull();
    expect(pieces[0].impressionsChange).toBeNull();
    expect(pieces[0].positionChange).toBeNull();
  });

  it('sorts pieces by clicks descending, then impressions descending', () => {
    const snapshots = [
      makeSnap({ slug: 'low-clicks', clicks: 5, impressions: 50 }),
      makeSnap({ slug: 'high-clicks', clicks: 20, impressions: 200 }),
      makeSnap({ slug: 'mid-clicks', clicks: 10, impressions: 100 }),
    ];
    const slugLookup = new Map([
      ['low-clicks', { ideaId: 'i1', pieceId: 'p1', title: 'Low', type: 'blog-post' as ContentType }],
      ['high-clicks', { ideaId: 'i2', pieceId: 'p2', title: 'High', type: 'blog-post' as ContentType }],
      ['mid-clicks', { ideaId: 'i3', pieceId: 'p3', title: 'Mid', type: 'blog-post' as ContentType }],
    ]);

    const pieces = buildWeeklyReport(snapshots, [], slugLookup, '2026-W07');

    expect(pieces.map(p => p.slug)).toEqual(['high-clicks', 'mid-clicks', 'low-clicks']);
  });
});
