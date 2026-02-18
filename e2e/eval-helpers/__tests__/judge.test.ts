import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runJudge } from '../judge';

const mockCreate = vi.fn();
vi.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({ messages: { create: mockCreate } }),
}));

function toolResponse(score: number, reasoning: string) {
  return {
    content: [{ type: 'tool_use' as const, id: 'toolu_1', name: 'score_response', input: { score, reasoning } }],
  };
}

const input = { rubric: 'Test rubric', systemPrompt: 'Test prompt', response: 'Test response', model: 'claude-haiku-4-5-20251001' };

describe('judge', () => {
  beforeEach(() => { mockCreate.mockReset(); });

  it('returns median score from 3 calls', async () => {
    mockCreate
      .mockResolvedValueOnce(toolResponse(3, 'Low'))
      .mockResolvedValueOnce(toolResponse(5, 'High'))
      .mockResolvedValueOnce(toolResponse(4, 'Mid'));
    const result = await runJudge(input);
    expect(result.score).toBe(4);
    expect(result.individualScores).toEqual([3, 5, 4]);
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('returns score 0 when all calls fail', async () => {
    mockCreate.mockRejectedValue(new Error('API error'));
    const result = await runJudge(input);
    expect(result.score).toBe(0);
    expect(result.reasoning).toContain('All judge calls failed');
  });

  it('handles partial failures', async () => {
    mockCreate
      .mockResolvedValueOnce(toolResponse(4, 'Good'))
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce(toolResponse(3, 'OK'));
    const result = await runJudge(input);
    expect(result.score).toBe(3); // median of [3, 4]
    expect(result.individualScores).toEqual([4, 3]);
  });

  it('handles response with no tool_use block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Cannot score.' }] });
    const result = await runJudge(input);
    expect(result.score).toBe(0);
  });

  it('handles tool_use with missing score field', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use' as const, id: 'toolu_1', name: 'score_response', input: { reasoning: 'No score' } }],
    });
    const result = await runJudge(input);
    expect(result.score).toBe(0);
  });

  it('truncates system prompt to 3000 chars', async () => {
    mockCreate.mockResolvedValue(toolResponse(4, 'OK'));
    await runJudge({ ...input, systemPrompt: 'x'.repeat(5000) });
    const userContent = mockCreate.mock.calls[0][0].messages[0].content;
    expect(userContent.length).toBeLessThan(5000);
  });
});
