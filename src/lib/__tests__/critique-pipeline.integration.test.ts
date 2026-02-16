import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis
const store = new Map<string, string>();
const mockRedis = {
  set: vi.fn(async (key: string, value: string) => {
    store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    return 'OK';
  }),
  get: vi.fn(async (key: string) => {
    const val = store.get(key);
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }),
  del: vi.fn(async (key: string) => {
    store.delete(key);
    return 1;
  }),
};

vi.mock('@/lib/redis', () => ({
  getRedis: () => mockRedis,
  isRedisConfigured: () => true,
  parseValue: <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T,
}));

const mockCreate = vi.fn();
vi.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({ messages: { create: mockCreate } }),
}));

vi.mock('@/lib/config', () => ({
  CLAUDE_MODEL: 'claude-test-model',
}));

vi.mock('@/lib/db', () => ({
  getFoundationDoc: vi.fn().mockResolvedValue({
    content: 'Test foundation doc content',
  }),
  getAllFoundationDocs: vi.fn().mockResolvedValue({}),
  saveFoundationDoc: vi.fn(),
}));

vi.mock('@/lib/advisors/prompt-loader', () => ({
  getAdvisorSystemPrompt: vi.fn().mockReturnValue('You are a test advisor.'),
}));

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

vi.mock('p-limit', () => ({
  default: () => <T>(fn: () => T) => fn(),
}));

import { createCritiqueTools } from '@/lib/agent-tools/critique';
import { recipes } from '@/lib/content-recipes';

describe('Critique pipeline integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
  });

  it('full cycle: generate → critique → approve (single round)', async () => {
    const runId = 'integ-1';
    const ideaId = 'idea-integ';
    const tools = createCritiqueTools(runId, ideaId, recipes.website);

    // Step 1: Generate draft
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Great website copy here.' }],
    });

    const generateTool = tools.find((t) => t.name === 'generate_draft')!;
    const draftResult = (await generateTool.execute({
      contentContext: 'Product context',
    })) as { success: boolean; draft: string };
    expect(draftResult.success).toBe(true);

    // Step 2: Run critiques — all pass with high scores
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c1',
          name: 'submit_critique',
          input: { score: 8, pass: true, issues: [] },
        },
      ],
    });

    const critiqueTool = tools.find((t) => t.name === 'run_critiques')!;
    const critiqueResult = (await critiqueTool.execute({})) as {
      critiques: Array<{ score: number }>;
    };
    expect(critiqueResult.critiques[0].score).toBe(8);

    // Step 3: Editor decision — should approve
    const editorTool = tools.find((t) => t.name === 'editor_decision')!;
    const editorResult = (await editorTool.execute({
      critiques: critiqueResult.critiques,
    })) as { decision: string };
    expect(editorResult.decision).toBe('approve');

    // Step 4: Save content
    const saveTool = tools.find((t) => t.name === 'save_content')!;
    const saveResult = (await saveTool.execute({
      quality: 'approved',
    })) as { success: boolean; quality: string };
    expect(saveResult.success).toBe(true);
    expect(saveResult.quality).toBe('approved');

    // Verify content was saved to Redis
    expect(store.has(`approved_content:${runId}`)).toBe(true);
  });

  it('full cycle: generate → critique → revise → critique → approve (two rounds)', async () => {
    const runId = 'integ-2';
    const ideaId = 'idea-integ';
    const tools = createCritiqueTools(runId, ideaId, recipes.website);

    // Round 1: Generate
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'First draft.' }],
    });
    const genTool = tools.find((t) => t.name === 'generate_draft')!;
    await genTool.execute({ contentContext: 'context' });

    // Round 1: Critique with high-severity issue
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c1',
          name: 'submit_critique',
          input: {
            score: 4,
            pass: false,
            issues: [
              {
                severity: 'high',
                description: 'Positioning drift',
                suggestion: 'Fix',
              },
            ],
          },
        },
      ],
    });
    const critTool = tools.find((t) => t.name === 'run_critiques')!;
    const crit1 = (await critTool.execute({})) as {
      critiques: Array<{ score: number; issues: Array<{ severity: string }> }>;
    };

    // Round 1: Editor — should revise
    const edTool = tools.find((t) => t.name === 'editor_decision')!;
    const ed1 = (await edTool.execute({
      critiques: crit1.critiques,
    })) as { decision: string; brief: string };
    expect(ed1.decision).toBe('revise');

    // Round 1: Summarize
    const sumTool = tools.find((t) => t.name === 'summarize_round')!;
    await sumTool.execute({
      round: 1,
      critiques: crit1.critiques,
      editorDecision: 'revise',
      brief: ed1.brief,
    });

    // Round 1: Revise
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Revised draft.' }],
    });
    const revTool = tools.find((t) => t.name === 'revise_draft')!;
    await revTool.execute({ brief: ed1.brief });

    // Round 2: Critique — issue resolved
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c2',
          name: 'submit_critique',
          input: { score: 8, pass: true, issues: [] },
        },
      ],
    });
    const crit2 = (await critTool.execute({})) as {
      critiques: Array<{ score: number }>;
    };

    // Round 2: Editor — should approve
    const ed2 = (await edTool.execute({
      critiques: crit2.critiques,
    })) as { decision: string };
    expect(ed2.decision).toBe('approve');

    // Round 2: Summarize — should show fixed items
    const sum2 = (await sumTool.execute({
      round: 2,
      critiques: crit2.critiques,
      editorDecision: 'approve',
    })) as { fixedItems: string[] };
    expect(sum2.fixedItems.length).toBeGreaterThan(0);
  });

  it('max-rounds-reached: saves with max-rounds quality after hitting limit', async () => {
    // Use social-post recipe which has maxRevisionRounds=2
    const runId = 'integ-max';
    const ideaId = 'idea-integ';
    const tools = createCritiqueTools(runId, ideaId, recipes['social-post']);

    // Generate draft
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Social post draft.' }],
    });
    const genTool = tools.find((t) => t.name === 'generate_draft')!;
    await genTool.execute({ contentContext: 'Social context' });

    // Round 1: Critique with high-severity (will revise)
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c1',
          name: 'submit_critique',
          input: {
            score: 3,
            pass: false,
            issues: [{ severity: 'high', description: 'Weak hook', suggestion: 'Rewrite' }],
          },
        },
      ],
    });
    const critTool = tools.find((t) => t.name === 'run_critiques')!;
    const crit1 = (await critTool.execute({})) as { critiques: Array<{ score: number }> };

    const edTool = tools.find((t) => t.name === 'editor_decision')!;
    const ed1 = (await edTool.execute({ critiques: crit1.critiques })) as { decision: string; brief: string };
    expect(ed1.decision).toBe('revise');

    const sumTool = tools.find((t) => t.name === 'summarize_round')!;
    await sumTool.execute({ round: 1, critiques: crit1.critiques, editorDecision: 'revise', brief: ed1.brief });

    // Revise
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Revised social post.' }],
    });
    const revTool = tools.find((t) => t.name === 'revise_draft')!;
    await revTool.execute({ brief: ed1.brief });

    // Round 2: Still failing — hit max rounds
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c2',
          name: 'submit_critique',
          input: {
            score: 3,
            pass: false,
            issues: [{ severity: 'high', description: 'Still weak', suggestion: 'Try again' }],
          },
        },
      ],
    });
    const crit2 = (await critTool.execute({})) as { critiques: Array<{ score: number }> };

    const ed2 = (await edTool.execute({ critiques: crit2.critiques })) as { decision: string };
    expect(ed2.decision).toBe('revise');

    // At this point orchestrator has hit maxRevisionRounds=2, so save with max-rounds-reached
    const saveTool = tools.find((t) => t.name === 'save_content')!;
    const saveResult = (await saveTool.execute({
      quality: 'max-rounds-reached',
    })) as { success: boolean; quality: string };
    expect(saveResult.success).toBe(true);
    expect(saveResult.quality).toBe('max-rounds-reached');

    // Verify content was saved
    expect(store.has(`approved_content:${runId}`)).toBe(true);
    const saved = JSON.parse(store.get(`approved_content:${runId}`)!);
    expect(saved.quality).toBe('max-rounds-reached');
  });

  it('oscillation guard: approves when scores regress between rounds', async () => {
    const runId = 'integ-osc';
    const ideaId = 'idea-integ';
    const tools = createCritiqueTools(runId, ideaId, recipes.website);

    // Generate draft
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Website copy.' }],
    });
    const genTool = tools.find((t) => t.name === 'generate_draft')!;
    await genTool.execute({ contentContext: 'context' });

    // Round 1: Score 3, below threshold, medium-severity only
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c1',
          name: 'submit_critique',
          input: {
            score: 3,
            pass: false,
            issues: [{ severity: 'medium', description: 'Below threshold', suggestion: 'Improve' }],
          },
        },
      ],
    });
    const critTool = tools.find((t) => t.name === 'run_critiques')!;
    const crit1 = (await critTool.execute({})) as { critiques: Array<{ score: number }> };

    const edTool = tools.find((t) => t.name === 'editor_decision')!;
    const ed1 = (await edTool.execute({ critiques: crit1.critiques })) as { decision: string };
    expect(ed1.decision).toBe('revise'); // Below threshold

    const sumTool = tools.find((t) => t.name === 'summarize_round')!;
    await sumTool.execute({ round: 1, critiques: crit1.critiques, editorDecision: 'revise', brief: 'Fix it' });

    // Revise
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Revised copy.' }],
    });
    const revTool = tools.find((t) => t.name === 'revise_draft')!;
    await revTool.execute({ brief: 'Fix it' });

    // Round 2: Score REGRESSED to 2 (lower than round 1's 3) — oscillation guard should approve
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c2',
          name: 'submit_critique',
          input: {
            score: 2,
            pass: false,
            issues: [{ severity: 'medium', description: 'Still needs work', suggestion: 'Try more' }],
          },
        },
      ],
    });
    const crit2 = (await critTool.execute({})) as { critiques: Array<{ score: number }> };

    // Editor should approve due to oscillation guard (score went from 3 → 2)
    const ed2 = (await edTool.execute({ critiques: crit2.critiques })) as { decision: string };
    expect(ed2.decision).toBe('approve'); // Oscillation guard triggers
  });
});
