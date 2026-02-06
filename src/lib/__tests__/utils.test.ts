import { describe, it, expect } from 'vitest';
import { slugify, fuzzyMatchPair, formatScoreName } from '../utils';

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(slugify('Hello! @World#')).toBe('hello-world');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('---hello---')).toBe('hello');
  });
});

describe('fuzzyMatchPair', () => {
  it('matches exact strings', () => {
    expect(fuzzyMatchPair('seo tools', 'seo tools')).toBe(true);
  });

  it('matches when one contains the other', () => {
    expect(fuzzyMatchPair('seo', 'best seo tools')).toBe(true);
  });

  it('matches on 60% word overlap', () => {
    expect(fuzzyMatchPair('best seo tools for startups', 'best seo tools online')).toBe(true);
  });

  it('returns false for unrelated strings', () => {
    expect(fuzzyMatchPair('cooking recipes', 'seo tools')).toBe(false);
  });
});

describe('formatScoreName', () => {
  it('maps seoOpportunity to SEO', () => {
    expect(formatScoreName('seoOpportunity')).toBe('SEO');
  });

  it('returns key as-is for unknown keys', () => {
    expect(formatScoreName('unknown')).toBe('unknown');
  });
});
