import { describe, it, expect } from 'vitest';
import {
  renderHeroSection,
  renderProblemSection,
  renderFeaturesSection,
  renderHowItWorksSection,
  renderAudienceSection,
  renderObjectionSection,
  renderFinalCtaSection,
  renderFaqSection,
  renderLandingPage,
  RenderContext,
} from '../painted-door-sections';
import type { BrandIdentity } from '@/types';
import type { PageSpec, PageSection } from '../painted-door-page-spec';

const testBrand: BrandIdentity = {
  siteName: 'TestBrand',
  tagline: 'Test tagline',
  siteUrl: 'https://test.vercel.app',
  colors: {
    primary: '#000',
    primaryLight: '#111',
    background: '#FFF',
    backgroundElevated: '#F0F0F0',
    text: '#222',
    textSecondary: '#555',
    textMuted: '#888',
    accent: '#0F0',
    border: '#DDD',
  },
  fonts: { heading: 'Inter', body: 'Open Sans', mono: 'Fira Code' },
  theme: 'light',
};

const testCtx: RenderContext = {
  brand: testBrand,
  formStateVarNames: { email: 'email', status: 'status', handleSubmit: 'handleSubmit' },
};

function buildFullPageSpec(): PageSpec {
  return {
    sections: [
      { type: 'hero', copy: { headline: 'Ship faster today', subheadline: 'Build pages quickly.', ctaText: 'Get started now' } },
      { type: 'problem', copy: { headline: 'The old way is broken', body: 'Teams waste weeks on landing pages. The process is manual and slow.' } },
      { type: 'features', copy: { sectionHeadline: 'What you get', features: [
        { title: 'Fast', description: 'Build in minutes' },
        { title: 'Smart', description: 'AI-powered copy' },
        { title: 'Simple', description: 'No code needed' },
      ] } },
      { type: 'how-it-works', copy: { sectionHeadline: 'How it works', steps: [
        { label: 'Sign up', description: 'Create your account' },
        { label: 'Build', description: 'Use the builder' },
        { label: 'Launch', description: 'Go live' },
      ] } },
      { type: 'audience', copy: { sectionHeadline: 'Built for founders', body: 'Pre-launch startups validating ideas.' } },
      { type: 'objections', copy: { sectionHeadline: 'Common concerns', objections: [
        { question: 'Is it free?', answer: 'Yes, during beta.' },
      ] } },
      { type: 'final-cta', copy: { headline: 'Ready to start?', body: 'Join hundreds of founders.', ctaText: 'Sign up free' } },
      { type: 'faq', copy: { sectionHeadline: 'FAQ', faqs: [
        { question: 'How does it work?', answer: 'You build a page.' },
        { question: 'Is it reliable?', answer: 'Very much so.' },
      ] } },
    ],
    metaTitle: 'TestBrand — Fast Landing Pages',
    metaDescription: 'Build landing pages in minutes with AI-powered copy.',
    ogDescription: 'AI-powered landing page builder.',
  };
}

describe('renderHeroSection', () => {
  it('contains the headline verbatim', () => {
    const html = renderHeroSection(
      { headline: 'Ship faster today', subheadline: 'Build pages quickly.', ctaText: 'Get started now' },
      testCtx,
    );
    expect(html).toContain('Ship faster today');
    expect(html).toContain('Build pages quickly.');
    expect(html).toContain('Get started now');
  });

  it('references shared form state variables', () => {
    const html = renderHeroSection(
      { headline: 'Ship faster today', subheadline: 'Build pages quickly.', ctaText: 'Get started now' },
      testCtx,
    );
    expect(html).toContain('email');
    expect(html).toContain('handleSubmit');
  });

  it('includes email input field', () => {
    const html = renderHeroSection(
      { headline: 'Ship faster today', subheadline: 'Build pages quickly.', ctaText: 'Get started now' },
      testCtx,
    );
    expect(html).toContain('type="email"');
  });
});

describe('renderProblemSection', () => {
  it('contains the headline and body', () => {
    const html = renderProblemSection(
      { headline: 'The old way is broken', body: 'Teams waste weeks.' },
      testCtx,
    );
    expect(html).toContain('The old way is broken');
    expect(html).toContain('Teams waste weeks.');
  });

  it('has a section element with aria-label', () => {
    const html = renderProblemSection(
      { headline: 'The old way', body: 'Body text.' },
      testCtx,
    );
    expect(html).toContain('section');
    expect(html).toContain('aria-label');
  });
});

describe('renderFeaturesSection', () => {
  it('contains all feature titles and descriptions', () => {
    const html = renderFeaturesSection(
      {
        sectionHeadline: 'What you get',
        features: [
          { title: 'Fast', description: 'Build in minutes' },
          { title: 'Smart', description: 'AI-powered copy' },
          { title: 'Simple', description: 'No code needed' },
        ],
      },
      testCtx,
    );
    expect(html).toContain('What you get');
    expect(html).toContain('Fast');
    expect(html).toContain('AI-powered copy');
    expect(html).toContain('Simple');
  });

  it('uses 3-col grid for 3 features', () => {
    const html = renderFeaturesSection(
      {
        sectionHeadline: 'Features',
        features: [
          { title: 'A', description: 'D' },
          { title: 'B', description: 'D' },
          { title: 'C', description: 'D' },
        ],
      },
      testCtx,
    );
    expect(html).toContain('lg:grid-cols-3');
  });

  it('uses 2-col grid for 4 features', () => {
    const html = renderFeaturesSection(
      {
        sectionHeadline: 'Features',
        features: [
          { title: 'A', description: 'D' },
          { title: 'B', description: 'D' },
          { title: 'C', description: 'D' },
          { title: 'D', description: 'D' },
        ],
      },
      testCtx,
    );
    expect(html).toContain('lg:grid-cols-2');
  });
});

describe('renderHowItWorksSection', () => {
  it('contains all step labels and descriptions', () => {
    const html = renderHowItWorksSection(
      {
        sectionHeadline: 'How it works',
        steps: [
          { label: 'Sign up', description: 'Create your account' },
          { label: 'Build', description: 'Use the builder' },
          { label: 'Launch', description: 'Go live' },
        ],
      },
      testCtx,
    );
    expect(html).toContain('How it works');
    expect(html).toContain('Sign up');
    expect(html).toContain('Create your account');
    expect(html).toContain('Launch');
  });

  it('includes step numbers', () => {
    const html = renderHowItWorksSection(
      {
        sectionHeadline: 'Steps',
        steps: [
          { label: 'First', description: 'D1' },
          { label: 'Second', description: 'D2' },
          { label: 'Third', description: 'D3' },
        ],
      },
      testCtx,
    );
    // Should contain step indicators (1, 2, 3)
    expect(html).toContain('1');
    expect(html).toContain('2');
    expect(html).toContain('3');
  });
});

describe('renderAudienceSection', () => {
  it('contains the headline and body', () => {
    const html = renderAudienceSection(
      { sectionHeadline: 'Built for founders', body: 'Pre-launch startups.' },
      testCtx,
    );
    expect(html).toContain('Built for founders');
    expect(html).toContain('Pre-launch startups.');
  });
});

describe('renderObjectionSection', () => {
  it('contains objection questions and answers', () => {
    const html = renderObjectionSection(
      {
        sectionHeadline: 'Common concerns',
        objections: [
          { question: 'Is it free?', answer: 'Yes, during beta.' },
          { question: 'Is it secure?', answer: 'Absolutely.' },
        ],
      },
      testCtx,
    );
    expect(html).toContain('Common concerns');
    expect(html).toContain('Is it free?');
    expect(html).toContain('Yes, during beta.');
    expect(html).toContain('Is it secure?');
  });
});

describe('renderFinalCtaSection', () => {
  it('contains the headline, body, and CTA text', () => {
    const html = renderFinalCtaSection(
      { headline: 'Ready to start?', body: 'Join hundreds of founders.', ctaText: 'Sign up free' },
      testCtx,
    );
    expect(html).toContain('Ready to start?');
    expect(html).toContain('Join hundreds of founders.');
    expect(html).toContain('Sign up free');
  });

  it('references shared form state variables', () => {
    const html = renderFinalCtaSection(
      { headline: 'H', body: 'B', ctaText: 'Sign up now' },
      testCtx,
    );
    expect(html).toContain('email');
    expect(html).toContain('handleSubmit');
  });
});

describe('renderFaqSection', () => {
  it('contains FAQ questions and answers', () => {
    const html = renderFaqSection(
      {
        sectionHeadline: 'FAQ',
        faqs: [
          { question: 'How does it work?', answer: 'You build a page.' },
        ],
      },
      testCtx,
    );
    expect(html).toContain('FAQ');
    expect(html).toContain('How does it work?');
    expect(html).toContain('You build a page.');
  });
});

describe('renderLandingPage', () => {
  it('includes use client directive', () => {
    const spec = buildFullPageSpec();
    const html = renderLandingPage(spec, testBrand);
    expect(html).toContain("'use client'");
  });

  it('includes useState declarations', () => {
    const spec = buildFullPageSpec();
    const html = renderLandingPage(spec, testBrand);
    expect(html).toContain('useState');
  });

  it('includes Organization and WebSite JSON-LD', () => {
    const spec = buildFullPageSpec();
    const html = renderLandingPage(spec, testBrand);
    expect(html).toContain('Organization');
    expect(html).toContain('WebSite');
  });

  it('includes FAQPage JSON-LD when faq section present', () => {
    const spec = buildFullPageSpec();
    const html = renderLandingPage(spec, testBrand);
    expect(html).toContain('FAQPage');
  });

  it('omits FAQPage JSON-LD when no faq section', () => {
    const spec = buildFullPageSpec();
    spec.sections = spec.sections.filter((s) => s.type !== 'faq');
    const html = renderLandingPage(spec, testBrand);
    expect(html).not.toContain('FAQPage');
  });

  it('renders sections in order', () => {
    const spec = buildFullPageSpec();
    const html = renderLandingPage(spec, testBrand);
    const heroIdx = html.indexOf('Ship faster');
    const problemIdx = html.indexOf('The old way');
    const featuresIdx = html.indexOf('What you get');
    expect(heroIdx).toBeLessThan(problemIdx);
    expect(problemIdx).toBeLessThan(featuresIdx);
  });

  it('includes nav and footer', () => {
    const spec = buildFullPageSpec();
    const html = renderLandingPage(spec, testBrand);
    expect(html).toContain('TestBrand');
    expect(html).toContain('<header');
    expect(html).toContain('<footer');
  });

  it('includes import for useState and JsonLd', () => {
    const spec = buildFullPageSpec();
    const html = renderLandingPage(spec, testBrand);
    expect(html).toContain("import { useState, FormEvent } from 'react'");
    expect(html).toContain('JsonLd');
  });
});
