import { EVAL_CONFIG } from '../eval-config';
import type { DimensionDefinition, EvalScenario, HeuristicResult } from '../types';

interface Thresholds { words?: { max: number; warn: number }; sentences?: { max: number; warn: number }; paragraphs?: { max: number; warn: number }; }

export const outputLength: DimensionDefinition = {
  name: 'output-length',
  description: 'Checks response length against configurable thresholds.',
  judgeRubric: 'Is the response length appropriate for this conversational context? Score 1-5.',
  heuristic(response: string, scenario: EvalScenario): HeuristicResult {
    const t = (scenario.dimensionConfig?.['output-length'] ?? EVAL_CONFIG.outputLength) as Thresholds;
    const details: string[] = [];
    let worst: 'pass' | 'warn' | 'fail' = 'pass';

    const words = response.split(/\s+/).filter(Boolean).length;
    const sentences = response.split(/[.!?]+/).filter(s => s.trim()).length;
    const paragraphs = response.split(/\n\s*\n/).filter(p => p.trim()).length;

    function check(metric: string, count: number, limits?: { max: number; warn: number }) {
      if (!limits) return;
      if (count > limits.warn) { worst = 'fail'; details.push(`${metric}: ${count} exceeds fail threshold ${limits.warn}`); }
      else if (count > limits.max) { if (worst !== 'fail') worst = 'warn'; details.push(`${metric}: ${count} exceeds warn threshold ${limits.max}`); }
    }

    check('words', words, t.words);
    check('sentences', sentences, t.sentences);
    check('paragraphs', paragraphs, t.paragraphs);
    return { result: worst, details: details.length > 0 ? details : undefined };
  },
};
