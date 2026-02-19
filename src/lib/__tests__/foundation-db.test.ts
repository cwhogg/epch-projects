import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis before importing db module
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
  saveFoundationDoc,
  getFoundationDoc,
  getAllFoundationDocs,
  deleteFoundationDoc,
  deleteAllFoundationDocs,
  saveFoundationProgress,
  getFoundationProgress,
} from '@/lib/db';
import type { FoundationDocument, FoundationProgress } from '@/types';

describe('Foundation DB functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockDoc: FoundationDocument = {
    id: 'strategy',
    ideaId: 'idea-123',
    type: 'strategy',
    content: 'Test strategy content',
    advisorId: 'richard-rumelt',
    generatedAt: '2026-02-09T00:00:00.000Z',
    editedAt: null,
    version: 1,
  };

  describe('saveFoundationDoc', () => {
    it('saves a foundation document to the correct Redis key', async () => {
      await saveFoundationDoc('idea-123', mockDoc);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'foundation:idea-123:strategy',
        JSON.stringify(mockDoc),
      );
    });
  });

  describe('getFoundationDoc', () => {
    it('returns a foundation document when it exists', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(mockDoc));
      const result = await getFoundationDoc('idea-123', 'strategy');
      expect(mockRedis.get).toHaveBeenCalledWith('foundation:idea-123:strategy');
      expect(result).toEqual(mockDoc);
    });

    it('returns null when document does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await getFoundationDoc('idea-123', 'strategy');
      expect(result).toBeNull();
    });
  });

  describe('getAllFoundationDocs', () => {
    it('returns all existing foundation docs for an idea', async () => {
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(mockDoc))  // strategy
        .mockResolvedValueOnce(null)                      // positioning
        .mockResolvedValueOnce(null)                      // brand-voice
        .mockResolvedValueOnce(null)                      // design-principles
        .mockResolvedValueOnce(null)                      // seo-strategy
        .mockResolvedValueOnce(null);                     // social-media-strategy

      const result = await getAllFoundationDocs('idea-123');
      expect(Object.keys(result)).toEqual(['strategy']);
      expect(result.strategy).toEqual(mockDoc);
    });

    it('returns empty object when no docs exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await getAllFoundationDocs('idea-123');
      expect(result).toEqual({});
    });
  });

  describe('deleteFoundationDoc', () => {
    it('deletes a single foundation document', async () => {
      await deleteFoundationDoc('idea-123', 'strategy');
      expect(mockRedis.del).toHaveBeenCalledWith('foundation:idea-123:strategy');
    });
  });

  describe('deleteAllFoundationDocs', () => {
    it('deletes all 7 foundation doc keys for an idea', async () => {
      await deleteAllFoundationDocs('idea-123');
      expect(mockRedis.del).toHaveBeenCalledTimes(7);
      expect(mockRedis.del).toHaveBeenCalledWith('foundation:idea-123:strategy');
      expect(mockRedis.del).toHaveBeenCalledWith('foundation:idea-123:positioning');
      expect(mockRedis.del).toHaveBeenCalledWith('foundation:idea-123:brand-voice');
      expect(mockRedis.del).toHaveBeenCalledWith('foundation:idea-123:design-principles');
      expect(mockRedis.del).toHaveBeenCalledWith('foundation:idea-123:seo-strategy');
      expect(mockRedis.del).toHaveBeenCalledWith('foundation:idea-123:social-media-strategy');
      expect(mockRedis.del).toHaveBeenCalledWith('foundation:idea-123:visual-identity');
    });
  });

  describe('saveFoundationProgress', () => {
    it('saves progress with 1-hour TTL', async () => {
      const progress: FoundationProgress = {
        ideaId: 'idea-123',
        status: 'running',
        currentStep: 'Generating strategy...',
        docs: {
          strategy: 'running',
          positioning: 'pending',
          'brand-voice': 'pending',
          'design-principles': 'pending',
          'seo-strategy': 'pending',
          'social-media-strategy': 'pending',
        },
      };
      await saveFoundationProgress('idea-123', progress);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'foundation_progress:idea-123',
        JSON.stringify(progress),
        { ex: 3600 },
      );
    });
  });

  describe('getFoundationProgress', () => {
    it('returns progress when it exists', async () => {
      const progress: FoundationProgress = {
        ideaId: 'idea-123',
        status: 'running',
        currentStep: 'Generating strategy...',
        docs: {
          strategy: 'complete',
          positioning: 'running',
          'brand-voice': 'pending',
          'design-principles': 'pending',
          'seo-strategy': 'pending',
          'social-media-strategy': 'pending',
        },
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(progress));
      const result = await getFoundationProgress('idea-123');
      expect(result).toEqual(progress);
    });

    it('returns null when no progress exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await getFoundationProgress('idea-123');
      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('propagates Redis errors from get', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection lost'));
      await expect(getFoundationDoc('idea-123', 'strategy')).rejects.toThrow('Connection lost');
    });

    it('propagates Redis errors from set', async () => {
      mockRedis.set.mockRejectedValue(new Error('Connection lost'));
      await expect(saveFoundationDoc('idea-123', mockDoc)).rejects.toThrow('Connection lost');
    });
  });
});
