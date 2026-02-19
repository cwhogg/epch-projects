import { describe, it, expect } from 'vitest';
import { validateCopyQuality, type CopyQualityFlag } from '../copy-quality';

describe('validateCopyQuality', () => {
  it('returns empty array for clean text', () => {
    const result = validateCopyQuality('Build faster websites with our static site generator.');
    expect(result).toEqual([]);
  });

  it('detects filler openers', () => {
    const result = validateCopyQuality("Great question! Let me explain how this works.");
    expect(result.some((f: CopyQualityFlag) => f.category === 'filler-opener')).toBe(true);
  });

  it('detects vague intensifiers', () => {
    const result = validateCopyQuality('This is an incredibly powerful tool that is truly remarkable.');
    expect(result.some((f: CopyQualityFlag) => f.category === 'vague-intensifier')).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2); // "incredibly" and "truly"
  });

  it('detects empty business jargon', () => {
    const result = validateCopyQuality('Leverage our cutting-edge platform to revolutionize your workflow.');
    expect(result.some((f: CopyQualityFlag) => f.category === 'business-jargon')).toBe(true);
  });

  it('detects padded transitions', () => {
    const result = validateCopyQuality("It's worth noting that our tool handles edge cases well.");
    expect(result.some((f: CopyQualityFlag) => f.category === 'padded-transition')).toBe(true);
  });

  it('detects sycophantic praise', () => {
    const result = validateCopyQuality('Excellent choice! That approach will work well.');
    expect(result.some((f: CopyQualityFlag) => f.category === 'sycophantic-praise')).toBe(true);
  });

  it('detects generic closers', () => {
    const result = validateCopyQuality('Let me know if you have any questions about the implementation.');
    expect(result.some((f: CopyQualityFlag) => f.category === 'generic-closer')).toBe(true);
  });

  it('detects fake specificity', () => {
    const result = validateCopyQuality('Studies show that users prefer faster load times.');
    expect(result.some((f: CopyQualityFlag) => f.category === 'fake-specificity')).toBe(true);
  });

  it('detects em dashes', () => {
    const result = validateCopyQuality('Our tool — the best in its class — handles everything.');
    expect(result.some((f: CopyQualityFlag) => f.category === 'em-dash')).toBe(true);
  });

  it('does not flag double hyphens in code contexts', () => {
    // Double hyphens that are NOT em dashes (e.g., CLI flags) should not be flagged
    const result = validateCopyQuality('Run npm install to get started.');
    expect(result).toEqual([]);
  });

  it('returns matched text in each flag', () => {
    const result = validateCopyQuality("That's a great point about the design.");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('match');
    expect(result[0]).toHaveProperty('category');
  });

  it('handles empty string', () => {
    expect(validateCopyQuality('')).toEqual([]);
  });
});
