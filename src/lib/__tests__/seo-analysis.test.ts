import { describe, it, expect } from 'vitest';
import {
  fuzzyMatch,
  parseSEOJSON,
  validateSEOResult,
  compareSEOResults,
} from '../seo-analysis';
import { cleanJSONString } from '../llm-utils';

describe('fuzzyMatch', () => {
  it('matches exact keywords', () => {
    expect(fuzzyMatch('seo tools', ['seo tools', 'other keyword'])).toBe(true);
  });

  it('matches when one contains the other', () => {
    expect(fuzzyMatch('seo', ['best seo tools'])).toBe(true);
  });

  it('matches on 60% word overlap', () => {
    expect(fuzzyMatch('best seo tools for startups', ['best seo tools online'])).toBe(true);
  });

  it('returns false for unrelated keywords', () => {
    expect(fuzzyMatch('cooking recipes', ['seo tools'])).toBe(false);
  });

  it('strips non-alphanumeric characters for comparison', () => {
    expect(fuzzyMatch('seo tools!', ['seo tools'])).toBe(true);
  });
});

describe('cleanJSONString', () => {
  it('removes trailing commas before }', () => {
    expect(cleanJSONString('{"key": "value",}')).toBe('{"key": "value"}');
  });

  it('removes trailing commas before ]', () => {
    expect(cleanJSONString('["a", "b",]')).toBe('["a", "b"]');
  });

  it('removes single-line comments', () => {
    expect(cleanJSONString('{"key": "value"} // comment')).toBe('{"key": "value"} ');
  });

  it('removes multi-line comments', () => {
    expect(cleanJSONString('{"key": /* comment */ "value"}')).toBe('{"key":  "value"}');
  });
});

describe('parseSEOJSON', () => {
  it('parses valid JSON directly', () => {
    const input = JSON.stringify({
      keywords: [{ keyword: 'test', intentType: 'Informational', estimatedVolume: 'High', estimatedCompetitiveness: 'Low', contentGapHypothesis: 'gap', relevanceToMillionARR: 'High', rationale: 'good' }],
      contentStrategy: { topOpportunities: ['opp1'], recommendedAngle: 'angle', communitySignals: [] },
      difficultyAssessment: { dominantPlayers: [], roomForNewEntrant: true, reasoning: 'room' },
    });
    const result = parseSEOJSON(input);
    expect(result.keywords.length).toBe(1);
    expect(result.keywords[0].keyword).toBe('test');
  });

  it('strips markdown code fences', () => {
    const json = JSON.stringify({
      keywords: [],
      contentStrategy: { topOpportunities: [], recommendedAngle: '', communitySignals: [] },
      difficultyAssessment: { dominantPlayers: [], roomForNewEntrant: false, reasoning: '' },
    });
    const result = parseSEOJSON('```json\n' + json + '\n```');
    expect(result.keywords).toEqual([]);
  });

  it('returns defaults for unparseable text', () => {
    const result = parseSEOJSON('this is not json at all');
    expect(result.keywords).toEqual([]);
    expect(result.contentStrategy.recommendedAngle).toBe('Unable to determine');
  });
});

describe('validateSEOResult', () => {
  it('validates and normalizes enum values', () => {
    const result = validateSEOResult({
      keywords: [{ keyword: 'test', intentType: 'InvalidType', estimatedVolume: 'Invalid', estimatedCompetitiveness: 'Invalid', contentGapHypothesis: 'gap', relevanceToMillionARR: 'Invalid', rationale: 'r' }],
      contentStrategy: {},
      difficultyAssessment: {},
    });
    expect(result.keywords[0].intentType).toBe('Informational');
    expect(result.keywords[0].estimatedVolume).toBe('Unknown');
  });
});

describe('compareSEOResults', () => {
  const makeResult = (keywords: string[]) => ({
    keywords: keywords.map((k) => ({ keyword: k, intentType: 'Informational' as const, estimatedVolume: 'Medium' as const, estimatedCompetitiveness: 'Medium' as const, contentGapHypothesis: '', relevanceToMillionARR: 'Medium' as const, rationale: '' })),
    contentStrategy: { topOpportunities: [], recommendedAngle: '', communitySignals: [] },
    difficultyAssessment: { dominantPlayers: [], roomForNewEntrant: false, reasoning: '' },
  });

  it('returns null when openai result is null', () => {
    expect(compareSEOResults(makeResult(['kw1']), null)).toBeNull();
  });

  it('identifies agreed and unique keywords', () => {
    const result = compareSEOResults(makeResult(['shared', 'claude-only']), makeResult(['shared', 'openai-only']));
    expect(result).not.toBeNull();
    expect(result!.agreedKeywords).toContain('shared');
    expect(result!.claudeUniqueKeywords).toContain('claude-only');
    expect(result!.openaiUniqueKeywords).toContain('openai-only');
  });
});
