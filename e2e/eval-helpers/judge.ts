import { getAnthropic } from '@/lib/anthropic';
import type { JudgeResult } from '../types';

const JUDGE_CALLS = 3;
const MAX_PROMPT_LEN = 12000;

interface JudgeInput {
  rubric: string;
  systemPrompt: string;
  response: string;
  model: string;
}

const scoreTool = {
  name: 'score_response' as const,
  description: 'Score the LLM response',
  input_schema: {
    type: 'object' as const,
    properties: {
      score: { type: 'number' as const, minimum: 1, maximum: 5 },
      reasoning: { type: 'string' as const },
    },
    required: ['score', 'reasoning'],
  },
};

export async function runJudge(input: JudgeInput): Promise<JudgeResult> {
  const client = getAnthropic();
  const truncated = input.systemPrompt.slice(0, MAX_PROMPT_LEN);

  const promises = Array.from({ length: JUDGE_CALLS }, () =>
    client.messages.create({
      model: input.model,
      max_tokens: 256,
      system: `You are evaluating an LLM response. ${input.rubric}`,
      messages: [{
        role: 'user' as const,
        content: `System prompt (may be truncated):\n${truncated}\n\nResponse to evaluate:\n${input.response}`,
      }],
      tools: [scoreTool],
      tool_choice: { type: 'tool' as const, name: 'score_response' },
    }).catch(() => null)
  );

  const results = await Promise.all(promises);
  const scores: number[] = [];
  const reasonings: string[] = [];

  for (const result of results) {
    if (!result) continue;
    const block = result.content.find((b: { type: string }) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') continue;
    const inp = block.input as { score?: number; reasoning?: string };
    if (typeof inp.score !== 'number') continue;
    scores.push(inp.score);
    reasonings.push(inp.reasoning || '');
  }

  if (scores.length === 0) {
    return { score: 0, reasoning: 'All judge calls failed', individualScores: [] };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const medianIdx = Math.floor((sorted.length - 1) / 2);
  const medianScore = sorted[medianIdx];
  const closestIdx = scores.findIndex(s => s === medianScore);

  return { score: medianScore, reasoning: reasonings[closestIdx] || '', individualScores: scores };
}
