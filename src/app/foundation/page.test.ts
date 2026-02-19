import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis before importing db module
const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
};

vi.mock('@/lib/redis', () => ({
  getRedis: () => mockRedis,
  isRedisConfigured: vi.fn(),
  parseValue: <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T,
}));

import { getAnalysesFromDb, getAllFoundationDocs, isRedisConfigured } from '@/lib/db';
import { FOUNDATION_DOC_TYPES, FoundationDocument, FoundationDocType, Analysis } from '@/types';

// Re-mock the specific functions we need
vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return {
    ...actual,
    isRedisConfigured: vi.fn(),
    getAnalysesFromDb: vi.fn(),
    getAllFoundationDocs: vi.fn(),
  };
});

const mockIsRedisConfigured = isRedisConfigured as ReturnType<typeof vi.fn>;
const mockGetAnalysesFromDb = getAnalysesFromDb as ReturnType<typeof vi.fn>;
const mockGetAllFoundationDocs = getAllFoundationDocs as ReturnType<typeof vi.fn>;

function makeAnalysis(overrides: Partial<Analysis> & { id: string; ideaName: string }): Analysis {
  return {
    ideaId: overrides.id,
    scores: { competitiveLandscape: 7, willingnessToPay: 6, differentiationPotential: 8, seoOpportunity: 5 },
    confidence: 'High',
    recommendation: 'Tier 1',
    summary: 'Test',
    risks: [],
    completedAt: '2026-01-01T00:00:00.000Z',
    hasCompetitorAnalysis: false,
    hasKeywordAnalysis: false,
    hasContentGenerated: false,
    ...overrides,
  } as Analysis;
}

function makeDoc(type: FoundationDocType, ideaId: string): FoundationDocument {
  return {
    id: type,
    ideaId,
    type,
    content: `Content for ${type}`,
    advisorId: 'test-advisor',
    generatedAt: '2026-01-01T00:00:00.000Z',
    editedAt: null,
    version: 1,
  };
}

// Extract the data-fetching logic from the page component for testing
// (The page itself is a server component — we test the logic it relies on)
async function getFoundationData() {
  if (!isRedisConfigured()) return [];
  const analyses = await getAnalysesFromDb();
  const results = await Promise.all(
    analyses.map(async (analysis: Analysis) => {
      const docs = await getAllFoundationDocs(analysis.id);
      const completedCount = Object.keys(docs).length;
      return {
        ideaId: analysis.id,
        ideaName: analysis.ideaName,
        docs,
        completedCount,
        totalCount: FOUNDATION_DOC_TYPES.length,
      };
    })
  );
  results.sort((a: { completedCount: number; ideaName: string }, b: { completedCount: number; ideaName: string }) =>
    b.completedCount - a.completedCount || a.ideaName.localeCompare(b.ideaName)
  );
  return results;
}

describe('Foundation page data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when Redis is not configured', async () => {
    mockIsRedisConfigured.mockReturnValue(false);
    const result = await getFoundationData();
    expect(result).toEqual([]);
    expect(mockGetAnalysesFromDb).not.toHaveBeenCalled();
  });

  it('returns ideas with their foundation doc counts', async () => {
    mockIsRedisConfigured.mockReturnValue(true);
    mockGetAnalysesFromDb.mockResolvedValue([
      makeAnalysis({ id: 'idea-1', ideaName: 'SecondLook' }),
      makeAnalysis({ id: 'idea-2', ideaName: 'FocusFrame' }),
    ]);

    mockGetAllFoundationDocs
      .mockResolvedValueOnce({
        strategy: makeDoc('strategy', 'idea-1'),
        positioning: makeDoc('positioning', 'idea-1'),
      })
      .mockResolvedValueOnce({
        strategy: makeDoc('strategy', 'idea-2'),
        positioning: makeDoc('positioning', 'idea-2'),
        'brand-voice': makeDoc('brand-voice', 'idea-2'),
        'design-principles': makeDoc('design-principles', 'idea-2'),
        'seo-strategy': makeDoc('seo-strategy', 'idea-2'),
        'social-media-strategy': makeDoc('social-media-strategy', 'idea-2'),
      });

    const result = await getFoundationData();

    expect(result).toHaveLength(2);
    // FocusFrame (6 docs) should come first (most complete)
    expect(result[0].ideaName).toBe('FocusFrame');
    expect(result[0].completedCount).toBe(6);
    expect(result[0].totalCount).toBe(7);
    // SecondLook (2 docs) second
    expect(result[1].ideaName).toBe('SecondLook');
    expect(result[1].completedCount).toBe(2);
    expect(result[1].totalCount).toBe(7);
  });

  it('sorts by name when completion counts are equal', async () => {
    mockIsRedisConfigured.mockReturnValue(true);
    mockGetAnalysesFromDb.mockResolvedValue([
      makeAnalysis({ id: 'idea-z', ideaName: 'Zebra' }),
      makeAnalysis({ id: 'idea-a', ideaName: 'Alpha' }),
    ]);

    mockGetAllFoundationDocs
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const result = await getFoundationData();
    expect(result[0].ideaName).toBe('Alpha');
    expect(result[1].ideaName).toBe('Zebra');
  });

  it('handles getAnalysesFromDb returning empty array', async () => {
    mockIsRedisConfigured.mockReturnValue(true);
    mockGetAnalysesFromDb.mockResolvedValue([]);

    const result = await getFoundationData();
    expect(result).toEqual([]);
    expect(mockGetAllFoundationDocs).not.toHaveBeenCalled();
  });

  it('handles getAllFoundationDocs rejection', async () => {
    mockIsRedisConfigured.mockReturnValue(true);
    mockGetAnalysesFromDb.mockResolvedValue([
      makeAnalysis({ id: 'idea-1', ideaName: 'BadIdea' }),
    ]);
    mockGetAllFoundationDocs.mockRejectedValue(new Error('Redis connection failed'));

    await expect(getFoundationData()).rejects.toThrow('Redis connection failed');
  });

  it('handles getAnalysesFromDb rejection', async () => {
    mockIsRedisConfigured.mockReturnValue(true);
    mockGetAnalysesFromDb.mockRejectedValue(new Error('DB read failed'));

    await expect(getFoundationData()).rejects.toThrow('DB read failed');
  });
});
