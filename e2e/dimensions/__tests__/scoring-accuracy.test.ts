import { describe, it, expect } from 'vitest';
import { scoringAccuracy } from '../scoring-accuracy';
import type { EvalScenario } from '../../types';

const base: EvalScenario = { name: 'test', surface: 'research-scoring', tags: [], config: {}, fixtures: {}, conversation: [], dimensions: [] };

const valid = `ONE-LINE SUMMARY: SecondLook is an AI-powered thrift inventory tool.

| Dimension | Score | Evidence-Based Reasoning |
|-----------|-------|--------------------------|
| SEO Opportunity | 7/10 | Low competition in thrift niche |
| Competitive Landscape | 6/10 | Few direct competitors |
| Willingness to Pay | 8/10 | Stores already pay for POS |
| Differentiation Potential | 7/10 | Unique CV approach |
| Expertise Alignment | 6/10 | Strong technical, moderate domain |

OVERALL RECOMMENDATION: Tier 2
CONFIDENCE: Medium

KEY RISKS:
- Training data acquisition
- Low-tech adopter base`;

describe('scoring-accuracy', () => {
  it('has correct name', () => { expect(scoringAccuracy.name).toBe('scoring-accuracy'); });
  it('passes for valid output', () => { expect(scoringAccuracy.heuristic(valid, base).result).toBe('pass'); });

  it('fails when dimension missing', () => {
    const r = scoringAccuracy.heuristic(valid.replace(/\| Expertise Alignment[^\n]*\n/, ''), base);
    expect(r.result).toBe('fail');
    expect(r.details?.some(d => d.includes('Expertise Alignment'))).toBe(true);
  });

  it('fails for out-of-range score', () => {
    const r = scoringAccuracy.heuristic(valid.replace('7/10 | Low competition', '15/10 | Low competition'), base);
    expect(r.result).toBe('fail');
  });

  it('fails when recommendation missing', () => {
    expect(scoringAccuracy.heuristic(valid.replace(/OVERALL RECOMMENDATION:[^\n]*/, ''), base).result).toBe('fail');
  });

  it('fails when confidence missing', () => {
    expect(scoringAccuracy.heuristic(valid.replace(/CONFIDENCE:[^\n]*/, ''), base).result).toBe('fail');
  });

  it('accepts all valid tiers', () => {
    for (const t of ['Tier 1', 'Tier 2', 'Tier 3']) {
      expect(scoringAccuracy.heuristic(valid.replace('Tier 2', t), base).result).toBe('pass');
    }
  });

  it('accepts all valid confidence levels', () => {
    for (const c of ['High', 'Medium', 'Low']) {
      expect(scoringAccuracy.heuristic(valid.replace('CONFIDENCE: Medium', `CONFIDENCE: ${c}`), base).result).toBe('pass');
    }
  });
});
