import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis
const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
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

// Mock db
vi.mock('@/lib/db', () => ({
  getFoundationDoc: vi.fn().mockResolvedValue(null),
}));

// Mock advisor prompt loader
vi.mock('@/lib/advisors/prompt-loader', () => ({
  getAdvisorSystemPrompt: vi.fn().mockReturnValue('You are a test advisor.'),
}));

// Mock selectCritics
vi.mock('@/lib/content-recipes', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    selectCritics: vi.fn().mockResolvedValue([
      {
        id: 'april-dunford',
        name: 'April Dunford',
        role: 'strategist',
        evaluationExpertise: 'Evaluates positioning.',
        contextDocs: ['positioning'],
      },
    ]),
  };
});

// Mock framework loader
vi.mock('@/lib/frameworks/framework-loader', () => ({
  getFrameworkPrompt: vi.fn().mockReturnValue(null),
}));

// Mock p-limit
vi.mock('p-limit', () => ({
  default: () => <T>(fn: () => T) => fn(),
}));

import { createCritiqueTools } from '@/lib/agent-tools/critique';
import { recipes } from '@/lib/content-recipes';

describe('Critique tools', () => {
  const runId = 'test-run-123';
  const ideaId = 'idea-456';
  let tools: ReturnType<typeof createCritiqueTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations to prevent leaking between tests
    mockRedis.get.mockReset();
    mockRedis.set.mockReset();
    mockCreate.mockReset();
    tools = createCritiqueTools(runId, ideaId, recipes.website);
  });

  it('creates six tools', () => {
    expect(tools).toHaveLength(6);
    expect(tools.map((t) => t.name)).toEqual([
      'generate_draft',
      'run_critiques',
      'editor_decision',
      'revise_draft',
      'summarize_round',
      'save_content',
    ]);
  });

  describe('generate_draft', () => {
    it('generates draft and saves to Redis', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Generated website copy here.' }],
      });

      const tool = tools.find((t) => t.name === 'generate_draft')!;
      const result = (await tool.execute({
        contentContext: 'Test context',
      })) as { success: boolean; draft: string };

      expect(result.success).toBe(true);
      expect(result.draft).toBe('Generated website copy here.');
      expect(mockRedis.set).toHaveBeenCalledWith(
        `draft:${runId}`,
        'Generated website copy here.',
        { ex: 7200 },
      );
    });

    it('returns error when Claude API fails', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API timeout'));

      const tool = tools.find((t) => t.name === 'generate_draft')!;

      await expect(
        tool.execute({ contentContext: 'Test context' }),
      ).rejects.toThrow('API timeout');
    });

    it('throws when Redis set fails', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Draft text' }],
      });
      mockRedis.set.mockRejectedValueOnce(new Error('Redis write failed'));

      const tool = tools.find((t) => t.name === 'generate_draft')!;

      await expect(
        tool.execute({ contentContext: 'Test context' }),
      ).rejects.toThrow('Redis write failed');
    });

    it('concatenates framework prompt when recipe has authorFramework', async () => {
      const { getFrameworkPrompt } = await import(
        '@/lib/frameworks/framework-loader'
      );
      vi.mocked(getFrameworkPrompt).mockReturnValue('## Landing Page Assembly\nPhase 1: ...');

      const recipeCopy = {
        ...recipes.website,
        authorFramework: 'landing-page-assembly',
      };
      const frameworkTools = createCritiqueTools(
        'fw-run',
        ideaId,
        recipeCopy,
      );

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Draft with framework' }],
      });

      const tool = frameworkTools.find((t) => t.name === 'generate_draft')!;
      await tool.execute({ contentContext: 'Test context' });

      const systemArg = mockCreate.mock.calls[0][0].system;
      expect(systemArg).toContain('## FRAMEWORK');
      expect(systemArg).toContain('Landing Page Assembly');
    });

    it('proceeds without framework when getFrameworkPrompt returns null', async () => {
      const { getFrameworkPrompt } = await import(
        '@/lib/frameworks/framework-loader'
      );
      vi.mocked(getFrameworkPrompt).mockReturnValue(null);

      const recipeCopy = {
        ...recipes.website,
        authorFramework: 'nonexistent-framework',
      };
      const nullFwTools = createCritiqueTools(
        'null-fw-run',
        ideaId,
        recipeCopy,
      );

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Draft without framework' }],
      });

      const tool = nullFwTools.find((t) => t.name === 'generate_draft')!;
      const result = (await tool.execute({
        contentContext: 'Test context',
      })) as { success: boolean };

      expect(result.success).toBe(true);
      const systemArg = mockCreate.mock.calls[0][0].system;
      expect(systemArg).not.toContain('## FRAMEWORK');
    });
  });

  describe('run_critiques', () => {
    it('reads draft from Redis and runs critic calls', async () => {
      // Use a recipe without namedCritics to test dynamic-only selection
      const noNamedCriticsRecipe = { ...recipes.website, namedCritics: undefined };
      const dynamicTools = createCritiqueTools('dynamic-run', ideaId, noNamedCriticsRecipe);

      // First get() returns draft, second get() returns null for progress key
      mockRedis.get
        .mockResolvedValueOnce('Test draft content')
        .mockResolvedValueOnce(null);

      // Mock the critic response (tool_use for submit_critique)
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'submit_critique',
            input: {
              score: 7,
              pass: true,
              issues: [
                {
                  severity: 'medium',
                  description: 'CTA could improve',
                  suggestion: 'Simplify the CTA',
                },
              ],
            },
          },
        ],
      });

      const tool = dynamicTools.find((t) => t.name === 'run_critiques')!;
      const result = (await tool.execute({})) as {
        critiques: Array<{
          advisorId: string;
          score: number;
          issues: Array<{ severity: string }>;
        }>;
      };

      expect(result.critiques).toHaveLength(1);
      expect(result.critiques[0].advisorId).toBe('april-dunford');
      expect(result.critiques[0].score).toBe(7);
      expect(result.critiques[0].issues).toHaveLength(1);
    });

    it('returns error when no draft in Redis', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const tool = tools.find((t) => t.name === 'run_critiques')!;
      const result = (await tool.execute({})) as { error: string };

      expect(result.error).toContain('No draft found');
    });

    it('handles partial critic failure via allSettled', async () => {
      // Override selectCritics to return two critics
      const { selectCritics } = await import('@/lib/content-recipes');
      vi.mocked(selectCritics).mockResolvedValueOnce([
        {
          id: 'april-dunford',
          name: 'April Dunford',
          role: 'strategist',
          evaluationExpertise: 'test',
        },
        {
          id: 'seo-expert',
          name: 'SEO Expert',
          role: 'critic',
          evaluationExpertise: 'test',
        },
      ]);

      // Use a recipe without namedCritics to test dynamic-only selection
      const noNamedCriticsRecipe = { ...recipes.website, namedCritics: undefined };
      const freshTools = createCritiqueTools(
        'fresh-run',
        ideaId,
        noNamedCriticsRecipe,
      );

      // First get() returns draft, second get() returns null for progress key
      mockRedis.get
        .mockResolvedValueOnce('Test draft')
        .mockResolvedValueOnce(null);

      // Simulate the first critic call throwing, second returning no tool use
      mockCreate
        .mockRejectedValueOnce(new Error('Critic 1 timeout'))
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'No tool use' }],
        });

      const tool = freshTools.find((t) => t.name === 'run_critiques')!;
      const result = (await tool.execute({})) as {
        critiques: Array<{ advisorId: string; error?: string }>;
      };

      // Both critics should be in results — one with error
      expect(result.critiques).toHaveLength(2);
      const failedCritic = result.critiques.find((c) => c.error);
      expect(failedCritic).toBeTruthy();
    });

    it('returns error when Redis get fails', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis connection lost'));

      const tool = tools.find((t) => t.name === 'run_critiques')!;

      await expect(tool.execute({})).rejects.toThrow('Redis connection lost');
    });

    it('runs only specified advisorIds when provided', async () => {
      const { selectCritics } = await import('@/lib/content-recipes');
      vi.mocked(selectCritics).mockResolvedValueOnce([
        {
          id: 'april-dunford',
          name: 'April Dunford',
          role: 'strategist',
          evaluationExpertise: 'test',
        },
        {
          id: 'seo-expert',
          name: 'SEO Expert',
          role: 'critic',
          evaluationExpertise: 'test',
        },
      ]);

      const freshTools = createCritiqueTools('subset-run', ideaId, recipes.website);

      mockRedis.get
        .mockResolvedValueOnce('Test draft')
        .mockResolvedValueOnce(null);

      // Mock two critic responses
      mockCreate
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'c1',
              name: 'submit_critique',
              input: { score: 8, pass: true, issues: [] },
            },
          ],
        });

      const tool = freshTools.find((t) => t.name === 'run_critiques')!;

      // First call populates all critics
      await tool.execute({});

      // Reset mocks for second call
      mockRedis.get.mockResolvedValueOnce('Test draft');
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'c2',
            name: 'submit_critique',
            input: { score: 7, pass: true, issues: [] },
          },
        ],
      });

      // Second call with advisorIds — should only run april-dunford
      const result = (await tool.execute({
        advisorIds: ['april-dunford'],
      })) as { critiques: Array<{ advisorId: string }> };

      expect(result.critiques).toHaveLength(1);
      expect(result.critiques[0].advisorId).toBe('april-dunford');
    });

    it('merges named critics with dynamically selected critics', async () => {
      const { selectCritics } = await import('@/lib/content-recipes');
      // Dynamic selection returns seo-expert only
      vi.mocked(selectCritics).mockResolvedValueOnce([
        {
          id: 'seo-expert',
          name: 'SEO Expert',
          role: 'critic',
          evaluationExpertise: 'test',
        },
      ]);

      // Use a recipe with namedCritics
      const recipeCopy = {
        ...recipes.website,
        namedCritics: ['shirin-oreizy'],
      };
      const freshTools = createCritiqueTools('merge-run', ideaId, recipeCopy);

      mockRedis.get
        .mockResolvedValueOnce('Test draft')
        .mockResolvedValueOnce(null);

      // Two critic calls (shirin-oreizy + seo-expert)
      mockCreate
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'c1',
              name: 'submit_critique',
              input: { score: 7, pass: true, issues: [] },
            },
          ],
        })
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'c2',
              name: 'submit_critique',
              input: { score: 8, pass: true, issues: [] },
            },
          ],
        });

      const tool = freshTools.find((t) => t.name === 'run_critiques')!;
      const result = (await tool.execute({})) as {
        critiques: Array<{ advisorId: string }>;
      };

      // Should have both named (shirin-oreizy) and dynamic (seo-expert)
      expect(result.critiques.length).toBeGreaterThanOrEqual(2);
      const ids = result.critiques.map((c) => c.advisorId);
      expect(ids).toContain('shirin-oreizy');
      expect(ids).toContain('seo-expert');
    });

    it('warns and skips named critic IDs not found in registry', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { selectCritics } = await import('@/lib/content-recipes');
      vi.mocked(selectCritics).mockResolvedValueOnce([]);

      const recipeCopy = {
        ...recipes.website,
        namedCritics: ['nonexistent-advisor', 'shirin-oreizy'],
      };
      const freshTools = createCritiqueTools('warn-run', ideaId, recipeCopy);

      mockRedis.get
        .mockResolvedValueOnce('Test draft')
        .mockResolvedValueOnce(null);

      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'c1',
            name: 'submit_critique',
            input: { score: 7, pass: true, issues: [] },
          },
        ],
      });

      const tool = freshTools.find((t) => t.name === 'run_critiques')!;
      const result = (await tool.execute({})) as {
        critiques: Array<{ advisorId: string }>;
      };

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('nonexistent-advisor'),
      );
      // Only shirin-oreizy should run (nonexistent was skipped)
      expect(result.critiques).toHaveLength(1);
      expect(result.critiques[0].advisorId).toBe('shirin-oreizy');

      warnSpy.mockRestore();
    });

    it('falls back to named critics when selectCritics throws', async () => {
      const { selectCritics } = await import('@/lib/content-recipes');
      vi.mocked(selectCritics).mockRejectedValueOnce(
        new Error('LLM parse failed'),
      );

      const recipeCopy = {
        ...recipes.website,
        namedCritics: ['shirin-oreizy'],
      };
      const freshTools = createCritiqueTools('fallback-run', ideaId, recipeCopy);

      mockRedis.get
        .mockResolvedValueOnce('Test draft')
        .mockResolvedValueOnce(null);

      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'c1',
            name: 'submit_critique',
            input: { score: 6, pass: true, issues: [] },
          },
        ],
      });

      const tool = freshTools.find((t) => t.name === 'run_critiques')!;
      const result = (await tool.execute({})) as {
        critiques: Array<{ advisorId: string }>;
      };

      // Should fall back to named critics only
      expect(result.critiques).toHaveLength(1);
      expect(result.critiques[0].advisorId).toBe('shirin-oreizy');
    });
  });

  describe('revise_draft', () => {
    it('reads draft from Redis and saves revised version', async () => {
      mockRedis.get.mockResolvedValueOnce('Original draft');
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Revised draft' }],
      });

      const tool = tools.find((t) => t.name === 'revise_draft')!;
      const result = (await tool.execute({
        brief: 'Fix positioning in hero section',
      })) as { success: boolean; revisedDraft: string };

      expect(result.success).toBe(true);
      expect(result.revisedDraft).toBe('Revised draft');
      expect(mockRedis.set).toHaveBeenCalledWith(
        `draft:${runId}`,
        'Revised draft',
        { ex: 7200 },
      );
    });

    it('returns error when no draft in Redis', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const tool = tools.find((t) => t.name === 'revise_draft')!;
      const result = (await tool.execute({
        brief: 'Fix something',
      })) as { error: string };

      expect(result.error).toContain('No draft found');
    });

    it('returns error when Claude API fails', async () => {
      mockRedis.get.mockResolvedValueOnce('Original draft');
      mockCreate.mockRejectedValueOnce(new Error('API error'));

      const tool = tools.find((t) => t.name === 'revise_draft')!;

      await expect(
        tool.execute({ brief: 'Fix something' }),
      ).rejects.toThrow('API error');
    });

    it('concatenates framework prompt during revision', async () => {
      const { getFrameworkPrompt } = await import(
        '@/lib/frameworks/framework-loader'
      );
      vi.mocked(getFrameworkPrompt).mockReturnValue('## Landing Page Assembly\nPhase 1: ...');

      const recipeCopy = {
        ...recipes.website,
        authorFramework: 'landing-page-assembly',
      };
      const fwTools = createCritiqueTools('fw-revise-run', ideaId, recipeCopy);

      mockRedis.get.mockResolvedValueOnce('Original draft');
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Revised with framework' }],
      });

      const tool = fwTools.find((t) => t.name === 'revise_draft')!;
      await tool.execute({ brief: 'Fix hero section' });

      const systemArg = mockCreate.mock.calls[0][0].system;
      expect(systemArg).toContain('## FRAMEWORK');
      expect(systemArg).toContain('Landing Page Assembly');
    });
  });

  describe('summarize_round', () => {
    it('saves round data to Redis and returns summary', async () => {
      const tool = tools.find((t) => t.name === 'summarize_round')!;
      const result = (await tool.execute({
        round: 1,
        critiques: [
          {
            advisorId: 'april-dunford',
            name: 'April Dunford',
            score: 7,
            pass: true,
            issues: [],
          },
        ],
        editorDecision: 'approve',
        brief: '',
      })) as { round: number; avgScore: number };

      expect(result.round).toBe(1);
      expect(result.avgScore).toBe(7);
      expect(mockRedis.set).toHaveBeenCalledWith(
        `critique_round:${runId}:1`,
        expect.any(String),
        { ex: 7200 },
      );
    });

    it('accumulates fixed items across rounds', async () => {
      const tool = tools.find((t) => t.name === 'summarize_round')!;

      // Round 1 has an issue
      await tool.execute({
        round: 1,
        critiques: [
          {
            advisorId: 'april-dunford',
            name: 'April Dunford',
            score: 5,
            pass: false,
            issues: [
              {
                severity: 'high',
                description: 'Positioning drift in hero',
                suggestion: 'Fix',
              },
            ],
          },
        ],
        editorDecision: 'revise',
        brief: 'Fix positioning',
      });

      // Round 2 — issue is resolved
      const result = (await tool.execute({
        round: 2,
        critiques: [
          {
            advisorId: 'april-dunford',
            name: 'April Dunford',
            score: 8,
            pass: true,
            issues: [],
          },
        ],
        editorDecision: 'approve',
        brief: '',
      })) as { fixedItems: string[] };

      expect(result.fixedItems.length).toBeGreaterThan(0);
      expect(result.fixedItems[0]).toContain('Positioning drift');
    });
  });

  describe('save_content', () => {
    it('saves approved content to Redis', async () => {
      mockRedis.get.mockResolvedValueOnce('Final approved draft');

      const tool = tools.find((t) => t.name === 'save_content')!;
      const result = (await tool.execute({
        quality: 'approved',
      })) as { success: boolean; quality: string };

      expect(result.success).toBe(true);
      expect(result.quality).toBe('approved');
      expect(mockRedis.set).toHaveBeenCalledWith(
        `approved_content:${runId}`,
        expect.stringContaining('"quality":"approved"'),
        { ex: 7200 },
      );
    });

    it('handles max-rounds-reached quality', async () => {
      mockRedis.get.mockResolvedValueOnce('Draft after max rounds');

      const tool = tools.find((t) => t.name === 'save_content')!;
      const result = (await tool.execute({
        quality: 'max-rounds-reached',
      })) as { quality: string };

      expect(result.quality).toBe('max-rounds-reached');
    });

    it('returns error when no draft in Redis', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const tool = tools.find((t) => t.name === 'save_content')!;
      const result = (await tool.execute({
        quality: 'approved',
      })) as { error: string };

      expect(result.error).toContain('No draft found');
    });
  });
});
