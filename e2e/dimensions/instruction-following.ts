import type { DimensionDefinition, HeuristicResult } from '../types';

export const instructionFollowing: DimensionDefinition = {
  name: 'instruction-following',
  description: 'Whether the response follows explicit instructions from the system prompt.',
  judgeRubric: 'Does the response follow the explicit instructions in the system prompt? Consider format requirements, constraints, and behavioral directives. Score 1-5.',
  heuristic(): HeuristicResult { return { result: 'n/a' }; },
};
