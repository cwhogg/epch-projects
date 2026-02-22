# Website Builder Rebuild Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the Painted Door website builder backend so advisor-approved copy flows through a typed PageSpec accumulator into a deterministic renderer, replacing the disconnected LLM-at-build-time pipeline.

**Source Design Doc:** `docs/plans/2026-02-19-website-builder-rebuild-design.md`

**Architecture:** Copy decisions happen upstream (Foundation docs + advisor stages). A `PageSpec` accumulates copy via `lock_section_copy` tool calls. At build time, `assembleFromSpec(pageSpec, brand)` renders all 8 Landing Page Assembly framework sections deterministically with zero LLM calls. `BrandIdentity` is extracted from the design-principles Foundation doc's `json:design-tokens` block instead of generated via a separate LLM call.

**Tech Stack:** Next.js 16, React 19, TypeScript, Upstash Redis, Anthropic SDK, Vitest

---

## ✅ Task 1: Add PageSpec types and per-section copy interfaces

**Files:**
- Create: `src/lib/painted-door-page-spec.ts`
- Test: `src/lib/__tests__/painted-door-page-spec.test.ts`

**Step 1: Write the failing test**

Create `src/lib/__tests__/painted-door-page-spec.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/painted-door-page-spec.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/lib/painted-door-page-spec.ts`:

```typescript
// ---- Per-section copy types ----

export interface HeroCopy {
  headline: string;    // 3-8 words
  subheadline: string; // max 30 words
  ctaText: string;     // 2-5 words
}

export interface ProblemCopy {
  headline: string;
  body: string;        // 2-3 sentences
}

export interface FeaturesCopy {
  sectionHeadline: string;
  features: { title: string; description: string }[]; // 3-6 items
}

export interface HowItWorksCopy {
  sectionHeadline: string;
  steps: { label: string; description: string }[];    // 3-5 steps
}

export interface AudienceCopy {
  sectionHeadline: string;
  body: string;
}

export interface ObjectionsCopy {
  sectionHeadline: string;
  objections: { question: string; answer: string }[];
}

export interface FinalCtaCopy {
  headline: string;
  body: string;
  ctaText: string;
}

export interface FaqCopy {
  sectionHeadline: string;
  faqs: { question: string; answer: string }[];
}

// ---- Discriminated union ----

export type PageSection =
  | { type: 'hero'; copy: HeroCopy }
  | { type: 'problem'; copy: ProblemCopy }
  | { type: 'features'; copy: FeaturesCopy }
  | { type: 'how-it-works'; copy: HowItWorksCopy }
  | { type: 'audience'; copy: AudienceCopy }
  | { type: 'objections'; copy: ObjectionsCopy }
  | { type: 'final-cta'; copy: FinalCtaCopy }
  | { type: 'faq'; copy: FaqCopy };

export type SectionType = PageSection['type'];

export interface PageSpec {
  sections: PageSection[];
  metaTitle: string;
  metaDescription: string;
  ogDescription: string;
}

// ---- All valid section types ----

const ALL_SECTION_TYPES: SectionType[] = [
  'hero', 'problem', 'features', 'how-it-works',
  'audience', 'objections', 'final-cta', 'faq',
];

export function getAllSectionTypes(): SectionType[] {
  return [...ALL_SECTION_TYPES];
}

export function getMissingSectionTypes(sections: PageSection[]): SectionType[] {
  const present = new Set(sections.map((s) => s.type));
  return ALL_SECTION_TYPES.filter((t) => !present.has(t));
}

// ---- Validation ----

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function requireString(obj: Record<string, unknown>, field: string, errors: string[]): boolean {
  if (typeof obj[field] !== 'string' || !obj[field]) {
    errors.push(`${field} is required and must be a non-empty string`);
    return false;
  }
  return true;
}

function requireArray(obj: Record<string, unknown>, field: string, min: number, max: number, errors: string[]): boolean {
  const arr = obj[field];
  if (!Array.isArray(arr)) {
    errors.push(`${field} is required and must be an array`);
    return false;
  }
  if (arr.length < min || arr.length > max) {
    errors.push(`${field} must have ${min}-${max} items, got ${arr.length}`);
    return false;
  }
  return true;
}

export function validateSectionCopy(type: SectionType, copy: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  switch (type) {
    case 'hero': {
      requireString(copy, 'headline', errors);
      requireString(copy, 'subheadline', errors);
      requireString(copy, 'ctaText', errors);
      if (typeof copy.headline === 'string') {
        const wc = wordCount(copy.headline);
        if (wc < 3 || wc > 8) errors.push(`headline must be 3-8 words, got ${wc}`);
      }
      if (typeof copy.subheadline === 'string') {
        const wc = wordCount(copy.subheadline);
        if (wc > 30) errors.push(`subheadline must be max 30 words, got ${wc}`);
      }
      if (typeof copy.ctaText === 'string') {
        const wc = wordCount(copy.ctaText);
        if (wc < 2 || wc > 5) errors.push(`ctaText must be 2-5 words, got ${wc}`);
      }
      break;
    }
    case 'problem':
      requireString(copy, 'headline', errors);
      requireString(copy, 'body', errors);
      break;
    case 'features':
      requireString(copy, 'sectionHeadline', errors);
      if (requireArray(copy, 'features', 3, 6, errors)) {
        for (const f of copy.features as { title?: string; description?: string }[]) {
          if (!f.title || !f.description) errors.push('Each feature must have title and description');
        }
      }
      break;
    case 'how-it-works':
      requireString(copy, 'sectionHeadline', errors);
      if (requireArray(copy, 'steps', 3, 5, errors)) {
        for (const s of copy.steps as { label?: string; description?: string }[]) {
          if (!s.label || !s.description) errors.push('Each step must have label and description');
        }
      }
      break;
    case 'audience':
      requireString(copy, 'sectionHeadline', errors);
      requireString(copy, 'body', errors);
      break;
    case 'objections':
      requireString(copy, 'sectionHeadline', errors);
      if (requireArray(copy, 'objections', 1, 10, errors)) {
        for (const o of copy.objections as { question?: string; answer?: string }[]) {
          if (!o.question || !o.answer) errors.push('Each objection must have question and answer');
        }
      }
      break;
    case 'final-cta':
      requireString(copy, 'headline', errors);
      requireString(copy, 'body', errors);
      requireString(copy, 'ctaText', errors);
      break;
    case 'faq':
      requireString(copy, 'sectionHeadline', errors);
      if (requireArray(copy, 'faqs', 1, 20, errors)) {
        for (const f of copy.faqs as { question?: string; answer?: string }[]) {
          if (!f.question || !f.answer) errors.push('Each FAQ must have question and answer');
        }
      }
      break;
    default:
      errors.push(`Unknown section type: ${type}`);
  }

  return { valid: errors.length === 0, errors };
}

export function validatePageMeta(meta: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  requireString(meta, 'metaTitle', errors);
  requireString(meta, 'metaDescription', errors);
  requireString(meta, 'ogDescription', errors);
  return { valid: errors.length === 0, errors };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/painted-door-page-spec.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/painted-door-page-spec.ts src/lib/__tests__/painted-door-page-spec.test.ts
git commit -m "feat: add PageSpec types and validation for section copy accumulator"
```

---

## ✅ Task 2: Extract contrast utilities to shared module

**Files:**
- Create: `src/lib/contrast-utils.ts`
- Create: `src/lib/__tests__/contrast-utils.test.ts`
- Modify: `src/lib/agent-tools/website.ts:476-491` (remove inline functions)

**Step 1: Write the failing test**

Create `src/lib/__tests__/contrast-utils.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/contrast-utils.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/lib/contrast-utils.ts`:

```typescript
/**
 * Convert a hex color to its relative luminance (WCAG 2.0 formula).
 * Returns 0 for invalid/unparseable hex values.
 */
export function hexToLuminance(hex: string): number {
  const rgb = hex.replace('#', '').match(/.{2}/g);
  if (!rgb || rgb.length < 3) return 0;
  const [r, g, b] = rgb.map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate WCAG contrast ratio between two hex colors.
 * Result range: 1 (identical) to 21 (black/white).
 * WCAG AA requires >= 4.5:1 for normal text.
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = hexToLuminance(hex1);
  const l2 = hexToLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/contrast-utils.test.ts`
Expected: PASS

**Step 5: Update website.ts to import from contrast-utils**

In `src/lib/agent-tools/website.ts`, replace the inline `hexToLuminance` and `contrastRatio` functions (lines 476-491) with an import from `../contrast-utils`. Add `import { hexToLuminance, contrastRatio } from '../contrast-utils';` at the top of the file (after existing imports). Delete the two inline function definitions inside the `evaluate_brand` execute function.

**Step 6: Run existing tests to verify no regression**

Run: `npm test -- src/lib/agent-tools/__tests__/website-design-brand.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/lib/contrast-utils.ts src/lib/__tests__/contrast-utils.test.ts src/lib/agent-tools/website.ts
git commit -m "refactor: extract contrast utils to shared module"
```

---

## ✅ Task 3: Add foundation token extraction

**Files:**
- Create: `src/lib/foundation-tokens.ts`
- Create: `src/lib/__tests__/foundation-tokens.test.ts`

**Step 1: Write the failing test**

Create `src/lib/__tests__/foundation-tokens.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/foundation-tokens.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/lib/foundation-tokens.ts`:

```typescript
import type { BrandIdentity } from '@/types';
import { contrastRatio } from './contrast-utils';

// Re-export for convenience — the canonical BrandIdentity lives in @/types
export type { BrandIdentity } from '@/types';

type ExtractionResult =
  | { ok: true; brand: BrandIdentity }
  | { ok: false; error: string };

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;
const REQUIRED_COLOR_FIELDS = [
  'primary', 'primaryLight', 'background', 'backgroundElevated',
  'text', 'textSecondary', 'textMuted', 'accent', 'border',
] as const;
const REQUIRED_FONT_FIELDS = ['heading', 'body', 'mono'] as const;

export function extractBrandFromDesignPrinciples(
  docContent: string,
  siteUrl: string,
): ExtractionResult {
  // 1. Find json:design-tokens block
  const blockRegex = /```json:design-tokens\s*\n([\s\S]*?)\n```/;
  const match = docContent.match(blockRegex);
  if (!match) {
    return { ok: false, error: 'No ```json:design-tokens``` block found in design-principles document.' };
  }

  // 2. Parse JSON
  let tokens: Record<string, unknown>;
  try {
    tokens = JSON.parse(match[1]);
  } catch (e) {
    return { ok: false, error: `Failed to parse json:design-tokens block: ${e instanceof Error ? e.message : String(e)}` };
  }

  // 3. Validate required top-level strings
  if (typeof tokens.siteName !== 'string' || !tokens.siteName) {
    return { ok: false, error: 'siteName is missing or not a string' };
  }
  if (typeof tokens.tagline !== 'string' || !tokens.tagline) {
    return { ok: false, error: 'tagline is missing or not a string' };
  }

  // 4. Validate colors
  const colors = tokens.colors as Record<string, unknown> | undefined;
  if (!colors || typeof colors !== 'object') {
    return { ok: false, error: 'colors object is missing' };
  }
  const missingColors = REQUIRED_COLOR_FIELDS.filter((f) => typeof colors[f] !== 'string');
  if (missingColors.length > 0) {
    return { ok: false, error: `colors missing fields: ${missingColors.join(', ')}` };
  }
  const invalidHex = REQUIRED_COLOR_FIELDS.filter((f) => !HEX_REGEX.test(colors[f] as string));
  if (invalidHex.length > 0) {
    return { ok: false, error: `Invalid hex values for: ${invalidHex.join(', ')}` };
  }

  // 5. Validate fonts
  const fonts = tokens.fonts as Record<string, unknown> | undefined;
  if (!fonts || typeof fonts !== 'object') {
    return { ok: false, error: 'fonts object is missing' };
  }
  const invalidFonts = REQUIRED_FONT_FIELDS.filter((f) => typeof fonts[f] !== 'string' || !fonts[f]);
  if (invalidFonts.length > 0) {
    return { ok: false, error: `Invalid or missing font values for: ${invalidFonts.join(', ')}` };
  }

  // 6. Validate theme
  if (tokens.theme !== 'light' && tokens.theme !== 'dark') {
    return { ok: false, error: `theme must be 'light' or 'dark', got '${tokens.theme}'` };
  }

  // 7. WCAG AA contrast check (text on background >= 4.5:1)
  const textColor = colors.text as string;
  const bgColor = colors.background as string;
  const ratio = contrastRatio(textColor, bgColor);
  if (ratio < 4.5) {
    return { ok: false, error: `WCAG AA contrast check failed: text (${textColor}) on background (${bgColor}) has ratio ${ratio.toFixed(1)}:1, minimum is 4.5:1` };
  }

  return {
    ok: true,
    brand: {
      siteName: tokens.siteName as string,
      tagline: tokens.tagline as string,
      siteUrl,
      colors: {
        primary: colors.primary as string,
        primaryLight: colors.primaryLight as string,
        background: colors.background as string,
        backgroundElevated: colors.backgroundElevated as string,
        text: colors.text as string,
        textSecondary: colors.textSecondary as string,
        textMuted: colors.textMuted as string,
        accent: colors.accent as string,
        border: colors.border as string,
      },
      fonts: {
        heading: fonts.heading as string,
        body: fonts.body as string,
        mono: fonts.mono as string,
      },
      theme: tokens.theme as 'light' | 'dark',
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/foundation-tokens.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/foundation-tokens.ts src/lib/__tests__/foundation-tokens.test.ts
git commit -m "feat: add foundation token extraction from design-principles doc"
```

---

## ✅ Task 4: Update BrandIdentity type and add normalizeBrandIdentity

**Files:**
- Modify: `src/types/index.ts:168-193` (slim BrandIdentity, add `siteUrl`, rename fields)
- Modify: `src/lib/painted-door-db.ts` (add normalizeBrandIdentity)
- Modify: `src/lib/__tests__/painted-door-chat-db.test.ts` (if affected)
- Create test for normalization

**Step 1: Write the failing test**

Add a test file `src/lib/__tests__/painted-door-db-normalize.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/painted-door-db-normalize.test.ts`
Expected: FAIL — normalizeBrandIdentity not exported

**Step 3: Update BrandIdentity in types/index.ts**

In `src/types/index.ts`, replace the `BrandIdentity` interface (lines 168-193) with the slimmed version. The new type uses `colors.text` instead of `colors.textPrimary`, `fonts` instead of `typography`, removes `voice`, `landingPage`, `seoDescription`, `targetDemographic`, and adds `siteUrl`.

```typescript
export interface BrandIdentity {
  siteName: string;
  tagline: string;
  siteUrl: string;
  colors: {
    primary: string;
    primaryLight: string;
    background: string;
    backgroundElevated: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    border: string;
  };
  fonts: {
    heading: string;
    body: string;
    mono: string;
  };
  theme: 'light' | 'dark';
}
```

Also in `src/types/index.ts`, add `pageSpec` to `BuildSession.artifacts`:

```typescript
  artifacts: {
    ingredients?: string;
    heroContent?: string;
    substageContent?: { ... };
    finalReviewResult?: string;
    siteUrl?: string;
    repoUrl?: string;
    pageSpec?: import('../lib/painted-door-page-spec').PageSpec;
  };
```

**Step 4: Implement normalizeBrandIdentity in painted-door-db.ts**

Add to `src/lib/painted-door-db.ts`:

```typescript
import type { BrandIdentity } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeBrandIdentity(raw: any): BrandIdentity {
  const colors = raw.colors || {};
  const fonts = raw.fonts || raw.typography || {};

  return {
    siteName: raw.siteName || '',
    tagline: raw.tagline || '',
    siteUrl: raw.siteUrl || '',
    colors: {
      primary: colors.primary || '',
      primaryLight: colors.primaryLight || '',
      background: colors.background || '',
      backgroundElevated: colors.backgroundElevated || '',
      text: colors.text || colors.textPrimary || '',
      textSecondary: colors.textSecondary || '',
      textMuted: colors.textMuted || '',
      accent: colors.accent || '',
      border: colors.border || '',
    },
    fonts: {
      heading: fonts.heading || fonts.headingFont || '',
      body: fonts.body || fonts.bodyFont || '',
      mono: fonts.mono || fonts.monoFont || '',
    },
    theme: raw.theme === 'dark' ? 'dark' : 'light',
  };
}
```

Apply normalization in **both** `getPaintedDoorSite()` and `getAllPaintedDoorSites()`:

```typescript
export async function getPaintedDoorSite(ideaId: string): Promise<PaintedDoorSite | null> {
  const redis = getRedis();
  const data = await redis.hget('painted_door_sites', ideaId);
  if (!data) return null;
  const site = parseValue<PaintedDoorSite>(data);
  if (site?.brand) site.brand = normalizeBrandIdentity(site.brand);
  return site;
}

export async function getAllPaintedDoorSites(): Promise<PaintedDoorSite[]> {
  const redis = getRedis();
  const data = await redis.hgetall('painted_door_sites');
  if (!data) return [];
  return Object.values(data).map((v) => {
    const site = parseValue<PaintedDoorSite>(v);
    if (site?.brand) site.brand = normalizeBrandIdentity(site.brand);
    return site;
  }).filter((s): s is PaintedDoorSite => s != null);
}
```

**Step 5: Run the normalization test**

Run: `npm test -- src/lib/__tests__/painted-door-db-normalize.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/types/index.ts src/lib/painted-door-db.ts src/lib/__tests__/painted-door-db-normalize.test.ts
git commit -m "feat: slim BrandIdentity, rename fields, add normalizeBrandIdentity migration"
```

---

## ✅ Task 5: Fix all TypeScript compilation errors from BrandIdentity changes

**Files:**
- Modify: `src/lib/painted-door-templates.ts` (update all `typography.*` → `fonts.*`, `textPrimary` → `text`)
- Modify: `src/lib/agent-tools/website.ts` (update field references)
- Modify: `src/lib/painted-door-prompts.ts` (update field references)
- Modify: any other files referencing old field names

This is a mechanical find-and-replace task. Search the codebase for:
- `brand.typography.headingFont` → `brand.fonts.heading`
- `brand.typography.bodyFont` → `brand.fonts.body`
- `brand.typography.monoFont` → `brand.fonts.mono`
- `brand.colors.textPrimary` → `brand.colors.text`
- `typography:` in type annotations → `fonts:`
- `seoDescription` references on BrandIdentity (remove or redirect)
- `targetDemographic` references (remove)
- `voice` references on BrandIdentity (remove)
- `landingPage` references on BrandIdentity (remove — but these will be replaced in later tasks)

**Step 1: Run the build to find all errors**

Run: `npm run build 2>&1 | head -100`
Expected: Multiple type errors related to renamed fields

**Step 2: Fix each error systematically**

Fix files one at a time. The **complete list** of files requiring updates:

Source files:
- `src/lib/painted-door-templates.ts`: `googleFontsUrl()` uses `brand.typography.*`, `renderGlobalsCss()` uses `brand.typography.*` and `brand.colors.textPrimary`, `renderLayout()` uses `brand.seoDescription`, `navFragment()` uses `brand.typography.*`
- `src/lib/painted-door-prompts.ts`: references to `brand.voice`, `brand.landingPage`, `brand.seoDescription`, `brand.targetDemographic`, `brand.typography.*`, `brand.colors.textPrimary`. This file will be deleted in Task 12, but must compile now — temporarily adapt to the new type shape.
- `src/lib/painted-door-agent.ts`: references old BrandIdentity shape. Will be deleted in Task 12, but must compile now.
- `src/lib/agent-tools/website.ts` evaluate_brand: references `brand.colors.textPrimary`, `brand.landingPage`, `brand.seoDescription`

Test files (mock data with old field names):
- `src/lib/__tests__/painted-door-templates.test.ts`: The `makeBrand()` helper uses `textPrimary`, `typography`, `targetDemographic`, `voice`, and `landingPage` — all removed/renamed fields. Update mock data to match new type.
- `src/lib/__tests__/painted-door-agent.test.ts`: Mock BrandIdentity data uses old field names. Update to match new type.
- `src/lib/__tests__/painted-door-prompts.test.ts`: Mock data uses old field names. Will be deleted in Task 12, but must compile now.
- `src/lib/agent-tools/__tests__/website-design-brand.test.ts`: Mock BrandIdentity data uses old field names.

For `renderLayout`, the `seoDescription` now comes from PageSpec, but since that refactor happens in Task 7, temporarily use an empty string or add a parameter. **Decision: Accept that `renderLayout` will be refactored in Task 7 — for now, just update the field names that exist on the new type.**

**Step 3: Run build to verify all errors are fixed**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add -u
git commit -m "fix: update all BrandIdentity field references for renamed/removed fields"
```

---

## ✅ Task 6: Build section renderer library

**Files:**
- Create: `src/lib/painted-door-sections.ts`
- Create: `src/lib/__tests__/painted-door-sections.test.ts`

**Step 1: Write the failing test**

Create `src/lib/__tests__/painted-door-sections.test.ts` with tests for each renderer. Test that:
- Each render function returns a string containing the copy verbatim
- `renderHeroSection` includes email form referencing shared `formStateVarNames`
- `renderFeaturesSection` adapts grid cols based on array length
- `renderFinalCtaSection` references shared form state
- `wrapInPage` includes `'use client'`, `useState`, JSON-LD blocks, nav/footer
- `wrapInPage` with FAQ section includes FAQPage JSON-LD; without FAQ omits it

Key test patterns:
```typescript
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
import type { PageSpec } from '../painted-door-page-spec';

const testBrand: BrandIdentity = {
  siteName: 'TestBrand',
  tagline: 'Test tagline',
  siteUrl: 'https://test.vercel.app',
  colors: { primary: '#000', primaryLight: '#111', background: '#FFF', backgroundElevated: '#F0F0F0', text: '#222', textSecondary: '#555', textMuted: '#888', accent: '#0F0', border: '#DDD' },
  fonts: { heading: 'Inter', body: 'Open Sans', mono: 'Fira Code' },
  theme: 'light',
};

const testCtx: RenderContext = {
  brand: testBrand,
  formStateVarNames: { email: 'email', status: 'status', handleSubmit: 'handleSubmit' },
};

describe('renderHeroSection', () => {
  it('contains the headline verbatim', () => {
    const html = renderHeroSection({ headline: 'Ship faster today', subheadline: 'Build pages quickly.', ctaText: 'Get started' }, testCtx);
    expect(html).toContain('Ship faster today');
    expect(html).toContain('Build pages quickly.');
    expect(html).toContain('Get started');
  });

  it('references shared form state variables', () => {
    const html = renderHeroSection({ headline: 'H', subheadline: 'S', ctaText: 'C' }, testCtx);
    expect(html).toContain('email');
    expect(html).toContain('handleSubmit');
  });
});

// ... similar tests for each section renderer ...

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
    spec.sections = spec.sections.filter(s => s.type !== 'faq');
    const html = renderLandingPage(spec, testBrand);
    expect(html).not.toContain('FAQPage');
  });

  it('renders sections in order', () => {
    const spec = buildFullPageSpec();
    const html = renderLandingPage(spec, testBrand);
    const heroIdx = html.indexOf('Ship faster');
    const problemIdx = html.indexOf('The old way');
    expect(heroIdx).toBeLessThan(problemIdx);
  });
});
```

Implement `buildFullPageSpec()` test helper that creates a complete `PageSpec` with all 8 sections.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/painted-door-sections.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/lib/painted-door-sections.ts`. Model each render function after the current `renderLandingPage` in `painted-door-templates.ts` (lines 422-583) but decomposed into individual sections. Use the `esc()` and `escAttr()` helpers from `painted-door-templates.ts` (or import them — they should be exported).

**Step 3a: Export `esc` and `escAttr` from `painted-door-templates.ts`**

Before writing `painted-door-sections.ts`, add the `export` keyword to `esc()` (line 8) and `escAttr()` (line 13) in `src/lib/painted-door-templates.ts`. These are currently private functions but the section renderers need them. Also export `navFragment()` and `footerFragment()` if the section renderers reference them (or inline the nav/footer logic in `wrapInPage`).

**Step 3b: Write `painted-door-sections.ts`**

Key implementation details:
- `RenderContext` type with `brand` and `formStateVarNames`
- Each section renderer returns a JSX string fragment (no component wrapper)
- `renderHeroSection` and `renderFinalCtaSection` reference `formStateVarNames` for shared email state
- `wrapInPage` handles `'use client'`, imports, state declarations, nav, footer, JSON-LD, `<main>` wrapper
- `renderLandingPage(pageSpec, brand)` is the public API that creates the context, maps sections through renderers, and wraps in page
- Import `esc`, `escAttr`, `navFragment`, `footerFragment` from `./painted-door-templates`

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/painted-door-sections.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/painted-door-sections.ts src/lib/__tests__/painted-door-sections.test.ts src/lib/painted-door-templates.ts
git commit -m "feat: add section renderer library with 8 renderers + wrapInPage"
```

---

## ✅ Task 7: Replace assembleAllFiles with assembleFromSpec

**Files:**
- Modify: `src/lib/painted-door-templates.ts:893-946` (replace `assembleAllFiles` with `assembleFromSpec`)
- Modify: `src/lib/painted-door-templates.ts:364-404` (`renderLayout` signature changes)
- Modify: `src/lib/painted-door-templates.ts:406-420` (`renderSitemap` uses `brand.siteUrl`)
- Modify: `src/lib/__tests__/painted-door-templates.test.ts`

**Step 1: Update painted-door-templates.ts**

Replace `assembleAllFiles(brand, ctx, approvedCopy?)` with `assembleFromSpec(pageSpec, brand)`:

- Remove the `ApprovedCopy` interface and export
- Remove the `ContentContext` import (no longer needed for landing page generation)
- Change `renderLayout(brand)` to `renderLayout(brand, pageSpec)` — use `pageSpec.metaDescription` for seoDescription
- Change `renderSitemap(brand, ctx)` to `renderSitemap(brand)` — use `brand.siteUrl` instead of `ctx.url`
- Change `renderLandingPage(brand, ctx)` — replace with import from `painted-door-sections.ts` (`renderLandingPage(pageSpec, brand)`)
- `assembleFromSpec` validates all 8 section types are present using `getMissingSectionTypes()` before rendering

```typescript
import { renderLandingPage } from './painted-door-sections';
import { getMissingSectionTypes } from './painted-door-page-spec';
import type { PageSpec } from './painted-door-page-spec';

export function assembleFromSpec(
  pageSpec: PageSpec,
  brand: BrandIdentity,
): Record<string, string> {
  const missing = getMissingSectionTypes(pageSpec.sections);
  if (missing.length > 0) {
    throw new Error(`Cannot assemble: missing section types: ${missing.join(', ')}`);
  }

  return {
    'package.json': PACKAGE_JSON,
    'tsconfig.json': TSCONFIG_JSON,
    'next.config.ts': NEXT_CONFIG_TS,
    'postcss.config.mjs': POSTCSS_CONFIG_MJS,
    '.gitignore': GITIGNORE,
    'lib/content.ts': LIB_CONTENT_TS,
    'components/content/MarkdownRenderer.tsx': MARKDOWN_RENDERER_TSX,
    'components/content/JsonLd.tsx': JSONLD_TSX,
    'app/globals.css': renderGlobalsCss(brand),
    'app/layout.tsx': renderLayout(brand, pageSpec),
    'app/page.tsx': renderLandingPage(pageSpec, brand),
    'app/robots.ts': ROBOTS_TS,
    'app/sitemap.ts': renderSitemap(brand),
    'app/api/signup/route.ts': SIGNUP_ROUTE_TS,
    'app/blog/page.tsx': renderBlogListing(brand),
    'app/blog/[slug]/page.tsx': renderBlogDetail(brand),
    'app/compare/page.tsx': renderCompareListing(brand),
    'app/compare/[slug]/page.tsx': renderCompareDetail(brand),
    'app/faq/page.tsx': renderFaqListing(brand),
    'app/faq/[slug]/page.tsx': renderFaqDetail(brand),
    'content/blog/.gitkeep': '',
    'content/comparison/.gitkeep': '',
    'content/faq/.gitkeep': '',
    'public/google8016c4ca2d4b4091.html': 'google-site-verification: google8016c4ca2d4b4091.html',
  };
}
```

**Step 2: Update tests**

Update `src/lib/__tests__/painted-door-templates.test.ts` to call `assembleFromSpec(pageSpec, brand)` instead of `assembleAllFiles(brand, ctx, approvedCopy)`. Create a test helper that builds a full `PageSpec`.

**Step 3: Run tests**

Run: `npm test -- src/lib/__tests__/painted-door-templates.test.ts`
Expected: PASS

**Step 4: Run build**

Run: `npm run build`
Expected: May have errors in files that still call `assembleAllFiles` — those will be fixed in subsequent tasks

**Step 5: Commit**

```bash
git add src/lib/painted-door-templates.ts src/lib/__tests__/painted-door-templates.test.ts
git commit -m "feat: replace assembleAllFiles with assembleFromSpec using PageSpec"
```

---

## ✅ Task 8: Add lock_section_copy and lock_page_meta tools, remove design_brand

**Files:**
- Modify: `src/lib/agent-tools/website.ts` (delete design_brand, add lock_section_copy, lock_page_meta, update assemble_site_files, update evaluate_brand)

**Step 1: Update tool definitions**

In `src/lib/agent-tools/website.ts`:

1. **Remove imports**: `buildBrandIdentityPrompt` from `painted-door-prompts`, `ApprovedCopy` from `painted-door-templates`, `assembleAllFiles` from `painted-door-templates`
2. **Add imports**: `assembleFromSpec` from `painted-door-templates`, `validateSectionCopy`, `validatePageMeta`, `getMissingSectionTypes` from `painted-door-page-spec`, `extractBrandFromDesignPrinciples` from `foundation-tokens`, `getBuildSession`, `saveBuildSession` from `painted-door-db`
3. **Delete** the `design_brand` tool definition (lines 342-386)
4. **Add** `lock_section_copy` tool:
   - Input: `{ type: string, copy: object, overwrite?: boolean }`
   - Validates copy via `validateSectionCopy(type, copy)`
   - Reads `BuildSession` from Redis, checks if section type already exists
   - If exists and `overwrite !== true`, returns error "section already locked"
   - If exists and `overwrite === true`, replaces it
   - Saves updated `BuildSession.artifacts.pageSpec` to Redis
   - Returns confirmation with locked copy echoed back
5. **Add** `lock_page_meta` tool:
   - Input: `{ metaTitle: string, metaDescription: string, ogDescription: string }`
   - Validates via `validatePageMeta`
   - Saves to `BuildSession.artifacts.pageSpec`
6. **Update** `assemble_site_files`:
   - Remove `approvedCopy` parameter
   - Read `BuildSession.artifacts.pageSpec` instead
   - Extract `BrandIdentity` from design-principles Foundation doc via `extractBrandFromDesignPrinciples`
   - Populate `brand.siteUrl` from existing `PaintedDoorSite.siteUrl` or derive from `siteName`
   - Call `assembleFromSpec(pageSpec, brand)` instead of `assembleAllFiles`
7. **Update** `evaluate_brand`:
   - Rewrite to evaluate PageSpec fields instead of `BrandIdentity.landingPage`
   - Check keyword presence in hero headline (from `pageSpec.sections[type='hero']`)
   - Check meta description from `pageSpec.metaDescription`
   - Check feature count from `pageSpec.sections[type='features']`
   - Keep color contrast check (now reads from extracted brand)

**Step 2: Rewrite test file**

Delete `src/lib/agent-tools/__tests__/website-design-brand.test.ts` and create `src/lib/agent-tools/__tests__/website-lock-tools.test.ts` with tests for the new tools.

**Mock setup:** Mock `painted-door-db` to include `getBuildSession` and `saveBuildSession` alongside existing mocks (`savePaintedDoorSite`, `getPaintedDoorSite`, etc.). Use `beforeEach(() => vi.clearAllMocks())` to isolate error-path tests from happy-path tests. Follow the mock pattern in `src/lib/__tests__/painted-door-chat-db.test.ts`.

Test cases:
- `lock_section_copy` with valid input → succeeds, echoes locked copy back
- `lock_section_copy` with validation failure → returns error with specific reasons
- `lock_section_copy` duplicate section without overwrite → error "section already locked"
- `lock_section_copy` duplicate section with `overwrite: true` → succeeds, replaces section
- `lock_section_copy` retry limit: 3 consecutive validation failures → returns error with last attempted copy (design doc: "Max 3 retries per lock attempt")
- `lock_page_meta` with valid input → succeeds
- `lock_page_meta` with missing field → returns validation error
- `assemble_site_files` with complete PageSpec → returns all files
- `assemble_site_files` with missing sections → returns error listing missing types
- **Error paths**: Redis `saveBuildSession` failure in `lock_section_copy` → `mockRejectedValue(new Error('Redis connection lost'))` → error surfaced to LLM
- **Error paths**: Redis `saveBuildSession` failure in `lock_page_meta` → `mockRejectedValue(new Error('Redis write failed'))` → error surfaced
- **Error paths**: Foundation doc read failure in token extraction → `mockRejectedValue(new Error('Redis timeout'))` → error with details
- **Error paths**: `extractBrandFromDesignPrinciples` returns `ok: false` → error with extraction failure details

Also update the `evaluate_brand` tests to check PageSpec fields instead of `BrandIdentity.landingPage`:
- Keyword presence in hero headline (from PageSpec `hero` section)
- Meta description length/keyword density (from PageSpec `metaDescription`)
- Feature count range check (from PageSpec `features` section)
- **FAQ count range check** (from PageSpec `faq` section) — design doc specifies this

**Step 3: Run tests**

Run: `npm test -- src/lib/agent-tools/__tests__/`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/agent-tools/website.ts src/lib/agent-tools/__tests__/
git commit -m "feat: add lock_section_copy/lock_page_meta tools, remove design_brand"
```

---

## Task 9: Update chat route for PageSpec-driven step advancement ✅

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/route.ts`

**Step 1: Update the chat route**

Key changes:

1. **Prerequisite validation at pipeline start**: When a build session is initialized (in the `mode_select` handler), validate that the design-principles Foundation doc exists and that its `json:design-tokens` block is parseable with valid WCAG contrast. Call `extractBrandFromDesignPrinciples(doc.content, '')` — if it returns `ok: false`, return an error response telling the user which Foundation doc needs regeneration. Do NOT proceed to Stage 1 if validation fails. This catches problems before the user invests time in stages 1-4 (design doc "Prerequisite" section).

2. **System prompt** (`assembleSystemPrompt`): Remove brand prompt references. Add instructions for `lock_section_copy` tool usage: "After each copy-producing stage, call `lock_section_copy({ type, copy })` to lock the section. The accumulator builds the full page spec incrementally. At Stage 5, `assemble_site_files` reads the locked PageSpec and renders deterministically."

3. **Tool array**: `createWebsiteTools` already includes the new tools from Task 8. No changes to the array construction.

4. **Step advancement**: `lock_section_copy` is NOT in `TOOL_COMPLETES_STEP` (it's called across multiple stages). Do NOT add it to `TOOL_COMPLETES_STEP`. Instead, add section-based advancement **after the tool execution block** in `runAgentStream` (after the `Promise.all` for tool results, around line 338):

   ```typescript
   // Section-based step advancement for lock_section_copy
   if (toolNamesCalled.includes('lock_section_copy') || toolNamesCalled.includes('lock_page_meta')) {
     // Re-read session from Redis (lock_section_copy/lock_page_meta update it)
     const updatedSession = await getBuildSession(ideaId);
     if (updatedSession?.artifacts?.pageSpec) {
       Object.assign(session, updatedSession);
       const lockedTypes = new Set(session.artifacts.pageSpec.sections.map(s => s.type));
       // Determine stage advancement based on locked sections
       // ... mapping logic here
     }
   }
   ```

   Stage-to-section mapping (using 0-indexed step numbers from `WEBSITE_BUILD_STEPS`):
   - Step 1 (Write Hero) completes when `hero` is locked
   - Step 2 substep 0 (Problem) completes when `problem` is locked
   - Step 2 substep 1 (Features) completes when `features` is locked
   - Step 2 substep 2 (How It Works) completes when `how-it-works` is locked
   - Step 2 substep 3 (Audience) completes when `audience` is locked
   - Step 2 substep 4 (Objections) completes when `objections` AND `final-cta` are locked
   - Step 3 (Final Review) completes when `lock_page_meta` succeeds (meta fields set on pageSpec)

   The existing `TOOL_COMPLETES_STEP` map continues to handle steps 4-5 (`assemble_site_files`, `push_files`, `verify_site`, etc.) — these are not section-based.

**Step 2: Update chat route tests**

Update `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`:
- Update mock tool arrays (remove `design_brand`, add `lock_section_copy`, `lock_page_meta`)
- Test that step advancement works based on section locking

**Step 3: Run tests**

Run: `npm test -- src/app/api/painted-door/`
Expected: PASS

**Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/app/api/painted-door/[id]/chat/route.ts src/app/api/painted-door/[id]/chat/__tests__/route.test.ts
git commit -m "feat: update chat route for PageSpec-driven step advancement"
```

---

## ✅ Task 10: Create design-principles framework

**Files:**
- Create: `src/lib/frameworks/prompts/design-principles/prompt.md`
- Create: `src/lib/frameworks/prompts/design-principles/examples.md`
- Create: `src/lib/frameworks/prompts/design-principles/anti-examples.md`
- Modify: `src/lib/frameworks/registry.ts` (add entry)

**Step 1: Create prompt.md**

The framework prompt specifies a 3-phase session flow:

Phase 1: Review positioning, brand-voice, and strategy Foundation docs. Understand the brand personality, target audience, and competitive positioning.

Phase 2: Establish design direction. Choose light/dark theme, color mood, typography feel. Consider the audience and conversion goals.

Phase 3: Produce the design-principles document with:
- Prose design principles (typography philosophy, color philosophy, spacing, etc.)
- A `json:design-tokens` fenced code block with the exact schema:

```json
{
  "siteName": "string",
  "tagline": "string",
  "colors": {
    "primary": "#hex",
    "primaryLight": "#hex",
    "background": "#hex",
    "backgroundElevated": "#hex",
    "text": "#hex",
    "textSecondary": "#hex",
    "textMuted": "#hex",
    "accent": "#hex",
    "border": "#hex"
  },
  "fonts": {
    "heading": "Google Font Name",
    "body": "Google Font Name",
    "mono": "Google Font Name"
  },
  "theme": "light" | "dark"
}
```

Requirements:
- All colors must be valid 6-digit hex codes
- All fonts must be available on Google Fonts
- WCAG AA: text on background must have >= 4.5:1 contrast ratio
- Theme must be "light" or "dark"

**Step 2: Create examples.md**

Move content from `src/lib/advisors/design-seed.ts` (the `designPrinciplesSeed` constant) into `examples.md` as an example of a well-formed design-principles doc. Adapt to include the `json:design-tokens` block format.

**Step 3: Create anti-examples.md**

Document failure modes:
- Missing `json:design-tokens` block entirely
- Non-hex color values (e.g., "blue", "rgb(0,0,0)")
- WCAG contrast failure (light text on light background)
- Non-Google fonts (e.g., system fonts like "Arial", "Helvetica")
- Missing required fields in the tokens block
- Theme value other than "light" or "dark"

**Step 4: Add framework registry entry**

In `src/lib/frameworks/registry.ts`, add:

```typescript
{
  id: 'design-principles',
  displayName: 'Design Principles',
  advisors: ['oli-gardner'],
  description: 'Generate visual design principles with implementation-ready tokens for deterministic site rendering.',
  contextDocs: ['positioning', 'brand-voice', 'strategy'],
},
```

**Step 5: Run existing framework tests**

Run: `npm test -- src/lib/__tests__/` (any framework-related tests)
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/frameworks/prompts/design-principles/ src/lib/frameworks/registry.ts
git commit -m "feat: add design-principles framework with token schema"
```

---

## ✅ Task 11: Update Foundation agent for design-principles

**Files:**
- Modify: `src/lib/agent-tools/foundation.ts:15-23` (DOC_ADVISOR_MAP)
- Modify: `src/lib/agent-tools/foundation.ts:88-94` (design-principles case in buildGenerationPrompt)
- Modify: `src/lib/advisors/prompts/oli-gardner.md` (add visual identity expertise)

**Step 1: Update DOC_ADVISOR_MAP**

Change `'design-principles': 'richard-rumelt'` to `'design-principles': 'oli-gardner'`.

**Step 2: Update buildGenerationPrompt for design-principles**

Replace the `case 'design-principles'` block (lines 88-94) to use the design-principles framework prompt instead of the hardcoded instructions:

```typescript
case 'design-principles': {
  const frameworkPrompt = getFrameworkPrompt('design-principles');
  if (frameworkPrompt) {
    prompt += frameworkPrompt;
  } else {
    prompt += 'Generate a design principles document with a json:design-tokens block.';
  }
  break;
}
```

Remove the `designSeed` parameter from `buildGenerationPrompt` signature. Remove the `designSeed` import and usage in `createFoundationTools`.

**Step 3: Update Oli Gardner's advisor prompt**

Add visual identity expertise to `src/lib/advisors/prompts/oli-gardner.md`. Add a section:

```markdown
## Visual Identity for Conversion

You also evaluate visual identity decisions through the lens of conversion:
- **Color choices:** Do they create hierarchy? Does the primary color draw the eye to CTAs? Is there enough contrast for readability?
- **Typography:** Does the heading font command attention? Is the body font readable at small sizes? Do the fonts match the brand's voice?
- **Theme (light/dark):** Which serves the audience better? Dark themes work for developer tools; light themes work for consumer products. Match the context.
- **Overall impression:** Does the visual identity feel trustworthy and professional for the target audience?
```

**Step 4: Run tests**

Run: `npm test`
Expected: PASS (foundation tool tests may need mock updates for `designSeed` removal)

**Step 5: Commit**

```bash
git add src/lib/agent-tools/foundation.ts src/lib/advisors/prompts/oli-gardner.md
git commit -m "feat: assign Oli Gardner to design-principles, use framework prompt"
```

---

## ✅ Task 12: Delete autonomous agent path

**Files:**
- Delete: `src/lib/painted-door-agent.ts`
- Delete: `src/lib/painted-door-prompts.ts`
- Delete: `src/lib/__tests__/painted-door-agent.test.ts`
- Delete: `src/lib/__tests__/painted-door-prompts.test.ts`
- Delete: `src/lib/agent-tools/__tests__/website-design-brand.test.ts` (if not already replaced in Task 8)
- Modify: `src/app/api/painted-door/[id]/route.ts` (delete POST handler)

**Step 1: Delete files**

```bash
git rm src/lib/painted-door-agent.ts
git rm src/lib/painted-door-prompts.ts
git rm src/lib/__tests__/painted-door-agent.test.ts
git rm src/lib/__tests__/painted-door-prompts.test.ts
```

**Step 2: Remove POST handler from route.ts**

In `src/app/api/painted-door/[id]/route.ts`, delete the `POST` export function (lines 52-111). Remove the import of `runPaintedDoorAgent`. Keep GET, PATCH, PUT, DELETE handlers.

**Step 3: Update route.ts tests**

In `src/app/api/painted-door/[id]/__tests__/route.test.ts`, remove tests for the POST handler.

**Step 4: Remove stale imports and note test-deploy route**

Search for any remaining imports of deleted modules:
- `painted-door-agent` imports
- `painted-door-prompts` imports (check website.ts — the `buildBrandIdentityPrompt` import should already be removed from Task 8)
- `ApprovedCopy` imports from `painted-door-templates` (should already be removed)

**Note:** `src/app/api/painted-door/[id]/test-deploy/route.ts` is a debugging endpoint that calls GitHub/Vercel APIs directly. It does NOT import `painted-door-agent.ts` or `painted-door-prompts.ts`, so it is unaffected by this task's deletions. It accesses `PaintedDoorSite.brand` which is already normalized at the DB layer (Task 4). Leave it in place — cleanup of debugging endpoints is a separate concern.

**Step 5: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Run tests**

Run: `npm test`
Expected: PASS

**Step 7: Commit**

```bash
git add -u
git commit -m "chore: delete autonomous agent path and brand identity prompt"
```

---

## ✅ Task 13: Update website status page

**Files:**
- Modify: `src/app/website/[id]/page.tsx` (remove triggerGeneration callback, update BrandIdentity display)

**Step 1: Update the page**

In `src/app/website/[id]/page.tsx`:
1. Remove the `triggerGeneration` callback and the "Build Site" button that POST to `/api/painted-door/{id}` (since POST handler is deleted)
2. Keep the "Continue Building" button that links to `/website/[id]/build`
3. Update brand preview to use new field names (`brand.fonts.heading` not `brand.typography.headingFont`, `brand.colors.text` not `brand.colors.textPrimary`)
4. The `normalizeBrandIdentity` function in `painted-door-db.ts` already handles this at the DB layer, so the page should receive normalized data

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/website/[id]/page.tsx
git commit -m "fix: update website status page for new BrandIdentity shape"
```

---

## ✅ Task 14: Update design-seed.ts and clean up

**Files:**
- Modify or delete: `src/lib/advisors/design-seed.ts` (content moved to framework examples.md in Task 10)
- Modify: `src/lib/agent-tools/foundation.ts` (remove designSeed import if not already done)

**Step 1: Delete or stub design-seed.ts**

If `designPrinciplesSeed` is still imported anywhere, delete the import. Then delete the file:

```bash
git rm src/lib/advisors/design-seed.ts
```

**Step 2: Verify no remaining imports**

Search for `design-seed` imports across the codebase. Remove any found.

**Step 3: Run build and tests**

Run: `npm run build && npm test`
Expected: Both succeed

**Step 4: Commit**

```bash
git add -u
git commit -m "chore: remove design-seed.ts, content moved to framework examples"
```

---

## ✅ Task 15: Update eval-config.ts

**Files:**
- Modify: `e2e/eval-config.ts`

**Step 1: Update LLM surface patterns**

In `e2e/eval-config.ts`:
1. Remove the `painted-door-agent.ts` surface (deleted)
2. Remove the `painted-door-prompts.ts` surface (deleted)
3. Add new surfaces:
   - `{ glob: 'src/lib/painted-door-page-spec.ts', tags: ['painted-door'] }` — validation logic influences LLM behavior
   - `{ glob: 'src/lib/painted-door-sections.ts', tags: ['painted-door'] }` — section renderers generate JSX for deployed sites
   - `{ glob: 'src/lib/foundation-tokens.ts', tags: ['painted-door', 'foundation'] }`
   - `{ glob: 'src/lib/frameworks/prompts/design-principles/prompt.md', tags: ['framework'] }` — already covered by the wildcard glob `src/lib/frameworks/prompts/*/prompt.md`
4. Verify the existing wildcard glob `src/lib/frameworks/prompts/*/prompt.md` now covers the new design-principles framework

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add e2e/eval-config.ts
git commit -m "chore: update eval config for new LLM surfaces"
```

---

## ✅ Task 16: Update landing-page-assembly framework prompt

**Files:**
- Modify: `src/lib/frameworks/prompts/landing-page-assembly/prompt.md`

**Step 1: Update the framework prompt**

Add instructions for the `lock_section_copy` tool and accumulator pattern:
- After each copy-producing stage, the LLM must call `lock_section_copy({ type, copy })` to lock the section
- Describe the overwrite behavior (only allowed in Stage 4 with `overwrite: true`)
- Reference `lock_page_meta` for Stage 4
- Clarify that all 8 sections must be locked before `assemble_site_files` can run
- Add the section type mapping:
  - Stage 2 → `lock_section_copy({ type: 'hero', copy: { headline, subheadline, ctaText } })`
  - Stage 3a → `lock_section_copy({ type: 'problem', copy: { headline, body } })`
  - Stage 3b → `lock_section_copy({ type: 'features', copy: { sectionHeadline, features: [...] } })`
  - Stage 3c → `lock_section_copy({ type: 'how-it-works', copy: { sectionHeadline, steps: [...] } })`
  - Stage 3d → `lock_section_copy({ type: 'audience', copy: { sectionHeadline, body } })`
  - Stage 3e → Two calls: `lock_section_copy({ type: 'objections' })` then `lock_section_copy({ type: 'final-cta' })`
  - FAQ → `lock_section_copy({ type: 'faq', copy: { sectionHeadline, faqs: [...] } })`
  - Stage 4 → `lock_page_meta({ metaTitle, metaDescription, ogDescription })`

**Step 2: Commit**

```bash
git add src/lib/frameworks/prompts/landing-page-assembly/prompt.md
git commit -m "docs: add lock_section_copy tool instructions to landing page assembly framework"
```

---

## ✅ Task 17: Update architecture docs

**Files:**
- Modify: `docs/architecture.md`

**Step 1: Update the architecture doc**

Key changes:
1. In the Agents section: Remove `painted-door-agent.ts` reference. Note that the website builder now uses chat-driven pipeline only.
2. In the Support Modules section: Replace `painted-door-prompts` reference. Add `painted-door-page-spec`, `painted-door-sections`, `foundation-tokens`, `contrast-utils`.
3. In the Library Module Map: Update `painted-door-templates` description to reference `assembleFromSpec()`. Remove `painted-door-prompts` entry. Add new module entries.
4. In the Frameworks section: Add `design-principles` to the framework list (now 5 frameworks).
5. In the Foundation Document Generation Order diagram: Change `design-principles` advisor from `Richard Rumelt` to `Oli Gardner`.
6. In the Website flow diagram: Remove autonomous agent path. Show chat-driven pipeline only.

**Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: update architecture for website builder rebuild"
```

---

## ✅ Task 18: Full verification

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 4: Review the diff**

Run: `git diff main --stat`
Review the full scope of changes. Verify:
- Deleted files: `painted-door-agent.ts`, `painted-door-prompts.ts`, `design-seed.ts`, their test files
- Created files: `painted-door-page-spec.ts`, `painted-door-sections.ts`, `foundation-tokens.ts`, `contrast-utils.ts`, design-principles framework files, all test files
- Modified files: `types/index.ts`, `painted-door-templates.ts`, `painted-door-db.ts`, `agent-tools/website.ts`, `agent-tools/foundation.ts`, chat route, API route, website page, framework registry, eval config, architecture docs

**Step 5: Commit any remaining changes**

If any files were missed, commit them now.

---

## Decision Log

### Summary

| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | BrandIdentity in foundation-tokens.ts vs types/index.ts | Dual: new type in foundation-tokens.ts, existing type updated in types/index.ts | Single source in types/index.ts only |
| 2 | Task ordering | Types → Utils → Foundation → DB migration → Templates → Tools → Route → Framework → Cleanup | Top-down (route first, work inward) |
| 3 | normalizeBrandIdentity scope | Applied in getPaintedDoorSite/getAllPaintedDoorSites only | Applied at every Redis read, or bulk migration script |
| 4 | PageSpec storage location | Inside BuildSession.artifacts | Separate Redis key |
| 5 | Section renderer file organization | Single file painted-door-sections.ts | One file per section renderer |

### Appendix: Decision Details

#### Decision 1: BrandIdentity type location

**Chose:** The `BrandIdentity` type exists in `src/types/index.ts` (updated with new field names) and the extraction function lives in `src/lib/foundation-tokens.ts` (returns `BrandIdentity` from types). The types/index.ts version is the canonical one.

**Why:** The existing codebase imports `BrandIdentity` from `@/types` everywhere (templates, tools, agent, DB). Keeping it there avoids changing dozens of import paths. The extraction function in `foundation-tokens.ts` returns the same type.

**Alternatives rejected:**
- Defining a separate `ExtractedBrand` type: unnecessary duplication, they're the same shape
- Moving the type to `foundation-tokens.ts` and re-exporting from types: adds indirection

#### Decision 2: Task ordering (bottom-up)

**Chose:** Types first, then utilities, then templates, then tools, then routes, then cleanup. Each task produces a compilable state.

**Why:** Bottom-up means each layer is tested before the layer above depends on it. The alternative (route-first) would require stubs everywhere and deferred testing. With TDD, bottom-up is natural: write the leaf-node types and functions first, then compose them.

**Alternatives rejected:**
- Top-down (route first): Creates long stretches of non-compilable code. Risk of mismatched interfaces discovered late.
- Big-bang (all changes in one task): Too large to review, impossible to bisect if something breaks.

#### Decision 3: normalizeBrandIdentity scope

**Chose:** Applied only in `getPaintedDoorSite()` and `getAllPaintedDoorSites()` — the two functions that deserialize `PaintedDoorSite` from Redis.

**Why:** Per the design doc, "any function that deserializes a PaintedDoorSite from Redis normalizes the brand." These are the only two such functions. `PaintedDoorProgress.result` contains old-format brand data, but progress records have a 1-hour TTL and will expire naturally.

**Alternatives rejected:**
- Bulk migration script: Unnecessary. Sites are rarely read, normalization at read time is fine.
- Applying normalization everywhere: Overkill, most code paths go through these two functions.

#### Decision 4: PageSpec storage

**Chose:** Inside `BuildSession.artifacts.pageSpec`. Same Redis key, same TTL, same lifecycle.

**Why:** Per design doc decision #6. `BuildSession` is the session state container, and `pageSpec` accumulates during the session. No sync issues — a single `saveBuildSession()` call persists everything atomically. Separate Redis keys would require coordinated TTL management and could drift.

#### Decision 5: Section renderer organization

**Chose:** Single file `painted-door-sections.ts` with all 8 renderers, `RenderContext`, and `wrapInPage`.

**Why:** These functions are tightly coupled (shared context, shared helpers like `esc()`/`escAttr()`, shared brand variable destructuring). A single file keeps them together and makes the rendering pipeline easy to read top-to-bottom. Each renderer is ~20-40 lines; 8 renderers + wrapInPage + helpers is ~400-500 lines total — well within single-file readability.

**Alternatives rejected:**
- One file per renderer: 8 tiny files with shared imports. More navigation cost, no readability benefit.
- Keeping renderers inline in `painted-door-templates.ts`: That file is already ~950 lines. Moving them out reduces its scope to scaffold files + `assembleFromSpec`.
