import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock everything the module imports
vi.mock('@/lib/redis', () => ({
  getRedis: () => ({
    set: vi.fn(),
    get: vi.fn(),
  }),
  isRedisConfigured: () => true,
}));

vi.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({ messages: { create: vi.fn() } }),
}));

vi.mock('@/lib/config', () => ({
  CLAUDE_MODEL: 'claude-test-model',
}));

vi.mock('@/lib/db', () => ({
  getFoundationDoc: vi.fn(),
  getAllFoundationDocs: vi.fn(),
}));

vi.mock('@/lib/advisors/prompt-loader', () => ({
  getAdvisorSystemPrompt: vi.fn(),
}));

vi.mock('@/lib/agent-runtime', () => ({
  runAgent: vi.fn(),
  resumeAgent: vi.fn(),
  getAgentState: vi.fn().mockResolvedValue(null),
  deleteAgentState: vi.fn(),
  saveActiveRun: vi.fn(),
  getActiveRunId: vi.fn().mockResolvedValue(null),
  clearActiveRun: vi.fn(),
}));

vi.mock('@/lib/agent-tools/common', () => ({
  createPlanTools: vi.fn().mockReturnValue([]),
  createScratchpadTools: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/agent-tools/foundation', () => ({
  createFoundationTools: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/agent-tools/critique', () => ({
  createCritiqueTools: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/frameworks/framework-loader', () => ({
  getFrameworkPrompt: vi.fn(),
}));

// We need to access buildSystemPrompt — it's not exported.
// Instead, test the system prompt via the AgentConfig passed to runAgent.
import { runAgent } from '@/lib/agent-runtime';

describe('content-critique-agent system prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runAgent).mockResolvedValue({
      runId: 'test-run',
      agentId: 'content-critique',
      status: 'complete',
      messages: [],
      turnCount: 1,
      resumeCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    });
  });

  it('uses goal-oriented language, not procedural steps', async () => {
    const { runContentCritiquePipeline } = await import(
      '@/lib/content-critique-agent'
    );

    await runContentCritiquePipeline('idea-1', 'website', 'Test context');

    const config = vi.mocked(runAgent).mock.calls[0][0];
    const prompt = config.systemPrompt;

    // Goal-oriented markers
    expect(prompt).toContain('Your goal');
    expect(prompt).toContain('TOOLS AVAILABLE');
    expect(prompt).toContain('EDITOR RUBRIC');
    expect(prompt).toContain('CONSTRAINTS');
    expect(prompt).toContain('You decide the sequence');

    // Should NOT contain procedural markers
    expect(prompt).not.toContain('Procedure:');
    expect(prompt).not.toMatch(/^1\. Call generate_draft/m);
  });

  it('includes recipe values in system prompt', async () => {
    const { runContentCritiquePipeline } = await import(
      '@/lib/content-critique-agent'
    );

    await runContentCritiquePipeline('idea-1', 'website', 'Test context');

    const config = vi.mocked(runAgent).mock.calls[0][0];
    const prompt = config.systemPrompt;

    expect(prompt).toContain('website');
    expect(prompt).toContain('4'); // minAggregateScore
    expect(prompt).toContain('3'); // maxRevisionRounds
  });

  it('lists available critics with focus areas', async () => {
    // This test verifies the AVAILABLE CRITICS section is populated.
    // Since critics come from the registry and the recipe's namedCritics,
    // we need to verify the prompt builder reads from the registry.
    const { runContentCritiquePipeline } = await import(
      '@/lib/content-critique-agent'
    );

    await runContentCritiquePipeline('idea-1', 'website', 'Test context');

    const config = vi.mocked(runAgent).mock.calls[0][0];
    const prompt = config.systemPrompt;

    expect(prompt).toContain('AVAILABLE CRITICS');
  });
});
