import { describe, it, expect } from 'vitest';
import {
  parseScores,
  parseRecommendation,
  parseConfidence,
  parseRisks,
  parseSummary,
} from '../research-agent-parsers';

// -- parseScores --

describe('parseScores', () => {
  it('extracts scores from a standard markdown table', () => {
    const content = `
| Dimension | Score |
|-----------|-------|
| SEO Opportunity | 8/10 |
| Competitive Landscape | 6/10 |
| Willingness to Pay | 7/10 |
| Differentiation Potential | 9/10 |
| Expertise Alignment | 5/10 |
`;
    const scores = parseScores(content);
    expect(scores.seoOpportunity).toBe(8);
    expect(scores.competitiveLandscape).toBe(6);
    expect(scores.willingnessToPay).toBe(7);
    expect(scores.differentiationPotential).toBe(9);
    expect(scores.expertiseAlignment).toBe(5);
    expect(scores.overall).toBeTypeOf('number');
  });

  it('returns all nulls when no scores found', () => {
    const scores = parseScores('No scores here at all');
    expect(scores.seoOpportunity).toBeNull();
    expect(scores.competitiveLandscape).toBeNull();
    expect(scores.overall).toBeNull();
  });

  it('handles partial scores (only some dimensions present)', () => {
    const content = '| SEO Opportunity | 7/10 |\n| Willingness to Pay | 5/10 |';
    const scores = parseScores(content);
    expect(scores.seoOpportunity).toBe(7);
    expect(scores.willingnessToPay).toBe(5);
    expect(scores.competitiveLandscape).toBeNull();
  });

  it('handles two-column table format (dimension | score)', () => {
    const content = `
| Dimension | Score |
|-----------|-------|
| SEO Opportunity | 8/10 |
| Competitive Landscape | 4/10 |
`;
    const scores = parseScores(content);
    expect(scores.seoOpportunity).toBe(8);
    expect(scores.competitiveLandscape).toBe(4);
  });
});

// -- parseRecommendation --

describe('parseRecommendation', () => {
  it('extracts Tier 1', () => {
    expect(parseRecommendation('OVERALL RECOMMENDATION: Tier 1')).toBe('Tier 1');
  });

  it('extracts Tier 2', () => {
    expect(parseRecommendation('RECOMMENDATION: Tier 2')).toBe('Tier 2');
  });

  it('extracts Tier 3', () => {
    expect(parseRecommendation('OVERALL RECOMMENDATION: Tier 3')).toBe('Tier 3');
  });

  it('returns Incomplete when no tier found', () => {
    expect(parseRecommendation('No recommendation here')).toBe('Incomplete');
  });

  it('extracts Incomplete explicitly', () => {
    expect(parseRecommendation('RECOMMENDATION: Incomplete')).toBe('Incomplete');
  });

  it('finds tier mentions anywhere in text as fallback', () => {
    expect(parseRecommendation('Based on analysis, this is a Tier 1 idea.')).toBe('Tier 1');
  });
});

// -- parseConfidence --

describe('parseConfidence', () => {
  it('extracts High confidence', () => {
    expect(parseConfidence('CONFIDENCE: High')).toBe('High');
  });

  it('extracts Medium confidence', () => {
    expect(parseConfidence('CONFIDENCE: Medium')).toBe('Medium');
  });

  it('extracts Low confidence', () => {
    expect(parseConfidence('CONFIDENCE: Low')).toBe('Low');
  });

  it('returns Unknown when no confidence found', () => {
    expect(parseConfidence('No confidence info')).toBe('Unknown');
  });

  it('uses the last match when multiple confidence lines exist', () => {
    const content = 'CONFIDENCE: Low\nSome text\nCONFIDENCE: High';
    expect(parseConfidence(content)).toBe('High');
  });

  it('handles case-insensitive input', () => {
    expect(parseConfidence('confidence: high')).toBe('High');
  });
});

// -- parseRisks --

describe('parseRisks', () => {
  it('extracts bullet-pointed risks from KEY RISKS section', () => {
    const content = `KEY RISKS:
- Market is saturated with established players
- Regulatory compliance will be expensive
- Customer acquisition cost could be high
`;
    const risks = parseRisks(content);
    expect(risks.length).toBe(3);
    expect(risks[0]).toContain('Market is saturated');
  });

  it('returns empty array when no risks section', () => {
    expect(parseRisks('No risks here')).toEqual([]);
  });

  it('limits to 5 risks', () => {
    const content = `KEY RISKS:
- Risk one is described here
- Risk two is described here
- Risk three is described here
- Risk four is described here
- Risk five is described here
- Risk six is described here
- Risk seven is described here
`;
    const risks = parseRisks(content);
    expect(risks.length).toBeLessThanOrEqual(5);
  });

  it('filters out short bullet points (< 10 chars)', () => {
    const content = `KEY RISKS:
- Short
- This risk is long enough to pass the filter
`;
    const risks = parseRisks(content);
    expect(risks.length).toBe(1);
  });
});

// -- parseSummary --

describe('parseSummary', () => {
  it('extracts ONE-LINE SUMMARY', () => {
    const content = 'ONE-LINE SUMMARY: This is a promising B2B SaaS idea for healthcare.';
    expect(parseSummary(content)).toBe('This is a promising B2B SaaS idea for healthcare.');
  });

  it('falls back to Summary section', () => {
    const content = `Summary:

This product targets a niche market with high potential.`;
    expect(parseSummary(content)).toContain('niche market');
  });

  it('falls back to OVERALL RECOMMENDATION line', () => {
    const content = 'OVERALL RECOMMENDATION: Tier 1 — pursue aggressively';
    expect(parseSummary(content)).toContain('Tier 1');
  });

  it('returns empty string when nothing matches', () => {
    expect(parseSummary('Random content with no markers')).toBe('');
  });
});
