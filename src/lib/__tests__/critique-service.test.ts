import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Mock p-limit
vi.mock('p-limit', () => ({
  default: () => <T>(fn: () => T) => fn(),
}));

import { runCritiqueRound } from '../critique-service';

describe('runCritiqueRound', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs all named critics for the website recipe and returns structured results', async () => {
    // All 4 critics return same score to avoid mock-ordering issues
    // (async contextDoc lookups cause non-deterministic mockCreate consumption order)
    mockCreate.mockResolvedValue({
      content: [{
        type: 'tool_use', id: 'c1', name: 'submit_critique',
        input: { score: 7, pass: true, issues: [{ severity: 'medium', description: 'CTA unclear', suggestion: 'Simplify' }] },
      }],
    });

    const result = await runCritiqueRound('Test draft content', 'website', 'idea-1');

    expect(result.critiques).toHaveLength(4);
    expect(result.avgScore).toBe(7);
    // All 4 named critics should be present (order matches namedCritics array)
    const ids = result.critiques.map((c) => c.advisorId);
    expect(ids).toContain('oli-gardner');
    expect(ids).toContain('joanna-wiebe');
    expect(ids).toContain('shirin-oreizy');
    expect(ids).toContain('copywriter');
    // Each critique has the expected structure
    expect(result.critiques.every((c) => c.score === 7)).toBe(true);
    expect(result.critiques.every((c) => c.issues.length === 1)).toBe(true);
  });

  it('returns revise decision when high issues exist', async () => {
    // All critics return same response with a high-severity issue
    mockCreate.mockResolvedValue({
      content: [{
        type: 'tool_use', id: 'c1', name: 'submit_critique',
        input: { score: 5, pass: false, issues: [{ severity: 'high', description: 'Hero is weak', suggestion: 'Rewrite' }] },
      }],
    });

    const result = await runCritiqueRound('Draft', 'website', 'idea-1');

    expect(result.decision).toBe('revise');
    expect(result.brief).toContain('Hero is weak');
  });

  it('returns approve when scores are high and no high issues', async () => {
    // All critics score high (above minAggregateScore of 4)
    mockCreate.mockResolvedValue({
      content: [{
        type: 'tool_use', id: 'c1', name: 'submit_critique',
        input: { score: 8, pass: true, issues: [] },
      }],
    });

    const result = await runCritiqueRound('Great draft', 'website', 'idea-1');

    expect(result.decision).toBe('approve');
    expect(result.avgScore).toBe(8);
  });

  it('handles individual critic failures gracefully via allSettled', async () => {
    // First call rejects, rest succeed — due to async scheduling,
    // the rejection may go to any critic, so check by counting
    mockCreate
      .mockRejectedValueOnce(new Error('Critic timeout'))
      .mockResolvedValue({
        content: [{
          type: 'tool_use', id: 'c2', name: 'submit_critique',
          input: { score: 8, pass: true, issues: [] },
        }],
      });

    const result = await runCritiqueRound('Draft', 'website', 'idea-1');

    expect(result.critiques).toHaveLength(4);
    // Exactly one critic should have failed
    const failedCritics = result.critiques.filter((c) => c.error);
    expect(failedCritics).toHaveLength(1);
    expect(failedCritics[0].error).toContain('Critic timeout');
    expect(failedCritics[0].score).toBe(0);
    // The other 3 should have succeeded
    const succeededCritics = result.critiques.filter((c) => !c.error);
    expect(succeededCritics).toHaveLength(3);
    expect(succeededCritics.every((c) => c.score === 8)).toBe(true);
  });

  it('applies oscillation guard when previousAvgScore is higher', async () => {
    // All critics score 3, previous was 5 → score decreased → oscillation guard → approve
    mockCreate.mockResolvedValue({
      content: [{
        type: 'tool_use', id: 'c1', name: 'submit_critique',
        input: { score: 3, pass: false, issues: [{ severity: 'medium', description: 'Needs work', suggestion: 'Fix' }] },
      }],
    });

    const result = await runCritiqueRound('Draft', 'website', 'idea-1', 5);

    // Score decreased from 5 to 3, no high issues → oscillation guard → approve
    expect(result.decision).toBe('approve');
  });

  it('throws error for unknown recipe key', async () => {
    await expect(
      runCritiqueRound('Draft', 'nonexistent-recipe', 'idea-1'),
    ).rejects.toThrow('Recipe not found');
  });

  it('returns result with score 0 when all critics fail', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockRejectedValueOnce(new Error('Fail 3'))
      .mockRejectedValueOnce(new Error('Fail 4'));

    const result = await runCritiqueRound('Draft', 'website', 'idea-1');

    expect(result.critiques).toHaveLength(4);
    expect(result.critiques.every((c) => c.error)).toBe(true);
    expect(result.avgScore).toBe(0);
    // With avg=0, no high issues → below threshold → revise
    expect(result.decision).toBe('revise');
  });
});
