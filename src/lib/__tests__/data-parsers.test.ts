import { describe, it, expect } from 'vitest';
import { parseAnalysisFromMarkdown } from '../data';

describe('parseAnalysisFromMarkdown', () => {
  const sampleMarkdown = `# Analysis: Test Idea

## Summary

This is a promising niche with good SEO potential.

---

| Dimension | Weight | Score/10 | Reasoning |
|-----------|--------|----------|-----------|
| SEO Opportunity | 50% | 8/10 | Good content gaps |
| Competitive Landscape | 15% | 6/10 | Moderate competition |
| Willingness to Pay | 20% | 7/10 | Proven price points |
| Differentiation Potential | 10% | 5/10 | Some unique angles |
| Expertise Alignment | 5% | 9/10 | Strong fit |

Confidence: High

OVERALL RECOMMENDATION: Tier 1

## Key Risks

1. **Market saturation** in adjacent categories
2. **Regulatory changes** could impact growth
3. **Customer acquisition** costs may be high

---
`;

  it('extracts all five scores', () => {
    const result = parseAnalysisFromMarkdown('test', sampleMarkdown);
    expect(result.scores?.seoOpportunity).toBe(8);
    expect(result.scores?.competitiveLandscape).toBe(6);
    expect(result.scores?.willingnessToPay).toBe(7);
    expect(result.scores?.differentiationPotential).toBe(5);
    expect(result.scores?.expertiseAlignment).toBe(9);
  });

  it('extracts confidence', () => {
    const result = parseAnalysisFromMarkdown('test', sampleMarkdown);
    expect(result.confidence).toBe('High');
  });

  it('extracts recommendation tier', () => {
    const result = parseAnalysisFromMarkdown('test', sampleMarkdown);
    expect(result.recommendation).toBe('Tier 1');
  });

  it('extracts risks', () => {
    const result = parseAnalysisFromMarkdown('test', sampleMarkdown);
    expect(result.risks?.length).toBeGreaterThan(0);
    expect(result.risks?.[0]).toContain('Market saturation');
  });

  it('extracts summary', () => {
    const result = parseAnalysisFromMarkdown('test', sampleMarkdown);
    expect(result.summary).toContain('promising niche');
  });

  it('returns defaults for empty content', () => {
    const result = parseAnalysisFromMarkdown('test', '');
    expect(result.confidence).toBe('Unknown');
    expect(result.recommendation).toBe('Incomplete');
    expect(result.risks).toEqual([]);
  });
});
