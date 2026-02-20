# Simplify Brand Tokens Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Replace the fragile regex-based design token parser with an LLM-driven `lock_brand` tool, matching the existing `lock_section_copy`/`lock_page_meta` pattern.

**Source Design Doc:** `docs/plans/2026-02-20-simplify-brand-tokens.md`

**Architecture:** Delete `foundation-tokens.ts` (regex parser), add a `lock_brand` tool to `website.ts` that stores brand in `session.artifacts.brand`, update `assemble_site_files` and `evaluate_brand` to read from session instead of parsing docs, remove the prerequisite gate in the chat route, and simplify the design-principles prompt to prose-only.

**Tech Stack:** TypeScript, Vitest, Next.js 16

---

## Task Ordering Dependencies

- **Tasks 2 → 3 → 4**: All modify `src/lib/agent-tools/website.ts` — must be sequential.
- **Tasks 5 → 6**: Both modify `src/app/api/painted-door/[id]/chat/route.ts` — must be sequential.
- **Tasks 3, 4, and 5 → 9**: Task 9 deletes `foundation-tokens.ts`; the imports must be removed first.

---

### ✅ Task 1: Add `brand` to `BuildSession.artifacts` type

**Files:**
- Modify: `src/types/index.ts:544-558`

**Step 1: Add the brand property**

In `src/types/index.ts`, add `brand?: BrandIdentity` to the `BuildSession.artifacts` type after line 557, before the closing `};` on line 558:

```ts
    pageSpec?: import('../lib/painted-door-page-spec').PageSpec;
    brand?: BrandIdentity;
  };
```

`BrandIdentity` is already defined at line 168 in the same file, so no new import needed.

**Step 2: Run tests to verify no regressions**

Run: `npm test -- --run`
Expected: All tests pass (type-only change, no behavioral impact).

**Step 3: Commit**

```
git add src/types/index.ts
git commit -m "feat: add brand to BuildSession.artifacts type"
```

---

### ✅ Task 2: Add `lock_brand` tool to website.ts

**Files:**
- Create: `src/lib/agent-tools/__tests__/website-lock-brand.test.ts`
- Modify: `src/lib/agent-tools/website.ts` (insert new tool after `lock_page_meta` at line 469)

> **Note:** `contrastRatio` is already imported in `website.ts` at line 21 (`import { contrastRatio } from '../contrast-utils';`). No new import needed for `lock_brand`.

**Step 1: Write the failing tests**

Create `src/lib/agent-tools/__tests__/website-lock-brand.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks (same pattern as website-lock-tools.test.ts) ---

const mockRedis = { set: vi.fn(), get: vi.fn(), del: vi.fn() };

vi.mock('@/lib/redis', () => ({
  getRedis: () => mockRedis,
  isRedisConfigured: () => true,
  parseValue: <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T,
}));

const mockCreate = vi.fn();
vi.mock('../../anthropic', () => ({
  getAnthropic: () => ({ messages: { create: mockCreate } }),
}));

vi.mock('../../config', () => ({ CLAUDE_MODEL: 'test-model' }));

const mockGetIdeaFromDb = vi.fn();
const mockGetFoundationDoc = vi.fn();
vi.mock('../../db', () => ({
  getIdeaFromDb: (...args: unknown[]) => mockGetIdeaFromDb(...args),
  getContentCalendar: vi.fn().mockResolvedValue(null),
  saveContentCalendar: vi.fn(),
  getAllFoundationDocs: vi.fn().mockResolvedValue({}),
  getFoundationDoc: (...args: unknown[]) => mockGetFoundationDoc(...args),
}));

const mockBuildContentContext = vi.fn();
vi.mock('../../content-agent', () => ({
  buildContentContext: (...args: unknown[]) => mockBuildContentContext(...args),
}));

vi.mock('../../painted-door-templates', () => ({
  assembleFromSpec: vi.fn().mockReturnValue({ 'app/page.tsx': 'export default function Home(){}' }),
}));

const mockGetBuildSession = vi.fn();
const mockSaveBuildSession = vi.fn();
vi.mock('../../painted-door-db', () => ({
  savePaintedDoorSite: vi.fn(),
  savePaintedDoorProgress: vi.fn(),
  getPaintedDoorSite: vi.fn().mockResolvedValue(null),
  saveDynamicPublishTarget: vi.fn(),
  getBuildSession: (...args: unknown[]) => mockGetBuildSession(...args),
  saveBuildSession: (...args: unknown[]) => mockSaveBuildSession(...args),
}));

vi.mock('../../github-api', () => ({
  createGitHubRepo: vi.fn(),
  pushFilesToGitHub: vi.fn(),
  createVercelProject: vi.fn(),
  triggerDeployViaGitPush: vi.fn(),
}));

vi.stubGlobal('fetch', vi.fn());

import { createWebsiteTools } from '../website';

// --- Helpers ---

function makeSession(brand?: Record<string, unknown>) {
  return {
    ideaId: 'idea-1',
    mode: 'chat',
    currentStep: 0,
    currentSubstep: 0,
    steps: [],
    artifacts: {
      pageSpec: { sections: [], metaTitle: '', metaDescription: '', ogDescription: '' },
      ...(brand !== undefined ? { brand } : {}),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function setupIdea() {
  mockGetIdeaFromDb.mockResolvedValue({
    id: 'idea-1', name: 'Test Idea', description: 'desc',
    targetUser: 'devs', problemSolved: 'bugs',
  });
  mockBuildContentContext.mockResolvedValue({
    ideaName: 'Test', ideaDescription: 'desc', targetUser: 'devs',
    problemSolved: 'bugs', summary: 'summary', competitors: 'none',
    topKeywords: [{ keyword: 'test', intentType: 'info', estimatedVolume: 'high', estimatedCompetitiveness: 'low', contentGapHypothesis: '' }],
    serpValidated: [], contentStrategy: { recommendedAngle: 'test', topOpportunities: ['op1'] },
  });
}

const VALID_BRAND_INPUT = {
  siteName: 'TestBrand',
  tagline: 'Test all the things',
  theme: 'light',
  colors: {
    primary: '#2563EB', primaryLight: '#3B82F6', background: '#FFFFFF',
    backgroundElevated: '#F9FAFB', text: '#111827', textSecondary: '#4B5563',
    textMuted: '#9CA3AF', accent: '#10B981', border: '#E5E7EB',
  },
  fonts: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' },
};

async function getTools() {
  const tools = await createWebsiteTools('idea-1');
  return tools;
}

function findTool(tools: Awaited<ReturnType<typeof createWebsiteTools>>, name: string) {
  return tools.find((t) => t.name === name)!;
}

// --- Tests ---

describe('lock_brand tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupIdea();
    mockGetBuildSession.mockResolvedValue(makeSession());
    mockSaveBuildSession.mockResolvedValue(undefined);
  });

  it('locks valid brand and returns success with fields', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute(VALID_BRAND_INPUT);
    expect(result.success).toBe(true);
    expect(result.siteName).toBe('TestBrand');
    expect(result.theme).toBe('light');
    expect(mockSaveBuildSession).toHaveBeenCalled();
    // Verify brand was stored in session artifacts
    const savedSession = mockSaveBuildSession.mock.calls[0][1];
    expect(savedSession.artifacts.brand).toBeDefined();
    expect(savedSession.artifacts.brand.siteName).toBe('TestBrand');
    expect(savedSession.artifacts.brand.siteUrl).toBe('');
  });

  it('returns error for invalid hex color', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute({
      ...VALID_BRAND_INPUT,
      colors: { ...VALID_BRAND_INPUT.colors, primary: 'not-hex' },
    });
    expect(result.error).toContain('primary');
  });

  it('returns error for 3-digit hex shorthand', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute({
      ...VALID_BRAND_INPUT,
      colors: { ...VALID_BRAND_INPUT.colors, background: '#FFF' },
    });
    expect(result.error).toContain('background');
  });

  it('returns error for invalid theme value', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute({ ...VALID_BRAND_INPUT, theme: 'neon' });
    expect(result.error).toContain('theme');
  });

  it('returns error for empty font field', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute({
      ...VALID_BRAND_INPUT,
      fonts: { heading: '', body: 'Inter', mono: 'JetBrains Mono' },
    });
    expect(result.error).toContain('heading');
  });

  it('returns error for missing siteName', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const { siteName: _, ...withoutSiteName } = VALID_BRAND_INPUT;
    const result = await lock.execute(withoutSiteName);
    expect(result.error).toContain('siteName');
  });

  it('returns error for missing colors object', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const { colors: _, ...withoutColors } = VALID_BRAND_INPUT;
    const result = await lock.execute(withoutColors);
    expect(result.error).toContain('colors');
  });

  it('returns warning for low WCAG contrast but still saves brand', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute({
      ...VALID_BRAND_INPUT,
      colors: { ...VALID_BRAND_INPUT.colors, text: '#CCCCCC', background: '#FFFFFF' },
    });
    expect(result.success).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('contrast');
    // Brand should still be saved
    expect(mockSaveBuildSession).toHaveBeenCalled();
  });

  it('rejects overwrite when brand already locked and overwrite not set', async () => {
    mockGetBuildSession.mockResolvedValue(makeSession(VALID_BRAND_INPUT as unknown as Record<string, unknown>));
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute(VALID_BRAND_INPUT);
    expect(result.error).toContain('already locked');
  });

  it('allows overwrite when overwrite is true', async () => {
    mockGetBuildSession.mockResolvedValue(makeSession(VALID_BRAND_INPUT as unknown as Record<string, unknown>));
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute({ ...VALID_BRAND_INPUT, overwrite: true });
    expect(result.success).toBe(true);
  });

  it('returns error when no build session exists', async () => {
    mockGetBuildSession.mockResolvedValue(null);
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute(VALID_BRAND_INPUT);
    expect(result.error).toContain('build session');
  });

  it('surfaces Redis save failure', async () => {
    mockSaveBuildSession.mockRejectedValue(new Error('Redis connection lost'));
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute(VALID_BRAND_INPUT);
    expect(result.error).toContain('Redis connection lost');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/agent-tools/__tests__/website-lock-brand.test.ts`
Expected: FAIL — `lock_brand` tool not found.

**Step 3: Implement the `lock_brand` tool**

In `src/lib/agent-tools/website.ts`, add the `lock_brand` tool definition in the tools array, immediately after `lock_page_meta` (after line 469). Insert this tool:

```ts
    // -----------------------------------------------------------------------
    // Lock brand identity into session
    // -----------------------------------------------------------------------
    {
      name: 'lock_brand',
      description:
        'Validate and lock the brand identity (colors, fonts, theme) into the build session. Call this at Stage 0 after reading the design-principles Foundation document. The brand feeds directly into site rendering.',
      input_schema: {
        type: 'object',
        properties: {
          siteName: { type: 'string', description: 'The product/site name' },
          tagline: { type: 'string', description: 'Short tagline for the product' },
          theme: { type: 'string', enum: ['light', 'dark'], description: 'Light or dark theme' },
          colors: {
            type: 'object',
            description: 'All 9 color fields as 6-digit hex codes (#RRGGBB)',
            properties: {
              primary: { type: 'string', description: 'Primary/CTA color' },
              primaryLight: { type: 'string', description: 'Lighter variant for hover states' },
              background: { type: 'string', description: 'Page background color' },
              backgroundElevated: { type: 'string', description: 'Card/elevated surface background' },
              text: { type: 'string', description: 'Primary text color' },
              textSecondary: { type: 'string', description: 'Secondary text color' },
              textMuted: { type: 'string', description: 'Muted/placeholder text color' },
              accent: { type: 'string', description: 'Accent color for highlights (distinct from primary)' },
              border: { type: 'string', description: 'Subtle border color' },
            },
            required: ['primary', 'primaryLight', 'background', 'backgroundElevated', 'text', 'textSecondary', 'textMuted', 'accent', 'border'],
          },
          fonts: {
            type: 'object',
            description: 'Font family names from Google Fonts',
            properties: {
              heading: { type: 'string', description: 'Heading font' },
              body: { type: 'string', description: 'Body font' },
              mono: { type: 'string', description: 'Monospace font' },
            },
            required: ['heading', 'body', 'mono'],
          },
          overwrite: {
            type: 'boolean',
            description: 'Set to true to replace previously locked brand (e.g. during final review)',
          },
        },
        required: ['siteName', 'tagline', 'theme', 'colors', 'fonts'],
      },
      execute: async (input) => {
        const overwrite = (input.overwrite as boolean) || false;
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate required string fields
        if (!input.siteName || typeof input.siteName !== 'string') errors.push('siteName is required');
        if (!input.tagline || typeof input.tagline !== 'string') errors.push('tagline is required');
        if (!input.theme || (input.theme !== 'light' && input.theme !== 'dark')) {
          errors.push('theme must be "light" or "dark"');
        }

        // Validate colors
        const colors = input.colors as Record<string, string> | undefined;
        if (!colors || typeof colors !== 'object') {
          errors.push('colors object is required');
        } else {
          const hexPattern = /^#[0-9A-Fa-f]{6}$/;
          const colorFields = ['primary', 'primaryLight', 'background', 'backgroundElevated', 'text', 'textSecondary', 'textMuted', 'accent', 'border'];
          for (const field of colorFields) {
            if (!colors[field] || !hexPattern.test(colors[field])) {
              errors.push(`colors.${field} must be a valid 6-digit hex code (#RRGGBB)`);
            }
          }
        }

        // Validate fonts
        const fonts = input.fonts as Record<string, string> | undefined;
        if (!fonts || typeof fonts !== 'object') {
          errors.push('fonts object is required');
        } else {
          for (const field of ['heading', 'body', 'mono']) {
            if (!fonts[field] || typeof fonts[field] !== 'string' || fonts[field].trim() === '') {
              errors.push(`fonts.${field} must be a non-empty string`);
            }
          }
        }

        if (errors.length > 0) {
          return { error: `Brand validation failed: ${errors.join('; ')}` };
        }

        // WCAG contrast check (warning only)
        if (colors) {
          const ratio = contrastRatio(colors.text, colors.background);
          if (ratio < 4.5) {
            warnings.push(`WCAG AA contrast warning: text (${colors.text}) on background (${colors.background}) has ratio ${ratio.toFixed(1)}:1, minimum recommended is 4.5:1`);
          }
        }

        try {
          const session = await getBuildSession(ideaId);
          if (!session) return { error: 'No build session found — start a build first' };

          // Check for existing brand
          if (session.artifacts.brand && !overwrite) {
            return { error: 'Brand is already locked. Pass overwrite: true to replace it.' };
          }

          const lockedBrand: BrandIdentity = {
            siteName: input.siteName as string,
            tagline: input.tagline as string,
            siteUrl: '', // Resolved later by assemble_site_files from the site record
            colors: {
              primary: colors!.primary,
              primaryLight: colors!.primaryLight,
              background: colors!.background,
              backgroundElevated: colors!.backgroundElevated,
              text: colors!.text,
              textSecondary: colors!.textSecondary,
              textMuted: colors!.textMuted,
              accent: colors!.accent,
              border: colors!.border,
            },
            fonts: {
              heading: fonts!.heading,
              body: fonts!.body,
              mono: fonts!.mono,
            },
            theme: input.theme as 'light' | 'dark',
          };

          session.artifacts.brand = lockedBrand;
          session.updatedAt = new Date().toISOString();
          await saveBuildSession(ideaId, session);

          // Also set the closure variable for downstream tools (create_repo, push_files, finalize_site)
          brand = lockedBrand;

          return {
            success: true,
            siteName: lockedBrand.siteName,
            tagline: lockedBrand.tagline,
            theme: lockedBrand.theme,
            colorCount: 9,
            fonts: lockedBrand.fonts,
            warnings,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { error: `Failed to save brand: ${msg}` };
        }
      },
    },
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/lib/agent-tools/__tests__/website-lock-brand.test.ts`
Expected: All 12 tests PASS.

**Step 5: Commit**

```
git add src/lib/agent-tools/__tests__/website-lock-brand.test.ts src/lib/agent-tools/website.ts
git commit -m "feat: add lock_brand tool for LLM-driven brand token capture"
```

---

### Task 3: Update `assemble_site_files` to read brand from session

**Files:**
- Modify: `src/lib/agent-tools/website.ts:474-529`
- Modify: `src/lib/agent-tools/__tests__/website-lock-tools.test.ts:283-398`

**Step 1: Update the tests**

In `src/lib/agent-tools/__tests__/website-lock-tools.test.ts`, update the `makeSession` helper (line 69) to support a brand parameter:

Replace the existing `makeSession` function (lines 69-87):
```ts
function makeSession(sections: { type: string; copy: Record<string, unknown> }[] = []) {
  return {
    ideaId: 'idea-1',
    mode: 'chat',
    currentStep: 1,
    currentSubstep: 0,
    steps: [],
    artifacts: {
      pageSpec: {
        sections,
        metaTitle: '',
        metaDescription: '',
        ogDescription: '',
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
```

With:
```ts
const VALID_BRAND = {
  siteName: 'TestBrand',
  tagline: 'Test all the things',
  siteUrl: '',
  colors: {
    primary: '#2563EB', primaryLight: '#3B82F6', background: '#FFFFFF',
    backgroundElevated: '#F9FAFB', text: '#111827', textSecondary: '#4B5563',
    textMuted: '#9CA3AF', accent: '#10B981', border: '#E5E7EB',
  },
  fonts: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' },
  theme: 'light' as const,
};

function makeSession(
  sections: { type: string; copy: Record<string, unknown> }[] = [],
  brand?: typeof VALID_BRAND,
) {
  return {
    ideaId: 'idea-1',
    mode: 'chat',
    currentStep: 1,
    currentSubstep: 0,
    steps: [],
    artifacts: {
      pageSpec: {
        sections,
        metaTitle: '',
        metaDescription: '',
        ogDescription: '',
      },
      ...(brand !== undefined ? { brand } : {}),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
```

Now update the `assemble_site_files` test describe block (lines 283-398). Replace the entire block:

```ts
describe('assemble_site_files tool (PageSpec path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupIdea();
    mockSaveBuildSession.mockResolvedValue(undefined);
  });

  it('assembles files when PageSpec is complete and brand is locked', async () => {
    const fullSession = makeSession([
      { type: 'hero', copy: { headline: 'H', subheadline: 'S', ctaText: 'Go now' } },
      { type: 'problem', copy: { headline: 'H', body: 'B' } },
      { type: 'features', copy: { sectionHeadline: 'F', features: [{ title: 'T', description: 'D' }, { title: 'T2', description: 'D2' }, { title: 'T3', description: 'D3' }] } },
      { type: 'how-it-works', copy: { sectionHeadline: 'H', steps: [{ label: 'L', description: 'D' }, { label: 'L2', description: 'D2' }, { label: 'L3', description: 'D3' }] } },
      { type: 'audience', copy: { sectionHeadline: 'A', body: 'B' } },
      { type: 'objections', copy: { sectionHeadline: 'O', objections: [{ question: 'Q', answer: 'A' }] } },
      { type: 'final-cta', copy: { headline: 'H', body: 'B', ctaText: 'Go now' } },
      { type: 'faq', copy: { sectionHeadline: 'F', faqs: [{ question: 'Q', answer: 'A' }] } },
    ], VALID_BRAND);
    fullSession.artifacts.pageSpec!.metaTitle = 'Test Title';
    fullSession.artifacts.pageSpec!.metaDescription = 'Test description';
    fullSession.artifacts.pageSpec!.ogDescription = 'Test OG';
    mockGetBuildSession.mockResolvedValue(fullSession);

    const tools = await getTools();
    const assemble = findTool(tools, 'assemble_site_files');
    const result = await assemble.execute({});
    expect(result.success).toBe(true);
    expect(result.totalFileCount).toBeGreaterThan(0);
    expect(assembleFromSpec).toHaveBeenCalled();
  });

  it('returns error when sections are missing', async () => {
    mockGetBuildSession.mockResolvedValue(
      makeSession([{ type: 'hero', copy: { headline: 'H', subheadline: 'S', ctaText: 'Go now' } }], VALID_BRAND),
    );

    const tools = await getTools();
    const assemble = findTool(tools, 'assemble_site_files');
    const result = await assemble.execute({});
    expect(result.error).toContain('missing');
  });

  it('returns error when brand is not locked', async () => {
    const fullSession = makeSession([
      { type: 'hero', copy: { headline: 'H', subheadline: 'S', ctaText: 'Go now' } },
      { type: 'problem', copy: { headline: 'H', body: 'B' } },
      { type: 'features', copy: { sectionHeadline: 'F', features: [{ title: 'T', description: 'D' }, { title: 'T2', description: 'D2' }, { title: 'T3', description: 'D3' }] } },
      { type: 'how-it-works', copy: { sectionHeadline: 'H', steps: [{ label: 'L', description: 'D' }, { label: 'L2', description: 'D2' }, { label: 'L3', description: 'D3' }] } },
      { type: 'audience', copy: { sectionHeadline: 'A', body: 'B' } },
      { type: 'objections', copy: { sectionHeadline: 'O', objections: [{ question: 'Q', answer: 'A' }] } },
      { type: 'final-cta', copy: { headline: 'H', body: 'B', ctaText: 'Go now' } },
      { type: 'faq', copy: { sectionHeadline: 'F', faqs: [{ question: 'Q', answer: 'A' }] } },
    ]); // No brand
    mockGetBuildSession.mockResolvedValue(fullSession);

    const tools = await getTools();
    const assemble = findTool(tools, 'assemble_site_files');
    const result = await assemble.execute({});
    expect(result.error).toContain('lock_brand');
  });

  it('surfaces Redis read failure for build session', async () => {
    mockGetBuildSession.mockRejectedValue(new Error('Redis timeout'));

    const tools = await getTools();
    const assemble = findTool(tools, 'assemble_site_files');
    const result = await assemble.execute({});
    expect(result.error).toContain('Redis timeout');
  });
});
```

> **Behavior change:** The test "returns error when design-principles doc is missing" is replaced by "returns error when brand is not locked" — assemble_site_files no longer reads the design-principles doc. The test "returns error when token extraction fails" is removed entirely (token extraction no longer exists).

> **Note:** The `describe('design_brand tool removed')` block at lines 503-527 calls `makeSession()` with no arguments. The new `brand` parameter is optional, so this block is unaffected by the signature change.

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/agent-tools/__tests__/website-lock-tools.test.ts`
Expected: FAIL — assemble_site_files tests expect brand from session but implementation still parses design-principles doc.

**Step 3: Update the `assemble_site_files` implementation**

In `src/lib/agent-tools/website.ts`, replace the `assemble_site_files` execute function body (lines 483-529). Replace:

```ts
      execute: async () => {
        try {
          // Read build session for PageSpec
          const session = await getBuildSession(ideaId);
          if (!session?.artifacts?.pageSpec) {
            return { error: 'No PageSpec found — lock all sections first' };
          }
          const pageSpec = session.artifacts.pageSpec as PageSpec;

          // Check for missing sections
          const missing = getMissingSectionTypes(pageSpec.sections);
          if (missing.length > 0) {
            return { error: `Cannot assemble: missing section types: ${missing.join(', ')}` };
          }

          // Extract brand from design-principles Foundation doc
          const designDoc = await getFoundationDoc(ideaId, 'design-principles');
          if (!designDoc) {
            return { error: 'No design-principles Foundation doc found. Generate one first.' };
          }

          // Determine siteUrl from existing site record
          let existingSiteUrl = '';
          try {
            const existingSite = await getPaintedDoorSite(ideaId);
            if (existingSite?.siteUrl) existingSiteUrl = existingSite.siteUrl;
          } catch { /* ignore */ }

          const extraction = extractBrandFromDesignPrinciples(designDoc.content, existingSiteUrl);
          if (!extraction.ok) {
            return { error: `Brand extraction failed: ${extraction.error}` };
          }

          brand = extraction.brand as BrandIdentity;
          allFiles = assembleFromSpec(pageSpec, brand);

          return {
            success: true,
            totalFileCount: Object.keys(allFiles).length,
            files: Object.keys(allFiles),
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { error: `Assembly failed: ${msg}` };
        }
      },
```

With:

```ts
      execute: async () => {
        try {
          // Read build session for PageSpec and brand
          const session = await getBuildSession(ideaId);
          if (!session?.artifacts?.pageSpec) {
            return { error: 'No PageSpec found — lock all sections first' };
          }
          const pageSpec = session.artifacts.pageSpec as PageSpec;

          // Check for missing sections
          const missing = getMissingSectionTypes(pageSpec.sections);
          if (missing.length > 0) {
            return { error: `Cannot assemble: missing section types: ${missing.join(', ')}` };
          }

          // Read brand from session (set by lock_brand) or closure (preloaded from site record on rebuilds)
          const sourceBrand = session.artifacts.brand ?? brand;
          if (!sourceBrand) {
            return { error: 'No brand locked — call lock_brand first' };
          }

          // Resolve siteUrl from existing site record
          const sessionBrand = { ...sourceBrand } as BrandIdentity;
          try {
            const existingSite = await getPaintedDoorSite(ideaId);
            if (existingSite?.siteUrl) sessionBrand.siteUrl = existingSite.siteUrl;
          } catch { /* ignore */ }

          brand = sessionBrand;
          allFiles = assembleFromSpec(pageSpec, brand);

          return {
            success: true,
            totalFileCount: Object.keys(allFiles).length,
            files: Object.keys(allFiles),
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { error: `Assembly failed: ${msg}` };
        }
      },
```

Also update the tool's description (line 477) from:

```ts
        'Assemble all site files from the locked PageSpec and design-principles Foundation doc. Deterministic — no LLM call. Requires all 8 sections to be locked via lock_section_copy.',
```

To:

```ts
        'Assemble all site files from the locked PageSpec and locked brand. Deterministic — no LLM call. Requires all 8 sections locked via lock_section_copy and brand locked via lock_brand.',
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/lib/agent-tools/__tests__/website-lock-tools.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```
git add src/lib/agent-tools/website.ts src/lib/agent-tools/__tests__/website-lock-tools.test.ts
git commit -m "refactor: assemble_site_files reads brand from session instead of parsing design doc"
```

---

### Task 4: Update `evaluate_brand` to read brand from session

**Files:**
- Modify: `src/lib/agent-tools/website.ts:534-642`
- Modify: `src/lib/agent-tools/__tests__/website-lock-tools.test.ts:400-500`

**Step 1: Update the tests**

In `src/lib/agent-tools/__tests__/website-lock-tools.test.ts`, update the `evaluate_brand` test describe block. Each test currently sets up `mockGetFoundationDoc` to return a design doc with tokens. Replace that with brand in the session.

Replace the entire `describe('evaluate_brand tool (PageSpec-based)')` block (lines 400-501) with:

```ts
describe('evaluate_brand tool (PageSpec-based)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupIdea();
  });

  it('checks keyword in hero headline from PageSpec', async () => {
    const session = makeSession([
      { type: 'hero', copy: { headline: 'Test your ideas fast', subheadline: 'Testing tools for startups.', ctaText: 'Start testing' } },
      { type: 'features', copy: { sectionHeadline: 'Features', features: [{ title: 'T1', description: 'D1' }, { title: 'T2', description: 'D2' }, { title: 'T3', description: 'D3' }] } },
      { type: 'faq', copy: { sectionHeadline: 'FAQ', faqs: [{ question: 'Q?', answer: 'A.' }] } },
    ], VALID_BRAND);
    session.artifacts.pageSpec!.metaDescription = 'A great test platform for developers that helps them build faster apps and ship more often.';
    mockGetBuildSession.mockResolvedValue(session);

    const tools = await getTools();
    const getCtx = findTool(tools, 'get_idea_context');
    await getCtx.execute({});
    const evaluate = findTool(tools, 'evaluate_brand');
    const result = await evaluate.execute({});
    expect(result.headlineHasKeyword).toBe(true);
  });

  it('reports missing keyword in hero headline', async () => {
    const session = makeSession([
      { type: 'hero', copy: { headline: 'Build things fast', subheadline: 'No testing keywords here.', ctaText: 'Get started now' } },
      { type: 'features', copy: { sectionHeadline: 'Features', features: [{ title: 'T1', description: 'D1' }, { title: 'T2', description: 'D2' }, { title: 'T3', description: 'D3' }] } },
      { type: 'faq', copy: { sectionHeadline: 'FAQ', faqs: [{ question: 'Q?', answer: 'A.' }] } },
    ], VALID_BRAND);
    session.artifacts.pageSpec!.metaDescription = 'A great platform for building.';
    mockGetBuildSession.mockResolvedValue(session);

    const tools = await getTools();
    const getCtx = findTool(tools, 'get_idea_context');
    await getCtx.execute({});
    const evaluate = findTool(tools, 'evaluate_brand');
    const result = await evaluate.execute({});
    expect(result.headlineHasKeyword).toBe(false);
  });

  it('checks feature count from PageSpec', async () => {
    const session = makeSession([
      { type: 'hero', copy: { headline: 'Test platform here', subheadline: 'Sub.', ctaText: 'Go test now' } },
      { type: 'features', copy: { sectionHeadline: 'Features', features: [{ title: 'T1', description: 'D1' }, { title: 'T2', description: 'D2' }, { title: 'T3', description: 'D3' }] } },
      { type: 'faq', copy: { sectionHeadline: 'FAQ', faqs: [{ question: 'Q?', answer: 'A.' }] } },
    ], VALID_BRAND);
    session.artifacts.pageSpec!.metaDescription = 'A great test description for testing.';
    mockGetBuildSession.mockResolvedValue(session);

    const tools = await getTools();
    const getCtx = findTool(tools, 'get_idea_context');
    await getCtx.execute({});
    const evaluate = findTool(tools, 'evaluate_brand');
    const result = await evaluate.execute({});
    expect(result.featureCount).toBe(3);
  });

  it('checks FAQ count from PageSpec', async () => {
    const session = makeSession([
      { type: 'hero', copy: { headline: 'Test stuff here', subheadline: 'Sub.', ctaText: 'Go test now' } },
      { type: 'features', copy: { sectionHeadline: 'Features', features: [{ title: 'T1', description: 'D1' }, { title: 'T2', description: 'D2' }, { title: 'T3', description: 'D3' }] } },
      { type: 'faq', copy: { sectionHeadline: 'FAQ', faqs: [{ question: 'Q1?', answer: 'A1.' }, { question: 'Q2?', answer: 'A2.' }, { question: 'Q3?', answer: 'A3.' }] } },
    ], VALID_BRAND);
    session.artifacts.pageSpec!.metaDescription = 'A test site.';
    mockGetBuildSession.mockResolvedValue(session);

    const tools = await getTools();
    const getCtx = findTool(tools, 'get_idea_context');
    await getCtx.execute({});
    const evaluate = findTool(tools, 'evaluate_brand');
    const result = await evaluate.execute({});
    expect(result.faqCount).toBe(3);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/agent-tools/__tests__/website-lock-tools.test.ts`
Expected: FAIL — evaluate_brand still reads from design-principles doc.

**Step 3: Update the `evaluate_brand` implementation**

In `src/lib/agent-tools/website.ts`, update the evaluate_brand execute function. Replace the brand reading block (lines 551-557):

```ts
          // Read brand from design-principles
          const designDoc = await getFoundationDoc(ideaId, 'design-principles');
          let extractedBrand: BrandIdentity | null = null;
          if (designDoc) {
            const extraction = extractBrandFromDesignPrinciples(designDoc.content, '');
            if (extraction.ok) extractedBrand = extraction.brand as BrandIdentity;
          }
```

With:

```ts
          // Read brand from session (set by lock_brand)
          const extractedBrand: BrandIdentity | null = session?.artifacts?.brand ?? null;
```

Then update the contrast check reference at line 616 — `extractedBrand` variable name is unchanged, so no further changes needed. The rest of the function already uses `extractedBrand` correctly.

**Step 4: Remove the now-unused `extractBrandFromDesignPrinciples` import**

In `src/lib/agent-tools/website.ts`, delete line 9:

```ts
import { extractBrandFromDesignPrinciples } from '@/lib/foundation-tokens';
```

**Step 5: Run tests to verify they pass**

Run: `npm test -- --run src/lib/agent-tools/__tests__/website-lock-tools.test.ts`
Expected: All tests PASS.

Also run the lock_brand tests to make sure nothing broke:
Run: `npm test -- --run src/lib/agent-tools/__tests__/website-lock-brand.test.ts`
Expected: All tests PASS.

**Step 6: Commit**

```
git add src/lib/agent-tools/website.ts src/lib/agent-tools/__tests__/website-lock-tools.test.ts
git commit -m "refactor: evaluate_brand reads from session, remove foundation-tokens import from website.ts"
```

---

### Task 5: Remove prerequisite gate from chat route

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/route.ts:10,154-168`
- Modify: `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts:26-35,268-303`

**Step 1: Update route tests — remove prerequisite gate tests and simplify mock**

In `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`:

1. Simplify the hoisted block (lines 26-35). Replace:
```ts
const { VALID_DESIGN_TOKENS, VALID_DESIGN_DOC } = vi.hoisted(() => {
  const tokens = JSON.stringify({
    siteName: 'TestBrand', tagline: 'Test all the things',
    colors: { primary: '#2563EB', primaryLight: '#3B82F6', background: '#FFFFFF', backgroundElevated: '#F9FAFB', text: '#111827', textSecondary: '#4B5563', textMuted: '#9CA3AF', accent: '#10B981', border: '#E5E7EB' },
    fonts: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' },
    theme: 'light',
  });
  const doc = `# Design Principles\n\nSome prose.\n\n\`\`\`json:design-tokens\n${tokens}\n\`\`\`\n\nMore prose.`;
  return { VALID_DESIGN_TOKENS: tokens, VALID_DESIGN_DOC: doc };
});
```

With:
```ts
const VALID_DESIGN_DOC = '# Design Principles\n\nWarm tones with coral primary (#FF6B5B). Inter for headings, DM Sans for body.';
```

2. Update the `getFoundationDoc` mock (line 52-57) to use the simplified doc:
```ts
  getFoundationDoc: vi.fn().mockResolvedValue({
    type: 'design-principles',
    content: VALID_DESIGN_DOC,
    generatedAt: '2026-02-17',
    editedAt: null,
  }),
```
(This is actually unchanged — it already references `VALID_DESIGN_DOC`.)

3. Delete the two prerequisite gate tests (lines 268-303):
   - `'returns 400 for mode_select when design-principles doc is missing'`
   - `'returns 400 for mode_select when design-principles has invalid tokens'`

**Step 2: Run tests to verify failing/updated state**

Run: `npm test -- --run src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`
Expected: Tests may fail if the route still imports `extractBrandFromDesignPrinciples` from the deleted import. Proceed to Step 3.

**Step 3: Remove the prerequisite gate and import from the route**

In `src/app/api/painted-door/[id]/chat/route.ts`:

1. Delete line 10:
```ts
import { extractBrandFromDesignPrinciples } from '@/lib/foundation-tokens';
```

2. Delete the prerequisite gate block (lines 154-168):
```ts
    // Prerequisite: validate design-principles Foundation doc has valid tokens
    const designDoc = await getFoundationDoc(ideaId, 'design-principles');
    if (!designDoc) {
      return Response.json(
        { error: 'Missing design-principles Foundation document. Generate it first before starting the website build.' },
        { status: 400 },
      );
    }
    const tokenCheck = extractBrandFromDesignPrinciples(designDoc.content, '');
    if (!tokenCheck.ok) {
      return Response.json(
        { error: `Design-principles doc has invalid tokens: ${tokenCheck.error}. Regenerate the design-principles Foundation document to fix this.` },
        { status: 400 },
      );
    }
```

> **Behavior change:** The mode_select endpoint no longer validates design-principles tokens upfront. If the design-principles doc is missing or invalid, the build will proceed and the LLM will provide tokens via lock_brand at Stage 0 instead.

3. Remove `getFoundationDoc` from the `@/lib/db` import at line 9. The prerequisite gate was its only call site in this file. `getAllFoundationDocs` and `getIdeaFromDb` are still used. Update line 9 from:
   ```ts
   import { getAllFoundationDocs, getFoundationDoc, getIdeaFromDb } from '@/lib/db';
   ```
   To:
   ```ts
   import { getAllFoundationDocs, getIdeaFromDb } from '@/lib/db';
   ```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`
Expected: All remaining tests PASS.

**Step 5: Commit**

```
git add src/app/api/painted-door/[id]/chat/route.ts src/app/api/painted-door/[id]/chat/__tests__/route.test.ts
git commit -m "refactor: remove prerequisite token gate from chat route"
```

---

### Task 6: Update system prompt to mention `lock_brand` at Stage 0

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/route.ts:118`

**Step 1: Add brand locking instructions to the system prompt**

In `src/app/api/painted-door/[id]/chat/route.ts`, in the `assembleSystemPrompt` function, find the "Copy Locking" paragraph (currently at approximately line 118 after the prerequisite gate removal). After the existing Copy Locking paragraph, add a Brand Locking paragraph.

Find:
```ts
**Copy Locking:** After each copy-producing stage, call \`lock_section_copy({ type, copy })\` to lock the section into the PageSpec accumulator. The accumulator builds the full page spec incrementally. All 8 section types must be locked before \`assemble_site_files\` can run. At Stage 4 (Final Review), use \`lock_page_meta({ metaTitle, metaDescription, ogDescription })\` to lock page metadata. Use \`overwrite: true\` in lock_section_copy only during final review to revise previously locked copy.
```

Replace with:
```ts
**Brand Locking:** At Stage 0 (Extract & Validate Ingredients), after reading the design-principles Foundation document, call \`lock_brand\` with siteName, tagline, theme, all 9 color hex codes, and all 3 font names from the design principles. This captures the brand identity for site assembly. You may call \`lock_brand\` with \`overwrite: true\` during final review to revise brand tokens.

**Copy Locking:** After each copy-producing stage, call \`lock_section_copy({ type, copy })\` to lock the section into the PageSpec accumulator. The accumulator builds the full page spec incrementally. All 8 section types must be locked before \`assemble_site_files\` can run. At Stage 4 (Final Review), use \`lock_page_meta({ metaTitle, metaDescription, ogDescription })\` to lock page metadata. Use \`overwrite: true\` in lock_section_copy only during final review to revise previously locked copy.
```

**Step 2: Run tests to verify no regressions**

Run: `npm test -- --run src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`
Expected: All tests PASS (system prompt change, no logic change).

**Step 3: Commit**

```
git add src/app/api/painted-door/[id]/chat/route.ts
git commit -m "feat: add lock_brand instructions to website builder system prompt"
```

---

### Task 7: Simplify design-principles prompt to prose-only

**Files:**
- Modify: `src/lib/frameworks/prompts/design-principles/prompt.md:28-91`

**Step 1: Replace Phase 3 with prose-only instructions**

In `src/lib/frameworks/prompts/design-principles/prompt.md`, replace everything from `## Phase 3` (line 28) through the end of the file (line 91) with:

```markdown
## Phase 3: Produce Design Principles Document

Write the complete design-principles document:

### Design Principles (3-5)
Each principle should cover one of:
- Typography philosophy (why these fonts, what they communicate)
- Color philosophy (why this palette, what the hierarchy achieves)
- Spacing and density (generous vs. compact, why)
- Overall feeling (the emotional response the design should evoke)

### Color Palette
Describe the complete color palette with hex values inline (e.g., "a warm coral `#FF6B5B` for primary actions"):
- **Primary color** (CTAs, buttons) and a lighter variant for hover states
- **Background** and an elevated surface color (for cards)
- **Text colors**: primary, secondary, and muted
- **Accent color** (highlights, success states — distinct from primary)
- **Border color** (subtle, visible but not dominant)

All colors must be 6-digit hex codes (`#RRGGBB`). No 3-digit shortcuts, no named colors.

### Typography
Specify three fonts from Google Fonts:
- **Heading font**: What it communicates, why it fits the brand
- **Body font**: Readability and personality
- **Monospace font**: For code or technical content

### Theme
State whether the site uses a **light** or **dark** theme and explain why it fits the audience and brand personality.

### Contrast
Ensure that the primary text color on the background color has sufficient contrast for readability (WCAG AA: at least 4.5:1 contrast ratio).

**WAIT for the user's response before continuing.**

## Key Rules

1. Every color must be a 6-digit hex code. No 3-digit shortcuts, no named colors, no RGB/HSL.
2. Every font must be available on Google Fonts. No system fonts (Arial, Helvetica, Times New Roman).
3. Text on background should meet WCAG AA contrast (4.5:1). If it doesn't, adjust.
4. The design must serve conversion. The visual hierarchy must guide the eye from headline to CTA.
5. Match the brand voice. A playful brand with a corporate design creates cognitive dissonance.
```

**Step 2: Run tests to verify no regressions**

Run: `npm test -- --run`
Expected: All tests PASS (prompt content isn't tested directly).

**Step 3: Commit**

```
git add src/lib/frameworks/prompts/design-principles/prompt.md
git commit -m "refactor: simplify design-principles prompt to prose-only, remove JSON token requirements"
```

---

### Task 8: Simplify foundation.ts WAIT-stripping hack

**Files:**
- Modify: `src/lib/agent-tools/foundation.ts:83-95`

**Step 1: Remove the `json:design-tokens` mandate from the one-shot instruction**

In `src/lib/agent-tools/foundation.ts`, find the `design-principles` case (lines 83-95). Replace:

```ts
    case 'design-principles': {
      const frameworkPrompt = getFrameworkPrompt('design-principles');
      if (frameworkPrompt) {
        // The framework prompt has multi-phase WAIT instructions for interactive use.
        // For one-shot generation, strip WAITs and instruct complete output.
        const stripped = frameworkPrompt.replace(/\*\*WAIT for the user's response before continuing\.\*\*/g, '');
        prompt += stripped;
        prompt += '\n\nIMPORTANT: This is a one-shot generation. Complete ALL phases in a single response. You MUST include the ```json:design-tokens``` code block with all required fields. Do not stop early or ask for feedback.';
      } else {
        prompt += 'Generate a design principles document with a json:design-tokens block.';
      }
      break;
    }
```

With:

```ts
    case 'design-principles': {
      const frameworkPrompt = getFrameworkPrompt('design-principles');
      if (frameworkPrompt) {
        // The framework prompt has multi-phase WAIT instructions for interactive use.
        // For one-shot generation, strip WAITs and instruct complete output.
        const stripped = frameworkPrompt.replace(/\*\*WAIT for the user's response before continuing\.\*\*/g, '');
        prompt += stripped;
        prompt += '\n\nIMPORTANT: This is a one-shot generation. Complete ALL phases in a single response. Do not stop early or ask for feedback.';
      } else {
        prompt += 'Generate a design principles document covering color palette, typography, and theme.';
      }
      break;
    }
```

**Step 2: Run tests to verify no regressions**

Run: `npm test -- --run`
Expected: All tests PASS.

**Step 3: Commit**

```
git add src/lib/agent-tools/foundation.ts
git commit -m "refactor: remove json:design-tokens mandate from foundation agent one-shot instruction"
```

---

### Task 9: Delete `foundation-tokens.ts` and its test file

**Files:**
- Delete: `src/lib/foundation-tokens.ts`
- Delete: `src/lib/__tests__/foundation-tokens.test.ts`

**Step 1: Verify no remaining imports**

Use the Grep tool to search for any remaining references to `foundation-tokens` in `src/`. Expected: No results. (The imports were removed in Tasks 4 and 5.) If any references remain, they must be removed first before proceeding.

**Step 2: Delete the files and commit**

```
git rm src/lib/foundation-tokens.ts src/lib/__tests__/foundation-tokens.test.ts
```

**Step 3: Run tests to verify no regressions**

Run: `npm test -- --run`
Expected: All tests PASS (no code references the deleted files).

**Step 4: Commit**

```
git commit -m "chore: delete foundation-tokens.ts regex parser and its tests"
```

---

### Task 10: Full verification

**Step 1: Run the full test suite**

Run: `npm test -- --run`
Expected: All tests PASS with 0 failures.

**Step 2: Run the production build**

Run: `npm run build`
Expected: Build succeeds with exit code 0. (Per lessons-learned: the build catches TypeScript errors that tests miss.)

**Step 3: Run lint**

Run: `npm run lint`
Expected: No lint errors.

If any step fails, fix the issue and re-verify before proceeding.

---

### Task 11: Update architecture docs

**Files:**
- Modify: `docs/architecture.md`

**Step 1: Update the architecture doc**

In `docs/architecture.md`, search for any references to `foundation-tokens` or the token extraction flow. If the Module Dependency Map or any diagram references `foundation-tokens.ts`, remove it. If the website agent flow diagram references "extract tokens from design-principles," update it to describe the new `lock_brand` tool flow.

Scan for relevant sections and make minimal edits to reflect the new architecture:
- Token extraction is replaced by `lock_brand` tool call
- `foundation-tokens.ts` no longer exists
- Brand flows through `session.artifacts.brand` instead of regex parsing

**Step 2: Commit**

```
git add docs/architecture.md
git commit -m "docs: update architecture for lock_brand replacing token extraction"
```

---

## Decision Log

### Summary
| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Where to store brand during build | `session.artifacts.brand` | Closure-only, separate Redis key |
| 2 | siteUrl handling in lock_brand | Omit from tool input, resolve later | LLM provides siteUrl, hardcode empty |
| 3 | WCAG contrast on lock_brand | Warning only (brand still saved) | Hard error, no check at all |
| 4 | Closure `brand` sync | lock_brand sets both session + closure | Session-only (break downstream tools) |
| 5 | Test strategy for evaluate_brand | Brand in session mock | Mock getPaintedDoorSite for preload, call lock_brand in test |

### Appendix: Decision Details

#### Decision 1: Where to store brand during build
**Chose:** `session.artifacts.brand` (persisted to Redis via existing session storage)
**Why:** This matches the `pageSpec` pattern — both are accumulated data that the LLM builds incrementally during the build session. Storing in the session means brand survives page refreshes and session resumption. The BuildSession type already has an `artifacts` bag, and adding `brand?: BrandIdentity` is a one-line type change.
**Alternatives rejected:**
- Closure-only: Would lose brand on page refresh (the closure is re-created per request). The preload from `PaintedDoorSite` handles rebuilds, but first builds would lose brand if the user refreshes mid-build.
- Separate Redis key: Over-engineering — the session already has a well-tested persistence mechanism. A separate key adds TTL management complexity for no benefit.

#### Decision 2: siteUrl handling in lock_brand
**Chose:** lock_brand omits siteUrl entirely (set to `''`). `assemble_site_files` resolves it from the existing site record (for rebuilds) or leaves it empty (for first builds, where it's set later by `finalize_site`).
**Why:** The LLM doesn't know the Vercel deployment URL when it calls lock_brand at Stage 0. The URL is determined later during deployment. The current code already resolves siteUrl in `assemble_site_files` from `getPaintedDoorSite()` — this logic moves cleanly to the new implementation. For first builds, templates handle empty siteUrl gracefully (JSON-LD and sitemap use it, but they're updated on subsequent pushes after the URL is known).
**Alternatives rejected:**
- LLM provides siteUrl: The LLM can't know the URL before Vercel deployment. Would require hallucination or a separate lookup tool.
- Hardcode empty forever: Would break sitemap and JSON-LD on rebuilds where the URL is already known.

#### Decision 3: WCAG contrast on lock_brand
**Chose:** Warning only — brand is saved even if contrast fails, but the warning is returned to the LLM.
**Why:** The design doc specifies this. A warning lets the LLM self-correct (it can call lock_brand again with overwrite:true and better colors). A hard error would block the build for aesthetic issues. The evaluate_brand tool also checks contrast independently, providing a second check.
**Alternatives rejected:**
- Hard error: Would recreate the brittleness of the old prerequisite gate — exactly what we're trying to eliminate.
- No check at all: Misses an easy opportunity to improve accessibility. The warning costs nothing and may help.

#### Decision 4: Closure `brand` sync
**Chose:** `lock_brand` sets both `session.artifacts.brand` (persistent) and the closure `brand` variable (for same-request use by downstream tools).
**Why:** Downstream tools (`create_repo`, `push_files`, `finalize_site`) already check `if (!brand)` using the closure variable. Changing them to read from session would require refactoring 4 tools that aren't otherwise being modified. Setting the closure in lock_brand is a single line that preserves backward compatibility.
**Alternatives rejected:**
- Session-only: Would require modifying create_repo, push_files, finalize_site, and update_file to read brand from session. More changes, more risk, same outcome.

#### Decision 5: Test strategy for evaluate_brand
**Chose:** Put brand directly in the session mock via the updated `makeSession(sections, brand)` helper.
**Why:** Tests should be explicit about their dependencies. Mocking the session with brand makes it clear what evaluate_brand reads. This matches the test pattern for pageSpec (also in the session mock).
**Alternatives rejected:**
- Mock `getPaintedDoorSite` to return a site with brand: Tests the preload path, not the lock_brand → evaluate path. Less direct.
- Call lock_brand in the test: Requires full session save/load mocking. More complex for no additional coverage (lock_brand has its own tests).
