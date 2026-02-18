import type { DimensionDefinition, EvalScenario, HeuristicResult } from '../types';

function extractJson(response: string): string | null {
  try { JSON.parse(response); return response; } catch { /* continue */ }
  const match = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (match) { try { JSON.parse(match[1]); return match[1]; } catch { /* continue */ } }
  return null;
}

export const structuredOutput: DimensionDefinition = {
  name: 'structured-output',
  description: 'Whether LLM output is valid parseable JSON with expected fields.',
  judgeRubric: 'Are all required fields present with sensible values? Is the JSON structure well-formed and complete? Score 1-5.',
  heuristic(response: string, scenario: EvalScenario): HeuristicResult {
    const json = extractJson(response);
    if (!json) return { result: 'fail', details: ['Failed to parse JSON from response'] };
    const config = scenario.dimensionConfig?.['structured-output'] as { requiredFields?: string[] } | undefined;
    if (config?.requiredFields?.length) {
      const parsed = JSON.parse(json);
      const missing = config.requiredFields.filter(f => !(f in parsed));
      if (missing.length > 0) return { result: 'fail', details: missing.map(f => `Missing required field: "${f}"`) };
    }
    return { result: 'pass' };
  },
};
