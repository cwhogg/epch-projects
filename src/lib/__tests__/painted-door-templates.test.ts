import { describe, it, expect } from 'vitest';
import { assembleAllFiles } from '../painted-door-templates';
import type { BrandIdentity, ContentContext } from '@/types';

function makeBrand(overrides?: Partial<BrandIdentity>): BrandIdentity {
  return {
    siteName: 'Test Site',
    tagline: 'A test tagline',
    targetDemographic: 'testers',
    voice: { tone: 'casual', personality: 'friendly', examples: ['hi'] },
    colors: {
      primary: '#000',
      primaryLight: '#333',
      background: '#111',
      backgroundElevated: '#222',
      textPrimary: '#fff',
      textSecondary: '#ccc',
      textMuted: '#999',
      accent: '#0ff',
      border: '#444',
    },
    typography: { headingFont: 'Inter', bodyFont: 'Inter', monoFont: 'Fira Code' },
    landingPage: {
      heroHeadline: 'Welcome',
      heroSubheadline: 'A great product',
      ctaText: 'Get Started',
      valueProps: [{ title: 'Fast', description: 'Very fast' }],
      faqs: [{ question: 'Why?', answer: 'Because.' }],
    },
    ...overrides,
  };
}

const ctx: ContentContext = {
  ideaName: 'Test',
  ideaDescription: 'A test idea',
  targetUser: 'developers',
  problemSolved: 'testing',
  summary: 'test summary',
  competitors: 'none',
  url: 'https://test.vercel.app',
};

describe('assembleAllFiles', () => {
  it('generates non-empty app/page.tsx when landingPage is present', () => {
    const files = assembleAllFiles(makeBrand(), ctx);
    expect(files['app/page.tsx']).toBeTruthy();
    expect(files['app/page.tsx']).toContain('export default function Home');
  });

  it('throws when landingPage is missing from brand', () => {
    const brand = makeBrand({ landingPage: undefined });
    expect(() => assembleAllFiles(brand, ctx)).toThrow('brand.landingPage is missing');
  });

  it('generates all expected files', () => {
    const files = assembleAllFiles(makeBrand(), ctx);
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(20);
    expect(files['package.json']).toBeTruthy();
    expect(files['app/layout.tsx']).toBeTruthy();
    expect(files['app/globals.css']).toBeTruthy();
  });
});
