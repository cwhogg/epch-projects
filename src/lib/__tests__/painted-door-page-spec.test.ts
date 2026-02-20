import { describe, it, expect } from 'vitest';
import {
  validateSectionCopy,
  validatePageMeta,
  getAllSectionTypes,
  getMissingSectionTypes,
} from '../painted-door-page-spec';
import type { PageSection, PageSpec } from '../painted-door-page-spec';

describe('validateSectionCopy', () => {
  it('accepts valid hero copy', () => {
    const result = validateSectionCopy('hero', {
      headline: 'Ship faster today',
      subheadline: 'Build landing pages in minutes, not weeks.',
      ctaText: 'Get started',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects hero headline over 8 words', () => {
    const result = validateSectionCopy('hero', {
      headline: 'This is a really long headline that exceeds the limit',
      subheadline: 'Short sub.',
      ctaText: 'Go',
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('headline');
  });

  it('rejects hero with missing ctaText', () => {
    const result = validateSectionCopy('hero', {
      headline: 'Ship faster',
      subheadline: 'Build pages quickly.',
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('ctaText');
  });

  it('accepts valid problem copy', () => {
    const result = validateSectionCopy('problem', {
      headline: 'The old way is broken',
      body: 'Teams waste weeks on landing pages. The process is manual, slow, and error-prone.',
    });
    expect(result.valid).toBe(true);
  });

  it('accepts valid features copy with 3 items', () => {
    const result = validateSectionCopy('features', {
      sectionHeadline: 'What you get',
      features: [
        { title: 'Fast', description: 'Build in minutes' },
        { title: 'Smart', description: 'AI-powered copy' },
        { title: 'Simple', description: 'No code needed' },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects features with fewer than 3 items', () => {
    const result = validateSectionCopy('features', {
      sectionHeadline: 'What you get',
      features: [
        { title: 'Fast', description: 'Build in minutes' },
        { title: 'Smart', description: 'AI-powered copy' },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('3');
  });

  it('rejects features with more than 6 items', () => {
    const result = validateSectionCopy('features', {
      sectionHeadline: 'What you get',
      features: Array.from({ length: 7 }, (_, i) => ({ title: `F${i}`, description: `D${i}` })),
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('6');
  });

  it('accepts valid how-it-works copy', () => {
    const result = validateSectionCopy('how-it-works', {
      sectionHeadline: 'How it works',
      steps: [
        { label: 'Sign up', description: 'Create your account' },
        { label: 'Build', description: 'Use the builder' },
        { label: 'Launch', description: 'Go live' },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects how-it-works with fewer than 3 steps', () => {
    const result = validateSectionCopy('how-it-works', {
      sectionHeadline: 'How it works',
      steps: [
        { label: 'Sign up', description: 'Create your account' },
        { label: 'Build', description: 'Use the builder' },
      ],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects how-it-works with more than 5 steps', () => {
    const result = validateSectionCopy('how-it-works', {
      sectionHeadline: 'How it works',
      steps: Array.from({ length: 6 }, (_, i) => ({ label: `S${i}`, description: `D${i}` })),
    });
    expect(result.valid).toBe(false);
  });

  it('accepts valid audience copy', () => {
    const result = validateSectionCopy('audience', {
      sectionHeadline: 'Built for founders',
      body: 'Pre-launch startups validating ideas.',
    });
    expect(result.valid).toBe(true);
  });

  it('accepts valid objections copy', () => {
    const result = validateSectionCopy('objections', {
      sectionHeadline: 'Common concerns',
      objections: [
        { question: 'Is it free?', answer: 'Yes, during beta.' },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it('accepts valid final-cta copy', () => {
    const result = validateSectionCopy('final-cta', {
      headline: 'Ready to start?',
      body: 'Join hundreds of founders.',
      ctaText: 'Sign up free',
    });
    expect(result.valid).toBe(true);
  });

  it('accepts valid faq copy', () => {
    const result = validateSectionCopy('faq', {
      sectionHeadline: 'FAQ',
      faqs: [
        { question: 'How does it work?', answer: 'You build a page.' },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects faq with empty faqs array', () => {
    const result = validateSectionCopy('faq', {
      sectionHeadline: 'FAQ',
      faqs: [],
    });
    expect(result.valid).toBe(false);
  });
});

describe('validatePageMeta', () => {
  it('accepts valid page meta', () => {
    const result = validatePageMeta({
      metaTitle: 'My Product — Fast Landing Pages',
      metaDescription: 'Build landing pages in minutes with AI-powered copy.',
      ogDescription: 'AI-powered landing page builder.',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects missing metaTitle', () => {
    const result = validatePageMeta({
      metaDescription: 'Description here.',
      ogDescription: 'OG here.',
    });
    expect(result.valid).toBe(false);
  });
});

describe('getMissingSectionTypes', () => {
  it('returns all 8 types when sections is empty', () => {
    const missing = getMissingSectionTypes([]);
    expect(missing).toHaveLength(8);
    expect(missing).toContain('hero');
    expect(missing).toContain('faq');
  });

  it('returns empty when all 8 types present', () => {
    const sections: PageSection[] = [
      { type: 'hero', copy: { headline: 'H', subheadline: 'S', ctaText: 'C' } },
      { type: 'problem', copy: { headline: 'H', body: 'B' } },
      { type: 'features', copy: { sectionHeadline: 'F', features: [{ title: 'T', description: 'D' }, { title: 'T2', description: 'D2' }, { title: 'T3', description: 'D3' }] } },
      { type: 'how-it-works', copy: { sectionHeadline: 'H', steps: [{ label: 'L', description: 'D' }, { label: 'L2', description: 'D2' }, { label: 'L3', description: 'D3' }] } },
      { type: 'audience', copy: { sectionHeadline: 'A', body: 'B' } },
      { type: 'objections', copy: { sectionHeadline: 'O', objections: [{ question: 'Q', answer: 'A' }] } },
      { type: 'final-cta', copy: { headline: 'H', body: 'B', ctaText: 'C' } },
      { type: 'faq', copy: { sectionHeadline: 'F', faqs: [{ question: 'Q', answer: 'A' }] } },
    ];
    const missing = getMissingSectionTypes(sections);
    expect(missing).toHaveLength(0);
  });

  it('identifies specific missing types', () => {
    const sections: PageSection[] = [
      { type: 'hero', copy: { headline: 'H', subheadline: 'S', ctaText: 'C' } },
    ];
    const missing = getMissingSectionTypes(sections);
    expect(missing).toHaveLength(7);
    expect(missing).not.toContain('hero');
    expect(missing).toContain('problem');
  });
});
