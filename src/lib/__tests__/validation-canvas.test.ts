import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis
const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
};

vi.mock('@/lib/redis', () => ({
  getRedis: () => mockRedis,
  isRedisConfigured: () => true,
  parseValue: <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T,
}));

// Mock Anthropic
const mockCreate = vi.fn();
vi.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({
    messages: { create: mockCreate },
  }),
}));

vi.mock('@/lib/config', () => ({ CLAUDE_MODEL: 'test-model' }));

// Mock db — all functions used by validation-canvas
const mockGetAnalysisFromDb = vi.fn();
const mockGetAnalysisContent = vi.fn();
const mockGetCanvasState = vi.fn();
const mockSaveCanvasState = vi.fn();
const mockSaveAssumption = vi.fn();
const mockGetAssumption = vi.fn();
const mockGetAllAssumptions = vi.fn();
const mockSavePivotSuggestions = vi.fn();
const mockGetPivotSuggestions = vi.fn();
const mockClearPivotSuggestions = vi.fn();
const mockAppendPivotHistory = vi.fn();
const mockDeleteFoundationDoc = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/db', () => ({
  getAnalysisFromDb: (...args: unknown[]) => mockGetAnalysisFromDb(...args),
  getAnalysisContent: (...args: unknown[]) => mockGetAnalysisContent(...args),
  getCanvasState: (...args: unknown[]) => mockGetCanvasState(...args),
  saveCanvasState: (...args: unknown[]) => mockSaveCanvasState(...args),
  saveAssumption: (...args: unknown[]) => mockSaveAssumption(...args),
  getAssumption: (...args: unknown[]) => mockGetAssumption(...args),
  getAllAssumptions: (...args: unknown[]) => mockGetAllAssumptions(...args),
  savePivotSuggestions: (...args: unknown[]) => mockSavePivotSuggestions(...args),
  getPivotSuggestions: (...args: unknown[]) => mockGetPivotSuggestions(...args),
  clearPivotSuggestions: (...args: unknown[]) => mockClearPivotSuggestions(...args),
  appendPivotHistory: (...args: unknown[]) => mockAppendPivotHistory(...args),
  deleteFoundationDoc: (...args: unknown[]) => mockDeleteFoundationDoc(...args),
}));

import {
  generateAssumptions,
  evaluateAssumptions,
  generatePivotSuggestions,
  applyPivot,
} from '@/lib/validation-canvas';
import type { Assumption } from '@/types';

describe('generateAssumptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates five assumptions from analysis data', async () => {
    const mockAnalysis = {
      id: 'analysis-1',
      ideaId: 'idea-1',
      ideaName: 'TestProduct',
      scores: {
        seoOpportunity: 8,
        competitiveLandscape: 7,
        willingnessToPay: 6,
        differentiationPotential: 7,
        expertiseAlignment: 5,
        overall: 7,
      },
      recommendation: 'Tier 1',
      confidence: 'High',
      summary: 'Good opportunity',
      risks: [],
      completedAt: new Date().toISOString(),
      hasCompetitorAnalysis: true,
      hasKeywordAnalysis: true,
    };

    const mockContent = {
      seoData: JSON.stringify({
        synthesis: {
          comparison: { agreedKeywords: [{ keyword: 'test keyword', volume: 1200 }] },
          serpValidated: [{ keyword: 'test keyword', hasContentGap: true }],
        },
      }),
      competitors: 'Competitor A, Competitor B',
    };

    mockGetAnalysisFromDb.mockResolvedValue(mockAnalysis);
    mockGetAnalysisContent.mockResolvedValue(mockContent);

    mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          demand: { statement: '1,200+ monthly searches for target keywords', evidence: ['keyword data'] },
          reachability: { statement: 'Content can rank for target keywords', evidence: [] },
          engagement: { statement: '3%+ signup rate expected', evidence: [] },
          wtp: { statement: 'Users willing to pay for premium features', evidence: [] },
          differentiation: { statement: 'No direct competitor in this niche', evidence: ['competitor gap'] },
        }),
      }],
    });

    const result = await generateAssumptions('idea-1');

    expect(result).toBeTruthy();
    expect(result!.assumptions.demand).toBeDefined();
    expect(result!.assumptions.demand.status).toBe('untested');
    expect(result!.assumptions.demand.statement).toBe('1,200+ monthly searches for target keywords');
    expect(mockSaveCanvasState).toHaveBeenCalledWith('idea-1', { status: 'active' });
    expect(mockSaveAssumption).toHaveBeenCalledTimes(5);
  });

  it('returns null when no analysis exists', async () => {
    mockGetAnalysisFromDb.mockResolvedValue(null);

    const result = await generateAssumptions('idea-1');
    expect(result).toBeNull();
  });
});

describe('evaluateAssumptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not change assumptions with status other than testing', async () => {
    const untestedAssumption: Assumption = {
      type: 'demand',
      status: 'untested',
      statement: 'Test statement',
      evidence: [],
      threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
      linkedStage: 'analysis',
    };

    mockGetCanvasState.mockResolvedValue({ status: 'active' });
    mockGetAllAssumptions.mockResolvedValue({ demand: untestedAssumption });

    await evaluateAssumptions('idea-1');

    // saveAssumption should NOT have been called since nothing is in "testing" status
    expect(mockSaveAssumption).not.toHaveBeenCalled();
  });

  it('skips evaluation when canvas is killed', async () => {
    mockGetCanvasState.mockResolvedValue({ status: 'killed' });

    await evaluateAssumptions('idea-1');

    expect(mockGetAllAssumptions).not.toHaveBeenCalled();
  });

  it('skips evaluation when no canvas exists', async () => {
    mockGetCanvasState.mockResolvedValue(null);

    await evaluateAssumptions('idea-1');

    expect(mockGetAllAssumptions).not.toHaveBeenCalled();
  });
});

describe('generatePivotSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates 2-3 pivot suggestions via LLM', async () => {
    const suggestions = [
      { statement: 'Pivot A', evidence: ['data'], impact: 'Keep content', experiment: 'Test A' },
      { statement: 'Pivot B', evidence: ['data2'], impact: 'Rebuild site', experiment: 'Test B' },
    ];

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(suggestions) }],
    });

    mockGetAssumption.mockResolvedValue({
      type: 'demand', status: 'invalidated', statement: 'No demand',
      evidence: ['low search volume'], threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
      linkedStage: 'analysis',
    });
    mockGetAnalysisContent.mockResolvedValue({ seoData: '{}', competitors: 'none' });

    const result = await generatePivotSuggestions('idea-1', 'demand');

    expect(result).toHaveLength(2);
    expect(result[0].statement).toBe('Pivot A');
    expect(mockSavePivotSuggestions).toHaveBeenCalledWith('idea-1', 'demand', suggestions);
  });

  it('returns empty array when LLM call fails', async () => {
    mockCreate.mockRejectedValue(new Error('API timeout'));

    mockGetAssumption.mockResolvedValue({
      type: 'demand', status: 'invalidated', statement: 'No demand',
      evidence: [], threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
      linkedStage: 'analysis',
    });
    mockGetAnalysisContent.mockResolvedValue({ seoData: '{}' });

    const result = await generatePivotSuggestions('idea-1', 'demand');

    expect(result).toEqual([]);
  });

  it('returns empty array when LLM returns malformed JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'This is not valid JSON at all' }],
    });

    mockGetAssumption.mockResolvedValue({
      type: 'demand', status: 'invalidated', statement: 'No demand',
      evidence: [], threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
      linkedStage: 'analysis',
    });
    mockGetAnalysisContent.mockResolvedValue({ seoData: '{}' });

    const result = await generatePivotSuggestions('idea-1', 'demand');

    expect(result).toEqual([]);
  });
});

describe('applyPivot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates assumption, clears suggestions, and appends to history', async () => {
    const existingAssumption: Assumption = {
      type: 'demand', status: 'invalidated', statement: 'Old statement',
      evidence: ['low volume'], threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
      linkedStage: 'analysis',
    };

    const suggestions = [
      { statement: 'New statement', evidence: ['better data'], impact: 'Keep content', experiment: 'Test new' },
    ];

    mockGetAssumption.mockResolvedValue(existingAssumption);
    mockGetPivotSuggestions.mockResolvedValue(suggestions);

    await applyPivot('idea-1', 'demand', 0);

    // New assumption should be untested with the pivot statement
    expect(mockSaveAssumption).toHaveBeenCalledWith('idea-1', expect.objectContaining({
      type: 'demand',
      status: 'untested',
      statement: 'New statement',
    }));

    // Suggestions should be cleared
    expect(mockClearPivotSuggestions).toHaveBeenCalledWith('idea-1', 'demand');

    // History should be appended
    expect(mockAppendPivotHistory).toHaveBeenCalledWith('idea-1', 'demand', expect.objectContaining({
      fromStatement: 'Old statement',
      toStatement: 'New statement',
    }));
  });

  it('resets downstream assumptions when demand pivots', async () => {
    const demandAssumption: Assumption = {
      type: 'demand', status: 'invalidated', statement: 'Old',
      evidence: [], threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
      linkedStage: 'analysis',
    };

    const reachabilityAssumption: Assumption = {
      type: 'reachability', status: 'testing', statement: 'Testing reach',
      evidence: [], threshold: { validated: 'x', invalidated: 'y', windowDays: 45 },
      linkedStage: 'content',
    };

    const suggestions = [
      { statement: 'New demand', evidence: [], impact: 'Rebuild', experiment: 'Test' },
    ];

    mockGetAssumption
      .mockResolvedValueOnce(demandAssumption) // for the pivot target
      .mockResolvedValueOnce(reachabilityAssumption) // downstream: reachability
      .mockResolvedValueOnce(null) // downstream: engagement
      .mockResolvedValueOnce(null) // downstream: wtp
      .mockResolvedValueOnce(null); // downstream: differentiation
    mockGetPivotSuggestions.mockResolvedValue(suggestions);

    await applyPivot('idea-1', 'demand', 0);

    // Should reset reachability to untested
    expect(mockSaveAssumption).toHaveBeenCalledWith('idea-1', expect.objectContaining({
      type: 'reachability',
      status: 'untested',
    }));

    // Should have deleted the strategy doc for demand pivots
    expect(mockDeleteFoundationDoc).toHaveBeenCalledWith('idea-1', 'strategy');
  });

  it('throws when suggestion index is out of bounds', async () => {
    mockGetAssumption.mockResolvedValue({
      type: 'demand', status: 'invalidated', statement: 'x',
      evidence: [], threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
      linkedStage: 'analysis',
    });
    mockGetPivotSuggestions.mockResolvedValue([]);

    await expect(applyPivot('idea-1', 'demand', 5)).rejects.toThrow();
  });
});
