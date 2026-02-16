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
  getAnthropic: () => ({ messages: { create: mockCreate } }),
}));

vi.mock('@/lib/config', () => ({
  CLAUDE_MODEL: 'claude-test-model',
}));

// Mock db functions
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getFoundationDoc: vi.fn(),
    getAllFoundationDocs: vi.fn(),
    saveFoundationDoc: vi.fn(),
  };
});

// Mock buildContentContext
vi.mock('@/lib/content-agent', () => ({
  buildContentContext: vi.fn(),
}));

import { createFoundationTools } from '@/lib/agent-tools/foundation';
import { getFoundationDoc, getAllFoundationDocs, saveFoundationDoc } from '@/lib/db';
import { buildContentContext } from '@/lib/content-agent';

describe('Foundation agent tools', () => {
  const ideaId = 'idea-123';
  let tools: ReturnType<typeof createFoundationTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = createFoundationTools(ideaId);
  });

  it('creates three tools', () => {
    expect(tools).toHaveLength(3);
    expect(tools.map(t => t.name)).toEqual([
      'load_foundation_docs',
      'generate_foundation_doc',
      'load_design_seed',
    ]);
  });

  describe('load_foundation_docs', () => {
    it('loads requested doc types from Redis', async () => {
      const mockDoc = {
        id: 'strategy',
        ideaId,
        type: 'strategy',
        content: 'Strategy content',
        advisorId: 'richard-rumelt',
        generatedAt: '2026-01-01T00:00:00Z',
        editedAt: null,
        version: 1,
      };
      vi.mocked(getFoundationDoc).mockResolvedValue(mockDoc);

      const tool = tools.find(t => t.name === 'load_foundation_docs')!;
      const result = await tool.execute({ docTypes: ['strategy'] });

      expect(getFoundationDoc).toHaveBeenCalledWith(ideaId, 'strategy');
      expect(result).toEqual({
        docs: { strategy: mockDoc },
        missing: [],
      });
    });

    it('reports missing docs separately', async () => {
      vi.mocked(getFoundationDoc).mockResolvedValue(null);

      const tool = tools.find(t => t.name === 'load_foundation_docs')!;
      const result = await tool.execute({ docTypes: ['strategy', 'positioning'] });

      expect(result).toEqual({
        docs: {},
        missing: ['strategy', 'positioning'],
      });
    });

    it('loads all docs when no docTypes specified', async () => {
      vi.mocked(getAllFoundationDocs).mockResolvedValue({});

      const tool = tools.find(t => t.name === 'load_foundation_docs')!;
      await tool.execute({});

      expect(getAllFoundationDocs).toHaveBeenCalledWith(ideaId);
    });
  });

  describe('generate_foundation_doc', () => {
    const mockContext = {
      ideaName: 'TestApp',
      ideaDescription: 'A test app',
      targetUser: 'developers',
      problemSolved: 'testing',
      scores: { seoOpportunity: null, competitiveLandscape: null, willingnessToPay: null, differentiationPotential: null, expertiseAlignment: null, overall: null },
      summary: 'Test summary',
      risks: [],
      topKeywords: [],
      serpValidated: [],
      contentStrategy: { topOpportunities: [], recommendedAngle: '' },
      difficultyAssessment: { dominantPlayers: [], roomForNewEntrant: false, reasoning: '' },
      competitors: '',
      expertiseProfile: '',
    };

    it('generates a strategy doc using Richard Rumelt prompt', async () => {
      vi.mocked(buildContentContext).mockResolvedValue(mockContext);
      vi.mocked(getFoundationDoc).mockResolvedValue(null);

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Generated strategy document content' }],
      });

      const tool = tools.find(t => t.name === 'generate_foundation_doc')!;
      const result = await tool.execute({ docType: 'strategy' }) as Record<string, unknown>;

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toContain('Richard Rumelt');
      expect(result.success).toBe(true);
      expect(saveFoundationDoc).toHaveBeenCalled();
    });

    it('generates positioning using strategy as context', async () => {
      vi.mocked(buildContentContext).mockResolvedValue(mockContext);
      vi.mocked(getFoundationDoc).mockImplementation(async (_id, type) => {
        if (type === 'strategy') {
          return {
            id: 'strategy', ideaId, type: 'strategy',
            content: 'Existing strategy', advisorId: 'richard-rumelt',
            generatedAt: '2026-01-01T00:00:00Z', editedAt: null, version: 1,
          };
        }
        return null;
      });

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Generated positioning content' }],
      });

      const tool = tools.find(t => t.name === 'generate_foundation_doc')!;
      const result = await tool.execute({ docType: 'positioning' }) as Record<string, unknown>;

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toContain('April Dunford');
      const userMsg = callArgs.messages[0].content;
      expect(userMsg).toContain('Existing strategy');
      expect(result.success).toBe(true);
    });

    it('returns error when upstream doc is missing', async () => {
      vi.mocked(buildContentContext).mockResolvedValue(mockContext);
      vi.mocked(getFoundationDoc).mockResolvedValue(null);

      const tool = tools.find(t => t.name === 'generate_foundation_doc')!;
      const result = await tool.execute({ docType: 'positioning' }) as Record<string, unknown>;

      expect(result.error).toContain('strategy');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('propagates Claude API errors', async () => {
      vi.mocked(buildContentContext).mockResolvedValue(mockContext);
      vi.mocked(getFoundationDoc).mockResolvedValue(null);
      mockCreate.mockRejectedValue(new Error('Rate limit exceeded'));

      const tool = tools.find(t => t.name === 'generate_foundation_doc')!;
      await expect(tool.execute({ docType: 'strategy' })).rejects.toThrow('Rate limit exceeded');
    });

    it('calls onDocProgress with running then complete when generating a doc', async () => {
      const onDocProgress = vi.fn();
      const toolsWithProgress = createFoundationTools(ideaId, onDocProgress);

      vi.mocked(buildContentContext).mockResolvedValue(mockContext);
      vi.mocked(getFoundationDoc).mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Generated strategy' }],
      });

      const tool = toolsWithProgress.find(t => t.name === 'generate_foundation_doc')!;
      await tool.execute({ docType: 'strategy' });

      expect(onDocProgress).toHaveBeenCalledWith('strategy', 'running');
      expect(onDocProgress).toHaveBeenCalledWith('strategy', 'complete');
    });

    it('calls onDocProgress with error when Claude API fails', async () => {
      const onDocProgress = vi.fn();
      const toolsWithProgress = createFoundationTools(ideaId, onDocProgress);

      vi.mocked(buildContentContext).mockResolvedValue(mockContext);
      vi.mocked(getFoundationDoc).mockResolvedValue(null);
      mockCreate.mockRejectedValue(new Error('Rate limit exceeded'));

      const tool = toolsWithProgress.find(t => t.name === 'generate_foundation_doc')!;
      await expect(tool.execute({ docType: 'strategy' })).rejects.toThrow('Rate limit exceeded');

      expect(onDocProgress).toHaveBeenCalledWith('strategy', 'running');
      expect(onDocProgress).toHaveBeenCalledWith('strategy', 'error');
    });

    it('does NOT call onDocProgress when upstream doc is missing', async () => {
      const onDocProgress = vi.fn();
      const toolsWithProgress = createFoundationTools(ideaId, onDocProgress);

      vi.mocked(buildContentContext).mockResolvedValue(mockContext);
      vi.mocked(getFoundationDoc).mockResolvedValue(null);

      const tool = toolsWithProgress.find(t => t.name === 'generate_foundation_doc')!;
      const result = await tool.execute({ docType: 'positioning' }) as Record<string, unknown>;

      expect(result.error).toContain('strategy');
      expect(onDocProgress).not.toHaveBeenCalled();
    });
  });

  describe('load_design_seed', () => {
    it('returns the embedded design principles content', async () => {
      const tool = tools.find(t => t.name === 'load_design_seed')!;
      const result = await tool.execute({}) as Record<string, unknown>;

      expect(result.content).toBeTruthy();
      expect(typeof result.content).toBe('string');
      expect(result.content).toContain('Design Principles');
    });
  });
});
