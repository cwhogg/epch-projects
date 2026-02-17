import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  isRedisConfigured: vi.fn(),
  getAnalysesFromDb: vi.fn(),
  getCanvasState: vi.fn(),
}));

vi.mock('@/lib/validation-canvas', () => ({
  generateAssumptions: vi.fn(),
}));

import { isRedisConfigured, getAnalysesFromDb, getCanvasState } from '@/lib/db';
import { generateAssumptions } from '@/lib/validation-canvas';
import { POST } from '@/app/api/validation/backfill/route';
import type { Analysis, ValidationCanvasData } from '@/types';

const mockAnalysis = (id: string, name: string): Analysis => ({
  id,
  ideaId: id,
  ideaName: name,
  scores: { overall: 70, marketSize: 70, competition: 70, feasibility: 70, monetization: 70 },
  confidence: 'medium',
  recommendation: 'Tier 2',
  summary: 'Test',
  risks: [],
  completedAt: '2026-01-01',
  hasCompetitorAnalysis: false,
  hasKeywordAnalysis: false,
});

describe('POST /api/validation/backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isRedisConfigured).mockReturnValue(true);
  });

  it('returns 500 when Redis is not configured', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(false);
    const res = await POST();
    expect(res.status).toBe(500);
  });

  it('generates canvas for projects without one', async () => {
    vi.mocked(getAnalysesFromDb).mockResolvedValue([
      mockAnalysis('idea-1', 'Project A'),
      mockAnalysis('idea-2', 'Project B'),
    ]);
    vi.mocked(getCanvasState).mockResolvedValue(null);
    vi.mocked(generateAssumptions).mockResolvedValue({
      canvas: { status: 'active' },
      assumptions: {},
      pivotSuggestions: {},
      pivotHistory: {},
    } as unknown as ValidationCanvasData);

    const res = await POST();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.total).toBe(2);
    expect(data.generated).toBe(2);
    expect(generateAssumptions).toHaveBeenCalledTimes(2);
  });

  it('skips projects that already have canvas data', async () => {
    vi.mocked(getAnalysesFromDb).mockResolvedValue([
      mockAnalysis('idea-1', 'Project A'),
    ]);
    vi.mocked(getCanvasState).mockResolvedValue({ status: 'active' });

    const res = await POST();
    const data = await res.json();
    expect(data.generated).toBe(0);
    expect(data.results[0].status).toBe('skipped (already exists)');
    expect(generateAssumptions).not.toHaveBeenCalled();
  });

  it('handles generateAssumptions returning null', async () => {
    vi.mocked(getAnalysesFromDb).mockResolvedValue([
      mockAnalysis('idea-1', 'Project A'),
    ]);
    vi.mocked(getCanvasState).mockResolvedValue(null);
    vi.mocked(generateAssumptions).mockResolvedValue(null);

    const res = await POST();
    const data = await res.json();
    expect(data.generated).toBe(0);
    expect(data.results[0].status).toBe('skipped (no analysis data)');
  });

  it('handles generateAssumptions throwing an error', async () => {
    vi.mocked(getAnalysesFromDb).mockResolvedValue([
      mockAnalysis('idea-1', 'Project A'),
    ]);
    vi.mocked(getCanvasState).mockResolvedValue(null);
    vi.mocked(generateAssumptions).mockRejectedValue(new Error('LLM timeout'));

    const res = await POST();
    const data = await res.json();
    expect(data.generated).toBe(0);
    expect(data.results[0].status).toBe('error: LLM timeout');
  });

  it('returns 500 when getAnalysesFromDb fails', async () => {
    vi.mocked(getAnalysesFromDb).mockRejectedValue(new Error('Connection lost'));

    const res = await POST();
    expect(res.status).toBe(500);
  });
});
