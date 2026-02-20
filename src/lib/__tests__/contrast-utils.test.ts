import { describe, it, expect } from 'vitest';
import { hexToLuminance, contrastRatio } from '../contrast-utils';

describe('hexToLuminance', () => {
  it('returns 0 for black (#000000)', () => {
    expect(hexToLuminance('#000000')).toBeCloseTo(0);
  });

  it('returns 1 for white (#FFFFFF)', () => {
    expect(hexToLuminance('#FFFFFF')).toBeCloseTo(1);
  });

  it('handles lowercase hex', () => {
    expect(hexToLuminance('#ffffff')).toBeCloseTo(1);
  });

  it('returns 0 for invalid hex', () => {
    expect(hexToLuminance('invalid')).toBe(0);
  });
});

describe('contrastRatio', () => {
  it('returns 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });

  it('returns 1:1 for white on white', () => {
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 0);
  });

  it('is symmetric — order of args does not matter', () => {
    const r1 = contrastRatio('#000000', '#FFFFFF');
    const r2 = contrastRatio('#FFFFFF', '#000000');
    expect(r1).toBeCloseTo(r2, 5);
  });

  it('calculates a known mid-range ratio', () => {
    // #767676 on white ≈ 4.54:1 (WCAG AA threshold)
    const ratio = contrastRatio('#767676', '#FFFFFF');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeLessThan(5.0);
  });
});
