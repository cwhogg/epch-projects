import { describe, it, expect } from 'vitest';
import { assembleFromSpec } from '../painted-door-templates';
import type { BrandIdentity } from '@/types';
import type { PageSpec } from '../painted-door-page-spec';

function makeTestBrand(): BrandIdentity {
  return {
    siteName: 'Test Site',
    tagline: 'A test tagline',
    siteUrl: 'https://test.vercel.app',
    colors: {
      primary: '#000',
      primaryLight: '#333',
      background: '#111',
      backgroundElevated: '#222',
      text: '#fff',
      textSecondary: '#ccc',
      textMuted: '#999',
      accent: '#0ff',
      border: '#444',
    },
    fonts: { heading: 'Inter', body: 'Inter', mono: 'Fira Code' },
    theme: 'dark',
  };
}

function makeFullPageSpec(): PageSpec {
  return {
    sections: [
      { type: 'hero', copy: { headline: 'Ship faster today', subheadline: 'Build pages quickly.', ctaText: 'Get started now' } },
      { type: 'problem', copy: { headline: 'The old way is broken', body: 'Teams waste weeks.' } },
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
      { type: 'audience', copy: { sectionHeadline: 'Built for founders', body: 'Pre-launch startups.' } },
      { type: 'objections', copy: { sectionHeadline: 'Concerns', objections: [{ question: 'Free?', answer: 'Yes.' }] } },
      { type: 'final-cta', copy: { headline: 'Ready?', body: 'Join now.', ctaText: 'Sign up free' } },
      { type: 'faq', copy: { sectionHeadline: 'FAQ', faqs: [{ question: 'How?', answer: 'Easy.' }] } },
    ],
    metaTitle: 'Test Site — Fast Pages',
    metaDescription: 'Build landing pages in minutes.',
    ogDescription: 'AI landing page builder.',
  };
}

describe('assembleFromSpec', () => {
  it('generates all expected files', () => {
    const files = assembleFromSpec(makeFullPageSpec(), makeTestBrand());
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(20);
    expect(files['package.json']).toBeTruthy();
    expect(files['app/layout.tsx']).toBeTruthy();
    expect(files['app/globals.css']).toBeTruthy();
    expect(files['app/page.tsx']).toBeTruthy();
  });

  it('generates landing page with section content', () => {
    const files = assembleFromSpec(makeFullPageSpec(), makeTestBrand());
    expect(files['app/page.tsx']).toContain('Ship faster today');
    expect(files['app/page.tsx']).toContain('export default function Home');
  });

  it('throws when sections are missing', () => {
    const spec = makeFullPageSpec();
    spec.sections = spec.sections.filter((s) => s.type !== 'hero');
    expect(() => assembleFromSpec(spec, makeTestBrand())).toThrow('missing section types: hero');
  });

  it('uses pageSpec.metaDescription in layout', () => {
    const files = assembleFromSpec(makeFullPageSpec(), makeTestBrand());
    expect(files['app/layout.tsx']).toContain('Build landing pages in minutes.');
  });

  it('uses brand.siteUrl in sitemap', () => {
    const files = assembleFromSpec(makeFullPageSpec(), makeTestBrand());
    expect(files['app/sitemap.ts']).toContain('https://test.vercel.app');
  });

  it('includes all scaffold files', () => {
    const files = assembleFromSpec(makeFullPageSpec(), makeTestBrand());
    expect(files['app/robots.ts']).toBeTruthy();
    expect(files['app/api/signup/route.ts']).toBeTruthy();
    expect(files['app/blog/page.tsx']).toBeTruthy();
    expect(files['app/blog/[slug]/page.tsx']).toBeTruthy();
    expect(files['app/compare/page.tsx']).toBeTruthy();
    expect(files['app/faq/page.tsx']).toBeTruthy();
  });
});
