import type { DimensionDefinition, HeuristicResult } from '../types';

const DIMS = ['SEO Opportunity', 'Competitive Landscape', 'Willingness to Pay', 'Differentiation Potential', 'Expertise Alignment'];

export const scoringAccuracy: DimensionDefinition = {
  name: 'scoring-accuracy',
  description: 'Validates research agent scoring output structure.',
  judgeRubric: 'Are the individual dimension scores defensible? Is the recommendation tier consistent with scores? Score 1-5.',
  heuristic(response: string): HeuristicResult {
    const details: string[] = [];
    for (const dim of DIMS) {
      const m = response.match(new RegExp(`\\|\\s*${dim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|\\s*(\\d+)/10`, 'i'));
      if (!m) { details.push(`Missing dimension: ${dim}`); }
      else { const s = parseInt(m[1], 10); if (s < 1 || s > 10) details.push(`${dim}: score ${s} out of range 1-10`); }
    }
    if (!response.match(/OVERALL RECOMMENDATION:\s*Tier\s*[123]/i)) details.push('Missing or invalid OVERALL RECOMMENDATION');
    if (!response.match(/CONFIDENCE:\s*(High|Medium|Low)/i)) details.push('Missing CONFIDENCE');
    return details.length > 0 ? { result: 'fail', details } : { result: 'pass' };
  },
};
