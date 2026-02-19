import { describe, it, expect } from 'vitest';
import { DOC_DEPENDENCIES } from '@/lib/foundation-deps';
import type { FoundationDocType } from '@/types';

const ALL_TYPES: FoundationDocType[] = [
  'strategy',
  'positioning',
  'brand-voice',
  'design-principles',
  'seo-strategy',
  'social-media-strategy',
  'visual-identity',
];

describe('DOC_DEPENDENCIES', () => {
  it('covers every FoundationDocType', () => {
    for (const type of ALL_TYPES) {
      expect(DOC_DEPENDENCIES).toHaveProperty(type);
      expect(Array.isArray(DOC_DEPENDENCIES[type])).toBe(true);
    }
  });

  it('has no keys outside FoundationDocType', () => {
    expect(Object.keys(DOC_DEPENDENCIES).sort()).toEqual([...ALL_TYPES].sort());
  });

  it('only references valid FoundationDocType values as dependencies', () => {
    for (const [type, deps] of Object.entries(DOC_DEPENDENCIES)) {
      for (const dep of deps) {
        expect(ALL_TYPES).toContain(dep);
        expect(dep).not.toBe(type); // no self-references
      }
    }
  });

  it('strategy has no dependencies', () => {
    expect(DOC_DEPENDENCIES['strategy']).toEqual([]);
  });
});
