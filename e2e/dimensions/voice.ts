import type { DimensionDefinition, EvalScenario, HeuristicResult } from '../types';

export const voice: DimensionDefinition = {
  name: 'voice',
  description: 'Whether a persona-based response is distinctively voiced.',
  judgeRubric: 'Is this response unmistakably from this specific advisor, or could it be from anyone? Evaluate tone, vocabulary, and stylistic distinctiveness. Score 1-5.',
  heuristic(response: string, scenario: EvalScenario): HeuristicResult {
    const config = scenario.dimensionConfig?.voice as { antiPatterns?: string[] } | undefined;
    if (!config?.antiPatterns?.length) return { result: 'n/a' };

    const lower = response.toLowerCase();
    const matches = config.antiPatterns.filter(p => lower.includes(p.toLowerCase()));

    if (matches.length > 0) {
      return { result: 'fail', details: matches.map(m => `Anti-pattern found: "${m}"`) };
    }
    return { result: 'pass' };
  },
};
