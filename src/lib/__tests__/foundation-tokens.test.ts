import { describe, it, expect } from 'vitest';
import { extractBrandFromDesignPrinciples } from '../foundation-tokens';

const VALID_TOKENS = JSON.stringify({
  siteName: 'TestBrand',
  tagline: 'Test all the things',
  colors: {
    primary: '#2563EB',
    primaryLight: '#3B82F6',
    background: '#FFFFFF',
    backgroundElevated: '#F9FAFB',
    text: '#111827',
    textSecondary: '#4B5563',
    textMuted: '#9CA3AF',
    accent: '#10B981',
    border: '#E5E7EB',
  },
  fonts: {
    heading: 'Inter',
    body: 'Inter',
    mono: 'JetBrains Mono',
  },
  theme: 'light',
});

function makeDoc(tokensJson: string): string {
  return `# Design Principles\n\nSome prose here.\n\n\`\`\`json:design-tokens\n${tokensJson}\n\`\`\`\n\nMore prose.`;
}

describe('extractBrandFromDesignPrinciples', () => {
  it('extracts valid tokens into BrandIdentity', () => {
    const result = extractBrandFromDesignPrinciples(makeDoc(VALID_TOKENS), 'https://test.vercel.app');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.brand.siteName).toBe('TestBrand');
    expect(result.brand.tagline).toBe('Test all the things');
    expect(result.brand.siteUrl).toBe('https://test.vercel.app');
    expect(result.brand.colors.primary).toBe('#2563EB');
    expect(result.brand.fonts.heading).toBe('Inter');
    expect(result.brand.theme).toBe('light');
  });

  it('returns error when json:design-tokens block is missing', () => {
    const result = extractBrandFromDesignPrinciples('# Design Principles\n\nNo tokens here.', '');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('json:design-tokens');
  });

  it('returns error for malformed JSON', () => {
    const result = extractBrandFromDesignPrinciples(makeDoc('{ invalid json }'), '');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('parse');
  });

  it('returns error when color fields are missing', () => {
    const partial = JSON.stringify({
      siteName: 'Test', tagline: 'T',
      colors: { primary: '#000' }, // missing 8 fields
      fonts: { heading: 'Inter', body: 'Inter', mono: 'Mono' },
      theme: 'light',
    });
    const result = extractBrandFromDesignPrinciples(makeDoc(partial), '');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('missing');
  });

  it('returns error for invalid hex values', () => {
    const bad = JSON.parse(VALID_TOKENS);
    bad.colors.primary = 'not-a-hex';
    const result = extractBrandFromDesignPrinciples(makeDoc(JSON.stringify(bad)), '');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('primary');
  });

  it('returns error when WCAG contrast fails', () => {
    const lowContrast = JSON.parse(VALID_TOKENS);
    lowContrast.colors.text = '#CCCCCC';     // light gray on white → low contrast
    lowContrast.colors.background = '#FFFFFF';
    const result = extractBrandFromDesignPrinciples(makeDoc(JSON.stringify(lowContrast)), '');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('contrast');
  });

  it('returns error for non-string font values', () => {
    const bad = JSON.parse(VALID_TOKENS);
    bad.fonts.heading = 123;
    const result = extractBrandFromDesignPrinciples(makeDoc(JSON.stringify(bad)), '');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('font');
  });

  it('returns error for invalid theme value', () => {
    const bad = JSON.parse(VALID_TOKENS);
    bad.theme = 'neon';
    const result = extractBrandFromDesignPrinciples(makeDoc(JSON.stringify(bad)), '');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('theme');
  });
});
