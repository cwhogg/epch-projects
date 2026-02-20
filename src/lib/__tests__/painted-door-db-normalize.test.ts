import { describe, it, expect } from 'vitest';
import { normalizeBrandIdentity } from '../painted-door-db';

describe('normalizeBrandIdentity', () => {
  it('maps old textPrimary to text', () => {
    const old = {
      siteName: 'Test', tagline: 'T', siteUrl: '',
      colors: {
        primary: '#000', primaryLight: '#111',
        background: '#FFF', backgroundElevated: '#EEE',
        textPrimary: '#333', textSecondary: '#666', textMuted: '#999',
        accent: '#0F0', border: '#DDD',
      },
      fonts: { heading: 'Inter', body: 'Inter', mono: 'Mono' },
      theme: 'light' as const,
    };
    const result = normalizeBrandIdentity(old as any);
    expect(result.colors.text).toBe('#333');
    expect((result.colors as any).textPrimary).toBeUndefined();
  });

  it('maps old typography.headingFont to fonts.heading', () => {
    const old = {
      siteName: 'Test', tagline: 'T', siteUrl: '',
      colors: {
        primary: '#000', primaryLight: '#111',
        background: '#FFF', backgroundElevated: '#EEE',
        text: '#333', textSecondary: '#666', textMuted: '#999',
        accent: '#0F0', border: '#DDD',
      },
      typography: { headingFont: 'Playfair', bodyFont: 'Open Sans', monoFont: 'Fira Code' },
      theme: 'light' as const,
    };
    const result = normalizeBrandIdentity(old as any);
    expect(result.fonts.heading).toBe('Playfair');
    expect(result.fonts.body).toBe('Open Sans');
    expect(result.fonts.mono).toBe('Fira Code');
  });

  it('passes through new-format brand unchanged', () => {
    const brand = {
      siteName: 'Test', tagline: 'T', siteUrl: 'https://test.vercel.app',
      colors: {
        primary: '#000', primaryLight: '#111',
        background: '#FFF', backgroundElevated: '#EEE',
        text: '#333', textSecondary: '#666', textMuted: '#999',
        accent: '#0F0', border: '#DDD',
      },
      fonts: { heading: 'Inter', body: 'Inter', mono: 'Mono' },
      theme: 'light' as const,
    };
    const result = normalizeBrandIdentity(brand as any);
    expect(result.colors.text).toBe('#333');
    expect(result.fonts.heading).toBe('Inter');
  });

  it('strips removed fields (voice, landingPage, seoDescription, targetDemographic)', () => {
    const old = {
      siteName: 'Test', tagline: 'T', siteUrl: '',
      voice: { tone: 'friendly', personality: 'warm', examples: [] },
      seoDescription: 'desc',
      targetDemographic: 'founders',
      landingPage: { heroHeadline: 'H', heroSubheadline: 'S', ctaText: 'C', valueProps: [], faqs: [] },
      colors: {
        primary: '#000', primaryLight: '#111',
        background: '#FFF', backgroundElevated: '#EEE',
        text: '#333', textSecondary: '#666', textMuted: '#999',
        accent: '#0F0', border: '#DDD',
      },
      fonts: { heading: 'Inter', body: 'Inter', mono: 'Mono' },
      theme: 'light' as const,
    };
    const result = normalizeBrandIdentity(old as any);
    expect((result as any).voice).toBeUndefined();
    expect((result as any).landingPage).toBeUndefined();
    expect((result as any).seoDescription).toBeUndefined();
    expect((result as any).targetDemographic).toBeUndefined();
  });
});
