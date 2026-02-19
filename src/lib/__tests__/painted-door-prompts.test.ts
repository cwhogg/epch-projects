import { describe, it, expect, vi } from 'vitest';

vi.mock('../seo-knowledge', () => ({
  detectVertical: () => 'b2b-saas',
  CONTENT_GAP_TYPES: [{ type: 'gap', description: 'test' }],
  COMMUNITY_MAPPINGS: { 'b2b-saas': { subreddits: ['r/saas'], forums: ['forum'] } },
  KEYWORD_PATTERNS: { 'b2b-saas': [{ category: 'test', patterns: ['pattern'] }] },
  SERP_CRITERIA: { 'b2b-saas': { greenFlags: ['flag'], redFlags: ['flag'] } },
  INTENT_WEIGHTS: [{ intent: 'info', weight: 1 }],
}));

import { buildBrandIdentityPrompt } from '../painted-door-prompts';
import type { ProductIdea } from '@/types';
import type { ContentContext } from '../content-prompts';

const mockIdea: ProductIdea = {
  id: 'idea-1',
  name: 'Test Product',
  description: 'A test product',
  targetUser: 'developers',
  problemSolved: 'testing',
};

const mockCtx: ContentContext = {
  ideaName: 'Test Product',
  ideaDescription: 'A test product',
  targetUser: 'developers',
  problemSolved: 'testing',
  summary: 'A summary',
  competitors: 'None',
  topKeywords: [
    { keyword: 'test tool', intentType: 'transactional', estimatedVolume: 'high', estimatedCompetitiveness: 'medium', contentGapHypothesis: '' },
  ],
  serpValidated: [],
  contentStrategy: { recommendedAngle: 'test', topOpportunities: ['op1'] },
};

describe('buildBrandIdentityPrompt', () => {
  it('does not contain "dark theme preferred"', () => {
    const prompt = buildBrandIdentityPrompt(mockIdea, mockCtx);
    expect(prompt).not.toContain('dark theme preferred');
  });

  it('includes Foundation documents when provided', () => {
    const docs = [
      { type: 'design-principles', content: 'Use a light cream background (#FFFDF5) with forest green accents (#2D5016).' },
      { type: 'brand-voice', content: 'Warm, approachable, clinical precision.' },
    ];
    const prompt = buildBrandIdentityPrompt(mockIdea, mockCtx, false, docs);

    expect(prompt).toContain('FOUNDATION DOCUMENTS (Source of Truth)');
    expect(prompt).toContain('Use a light cream background (#FFFDF5)');
    expect(prompt).toContain('Warm, approachable, clinical precision.');
    expect(prompt).toContain('Design-Principles Override');
  });

  it('does not include Foundation section when no docs provided', () => {
    const prompt = buildBrandIdentityPrompt(mockIdea, mockCtx);
    expect(prompt).not.toContain('FOUNDATION DOCUMENTS');
    expect(prompt).not.toContain('Design-Principles Override');
  });

  it('does not include Foundation section when empty array provided', () => {
    const prompt = buildBrandIdentityPrompt(mockIdea, mockCtx, false, []);
    expect(prompt).not.toContain('FOUNDATION DOCUMENTS');
  });

  it('includes override instructions for design-principles', () => {
    const docs = [{ type: 'design-principles', content: 'Light theme with warm tones.' }];
    const prompt = buildBrandIdentityPrompt(mockIdea, mockCtx, false, docs);

    expect(prompt).toContain('extract its color palette, typography, and visual direction');
    expect(prompt).toContain('Do NOT default to dark');
  });

  it('uses neutral language for background color in schema', () => {
    const prompt = buildBrandIdentityPrompt(mockIdea, mockCtx);
    expect(prompt).toContain('"background": "#hex (page background');
    expect(prompt).toContain('derive from Foundation design-principles if available');
  });

  it('visualOnly schema also has neutral background language', () => {
    const prompt = buildBrandIdentityPrompt(mockIdea, mockCtx, true);
    expect(prompt).toContain('derive from Foundation design-principles if available');
    expect(prompt).not.toContain('dark theme preferred');
  });

  it('includes word count constraints for heroHeadline in full schema', () => {
    const prompt = buildBrandIdentityPrompt(mockIdea, mockCtx);
    expect(prompt).toContain('3-8 words MAX');
  });

  it('includes word count constraints in SEO requirements', () => {
    const prompt = buildBrandIdentityPrompt(mockIdea, mockCtx);
    expect(prompt).toMatch(/heroHeadline:.*3-8 words MAX/);
    expect(prompt).toMatch(/heroSubheadline:.*max 30 words/);
    expect(prompt).toMatch(/ctaText:.*2-5 words/);
  });

  it('visualOnly schema does not include heroHeadline constraints', () => {
    const prompt = buildBrandIdentityPrompt(mockIdea, mockCtx, true);
    // visualOnly omits landingPage entirely
    expect(prompt).not.toContain('heroHeadline');
  });
});
