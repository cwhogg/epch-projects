import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import {
  saveCanvasState,
  getCanvasState,
  saveAssumption,
  getAssumption,
  getAllAssumptions,
  savePivotSuggestions,
  getPivotSuggestions,
  clearPivotSuggestions,
  appendPivotHistory,
  getPivotHistory,
  deleteCanvasData,
} from '@/lib/db';
import type { CanvasState, Assumption, PivotSuggestion, PivotRecord } from '@/types';

describe('Validation Canvas DB functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCanvas: CanvasState = { status: 'active' };
  const mockAssumption: Assumption = {
    type: 'demand',
    status: 'untested',
    statement: '500+ monthly searches for target keywords',
    evidence: [],
    threshold: {
      validated: '500+ monthly searches, < 20 competitors',
      invalidated: '< 100 monthly searches',
      windowDays: 0,
    },
    linkedStage: 'analysis',
  };

  describe('saveCanvasState', () => {
    it('saves canvas state to the correct Redis key', async () => {
      await saveCanvasState('idea-1', mockCanvas);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'canvas:idea-1',
        JSON.stringify(mockCanvas),
      );
    });
  });

  describe('getCanvasState', () => {
    it('returns canvas state when it exists', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(mockCanvas));
      const result = await getCanvasState('idea-1');
      expect(mockRedis.get).toHaveBeenCalledWith('canvas:idea-1');
      expect(result).toEqual(mockCanvas);
    });

    it('returns null when no canvas exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await getCanvasState('idea-1');
      expect(result).toBeNull();
    });
  });

  describe('saveAssumption', () => {
    it('saves assumption to the correct Redis key', async () => {
      await saveAssumption('idea-1', mockAssumption);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'assumption:idea-1:demand',
        JSON.stringify(mockAssumption),
      );
    });
  });

  describe('getAssumption', () => {
    it('returns assumption when it exists', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(mockAssumption));
      const result = await getAssumption('idea-1', 'demand');
      expect(mockRedis.get).toHaveBeenCalledWith('assumption:idea-1:demand');
      expect(result).toEqual(mockAssumption);
    });

    it('returns null when assumption does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await getAssumption('idea-1', 'demand');
      expect(result).toBeNull();
    });
  });

  describe('getAllAssumptions', () => {
    it('returns all five assumptions for an idea', async () => {
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(mockAssumption)) // demand
        .mockResolvedValueOnce(null) // reachability
        .mockResolvedValueOnce(null) // engagement
        .mockResolvedValueOnce(null) // wtp
        .mockResolvedValueOnce(null); // differentiation

      const result = await getAllAssumptions('idea-1');
      expect(result.demand).toEqual(mockAssumption);
      expect(result.reachability).toBeUndefined();
    });

    it('returns empty object when no assumptions exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await getAllAssumptions('idea-1');
      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe('savePivotSuggestions', () => {
    it('saves pivot suggestions to the correct Redis key', async () => {
      const suggestions: PivotSuggestion[] = [
        { statement: 'Pivot to X', evidence: ['data'], impact: 'low', experiment: 'test X' },
      ];
      await savePivotSuggestions('idea-1', 'demand', suggestions);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'pivot-suggestions:idea-1:demand',
        JSON.stringify(suggestions),
      );
    });
  });

  describe('getPivotSuggestions', () => {
    it('returns suggestions when they exist', async () => {
      const suggestions: PivotSuggestion[] = [
        { statement: 'Pivot to X', evidence: ['data'], impact: 'low', experiment: 'test X' },
      ];
      mockRedis.get.mockResolvedValue(JSON.stringify(suggestions));
      const result = await getPivotSuggestions('idea-1', 'demand');
      expect(result).toEqual(suggestions);
    });

    it('returns empty array when no suggestions exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await getPivotSuggestions('idea-1', 'demand');
      expect(result).toEqual([]);
    });
  });

  describe('clearPivotSuggestions', () => {
    it('deletes pivot suggestions key', async () => {
      await clearPivotSuggestions('idea-1', 'demand');
      expect(mockRedis.del).toHaveBeenCalledWith('pivot-suggestions:idea-1:demand');
    });
  });

  describe('appendPivotHistory', () => {
    it('appends to existing history', async () => {
      const existing: PivotRecord[] = [];
      mockRedis.get.mockResolvedValue(JSON.stringify(existing));
      const newRecord: PivotRecord = {
        fromStatement: 'old',
        toStatement: 'new',
        reason: 'low demand',
        suggestedBy: 'system',
        approvedBy: 'curator',
        timestamp: Date.now(),
        alternatives: [],
      };
      await appendPivotHistory('idea-1', 'demand', newRecord);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'pivots:idea-1:demand',
        JSON.stringify([newRecord]),
      );
    });

    it('creates new history when none exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      const newRecord: PivotRecord = {
        fromStatement: 'old',
        toStatement: 'new',
        reason: 'low demand',
        suggestedBy: 'system',
        approvedBy: 'curator',
        timestamp: Date.now(),
        alternatives: [],
      };
      await appendPivotHistory('idea-1', 'demand', newRecord);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'pivots:idea-1:demand',
        JSON.stringify([newRecord]),
      );
    });
  });

  describe('getPivotHistory', () => {
    it('returns history when it exists', async () => {
      const history: PivotRecord[] = [{
        fromStatement: 'old', toStatement: 'new', reason: 'test',
        suggestedBy: 'system', approvedBy: 'curator', timestamp: 1, alternatives: [],
      }];
      mockRedis.get.mockResolvedValue(JSON.stringify(history));
      const result = await getPivotHistory('idea-1', 'demand');
      expect(result).toEqual(history);
    });

    it('returns empty array when no history exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await getPivotHistory('idea-1', 'demand');
      expect(result).toEqual([]);
    });
  });

  describe('deleteCanvasData', () => {
    it('deletes canvas state and all assumption keys', async () => {
      await deleteCanvasData('idea-1');
      expect(mockRedis.del).toHaveBeenCalledWith('canvas:idea-1');
      // 5 assumption keys + 5 pivot-suggestion keys + 5 pivot history keys = 15 + 1 canvas = 16
      expect(mockRedis.del).toHaveBeenCalledWith('assumption:idea-1:demand');
      expect(mockRedis.del).toHaveBeenCalledWith('assumption:idea-1:reachability');
      expect(mockRedis.del).toHaveBeenCalledWith('assumption:idea-1:engagement');
      expect(mockRedis.del).toHaveBeenCalledWith('assumption:idea-1:wtp');
      expect(mockRedis.del).toHaveBeenCalledWith('assumption:idea-1:differentiation');
      expect(mockRedis.del).toHaveBeenCalledWith('pivot-suggestions:idea-1:demand');
      expect(mockRedis.del).toHaveBeenCalledWith('pivots:idea-1:demand');
    });
  });

  describe('error handling', () => {
    it('propagates Redis errors from get', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection lost'));
      await expect(getCanvasState('idea-1')).rejects.toThrow('Connection lost');
    });

    it('propagates Redis errors from set', async () => {
      mockRedis.set.mockRejectedValue(new Error('Connection lost'));
      await expect(saveCanvasState('idea-1', mockCanvas)).rejects.toThrow('Connection lost');
    });

    it('propagates Redis errors from del', async () => {
      mockRedis.del.mockRejectedValue(new Error('Connection lost'));
      await expect(clearPivotSuggestions('idea-1', 'demand')).rejects.toThrow('Connection lost');
    });
  });
});
