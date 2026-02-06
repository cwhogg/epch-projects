import { describe, it, expect } from 'vitest';
import { getWeekId, matchUrlToSlug, detectChanges } from '../analytics-agent';

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
