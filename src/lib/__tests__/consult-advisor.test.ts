import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({ messages: { create: mockCreate } }),
}));

vi.mock('@/lib/config', () => ({
  CLAUDE_MODEL: 'claude-test-model',
}));

vi.mock('@/lib/advisors/prompt-loader', () => ({
  getAdvisorSystemPrompt: vi.fn((id: string) => {
    if (id === 'oli-gardner') return 'You are Oli Gardner, conversion expert.';
    if (id === 'unknown') throw new Error('Unknown advisor: unknown');
    return `You are ${id}.`;
  }),
}));

vi.mock('@/lib/db', () => ({
  getFoundationDoc: vi.fn().mockResolvedValue(null),
  getAllFoundationDocs: vi.fn().mockResolvedValue({}),
}));

import { createConsultAdvisorTool } from '../agent-tools/website-chat';

describe('consult_advisor tool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls Anthropic with advisor prompt and question', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Oli says: improve your CTA placement.' }],
    });

    const tool = createConsultAdvisorTool('idea-1');
    const result = await tool.execute({
      advisorId: 'oli-gardner',
      question: 'How should I place CTAs?',
      context: 'Current hero: "Build better products"',
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toContain('You are Oli Gardner');
    expect(callArgs.messages[0].content).toContain('How should I place CTAs?');
    expect(callArgs.messages[0].content).toContain('Current hero:');
    expect(result).toContain('Oli says: improve your CTA placement.');
  });

  it('returns error string for unknown advisor', async () => {
    const tool = createConsultAdvisorTool('idea-1');
    const result = await tool.execute({
      advisorId: 'unknown',
      question: 'test',
    });
    expect(result).toContain('Error');
    expect(result).toContain('unknown');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('handles Anthropic API failure gracefully', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Rate limit exceeded'));

    const tool = createConsultAdvisorTool('idea-1');
    const result = await tool.execute({
      advisorId: 'oli-gardner',
      question: 'test question',
    });

    expect(result).toContain('Error');
    expect(result).toContain('Rate limit');
  });

  it('includes foundation doc context when available', async () => {
    const { getAllFoundationDocs } = await import('@/lib/db');
    (getAllFoundationDocs as ReturnType<typeof vi.fn>).mockResolvedValue({
      positioning: { type: 'positioning', content: 'We are positioned as...', generatedAt: '2026-02-17' },
    });

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Based on your positioning...' }],
    });

    const tool = createConsultAdvisorTool('idea-1');
    await tool.execute({
      advisorId: 'oli-gardner',
      question: 'Review my hero section',
    });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('positioning');
    expect(callArgs.messages[0].content).toContain('We are positioned as...');
  });

  it('has correct tool definition schema', () => {
    const tool = createConsultAdvisorTool('idea-1');
    expect(tool.name).toBe('consult_advisor');
    expect(tool.input_schema.properties).toHaveProperty('advisorId');
    expect(tool.input_schema.properties).toHaveProperty('question');
    expect(tool.input_schema.required).toContain('advisorId');
    expect(tool.input_schema.required).toContain('question');
  });
});
