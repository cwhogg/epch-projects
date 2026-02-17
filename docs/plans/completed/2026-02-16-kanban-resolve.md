# Kanban Board Resolution Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Resolve 20 actionable Kanban board items via mechanical refactoring — extract duplicated code, split oversized files, update stale docs, standardize logging.

**Source Design Doc:** N/A — items sourced from Kanban triage results in `docs/kanban/completed/KB-*.md`

**Architecture:** No architectural changes. All tasks are mechanical: extract duplicated functions to shared modules, split large files along existing seams, update documentation to match current source, add module prefixes to log calls. No new features, no API changes, no behavioral changes.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Tailwind CSS 4, Vercel, Upstash Redis, Anthropic SDK, OpenAI SDK, SerpAPI, Google APIs

---

## Skipped Items (CLOSE verdicts — no action needed)

| KB | Title | Reason |
|----|-------|--------|
| KB-001 | Analysis tab negative route matching | False positive — code already fixed by nav redesign |
| KB-010 | painted-door-templates.ts exceeds 944 lines | Well-structured code generator — length is content density |
| KB-011 | seo-analysis.ts exceeds 898 lines | Cohesive data-flow pipeline with section comments |
| KB-017 | agent-tools/content.ts exceeds 569 lines | Tools share closure state — splitting breaks architecture |
| KB-019 | agent-tools/critique.ts exceeds 529 lines | Same — cohesive pipeline with shared mutable closure state |
| KB-021 | seo-knowledge.ts exceeds 518 lines | Cohesive SEO data registry — all data serves one domain |

---

### Task 1: Add test commands to CLAUDE.md

**KBs:** KB-023

**Files:**
- Modify: `CLAUDE.md`

**Step 1:** Add test commands to the Commands section.

In `CLAUDE.md`, after line 24 (`- \`npm run lint\` — eslint`), add:
```
- `npm test` — run tests once (vitest)
- `npm run test:watch` — run tests in watch mode
```

**Step 2:** Run `npm run build` to verify compilation.

**Step 3:** Run `npm test` to verify tests pass.

**Step 4:** Commit.
```bash
git add CLAUDE.md
git commit -m "docs: add test commands to CLAUDE.md"
```

---

### Task 2: Update stale documentation

**KBs:** KB-024, KB-025, KB-026

**Files:**
- Modify: `docs/Agent Tools & Skills.md`
- Modify: `docs/architecture.md`
- Modify: `docs/design/design-principles.md`

This task updates three stale docs. Read each file fully before editing.

**Step 1:** Update `docs/Agent Tools & Skills.md`.

Read the full file first. Then make these changes:
- Update the overview table: change agent count from 4 to 6, tool count from 44 to 53
- Add a **Foundation Agent** section (after the existing agent sections) documenting 3 tools: `load_foundation_docs`, `generate_foundation_doc`, `load_design_seed`. Reference `src/lib/agent-tools/foundation.ts` for exact tool names and descriptions.
- Add a **Content Critique Agent** section documenting 6 tools: `generate_draft`, `run_critiques`, `editor_decision`, `revise_draft`, `summarize_round`, `save_content`. Reference `src/lib/agent-tools/critique.ts`.
- Add an **Advisors** section listing all 13 advisors. Read `src/lib/advisors/registry.ts` to get the exact list of ids, names, and roles.
- Fix the BrandIdentity interface block: add `?` to `seoDescription` and `landingPage` to match `src/types/index.ts` (lines 171 and 186 where both are optional).
- Update the File Locations tree to include `foundation.ts` and `critique.ts`.

**Step 2:** Update `docs/architecture.md`.

Read the full file first. Then make these changes:
- Line 239: Replace `"4 advisors: Richard Rumelt, April Dunford,<br/>Brand Copywriter, SEO Expert"` with a count of 13 and the full advisor list. Read `src/lib/advisors/registry.ts` for the exact names.
- Line 720: Change `"4-advisor virtual board registry"` to `"13-advisor virtual board registry"`.
- Add a Frameworks subgraph after the Advisors subgraph (around line 242). Read `src/lib/frameworks/` to understand the structure: `registry.ts`, `types.ts`, `framework-loader.ts`, `index.ts`, and `prompts/` with 3 framework prompt sets (`content-inc-model`, `forever-promise`, `value-metric`).
- Add a frameworks node to the Module Dependency Map's Support subgraph. Do NOT add edges — no callers exist yet.
- Add a row for `src/lib/frameworks/` in the Core Library table (around line 720).

**Step 3:** Update `docs/design/design-principles.md`.

- Line 207: Replace `"Logo left, nav links right."` with `"Logo left, 3 text nav links right (Projects, Ideation, Analytics)."`
- Line 210: Replace `"Icon + label for each pipeline stage."` with `"3 tabs with icon + label: Projects, Ideation, Analytics. Pipeline stages accessed through project detail views."`

**Step 4:** Run `npm run build` to verify compilation.

**Step 5:** Run `npm test` to verify tests pass.

**Step 6:** Commit.
```bash
git add "docs/Agent Tools & Skills.md" docs/architecture.md docs/design/design-principles.md
git commit -m "docs: update stale Agent Tools, architecture, and design-principles docs"
```

---

### Task 3: Extract shared analysis style utilities

**KBs:** KB-003, KB-004, KB-007

**Files:**
- Create: `src/lib/analysis-styles.ts`
- Create: `src/app/analyses/[id]/utils.ts`
- Create: `src/lib/__tests__/analysis-styles.test.ts`
- Modify: `src/app/analyses/[id]/analysis/page.tsx`
- Modify: `src/app/analyses/[id]/page.tsx`
- Modify: `src/app/page.tsx`

Three sets of duplicated style utility functions exist across analysis pages. This task extracts them to shared modules.

**Step 1:** Write tests for the shared utilities.

Create `src/lib/__tests__/analysis-styles.test.ts`:

```typescript
import { getBadgeClass, getConfidenceStyle, getWebsiteStatusStyle, getWebsiteStatusLabel } from '../analysis-styles';

describe('getBadgeClass', () => {
  it('returns badge-success for Tier 1', () => {
    expect(getBadgeClass('Tier 1')).toBe('badge-success');
  });
  it('returns badge-warning for Tier 2', () => {
    expect(getBadgeClass('Tier 2')).toBe('badge-warning');
  });
  it('returns badge-danger for Tier 3', () => {
    expect(getBadgeClass('Tier 3')).toBe('badge-danger');
  });
  it('returns badge-neutral for unknown', () => {
    expect(getBadgeClass('Unknown')).toBe('badge-neutral');
  });
});

describe('getConfidenceStyle', () => {
  it('returns emerald for High', () => {
    expect(getConfidenceStyle('High')).toEqual({ color: 'var(--accent-emerald)' });
  });
  it('returns amber for Medium', () => {
    expect(getConfidenceStyle('Medium')).toEqual({ color: 'var(--accent-amber)' });
  });
  it('returns danger for Low', () => {
    expect(getConfidenceStyle('Low')).toEqual({ color: 'var(--color-danger)' });
  });
  it('returns muted for unknown', () => {
    expect(getConfidenceStyle('Other')).toEqual({ color: 'var(--text-muted)' });
  });
});

describe('getWebsiteStatusStyle', () => {
  it('returns emerald for live', () => {
    const style = getWebsiteStatusStyle('live');
    expect(style.background).toContain('16, 185, 129');
    expect(style.color).toBe('var(--accent-emerald)');
  });
  it('returns amber for deploying', () => {
    const style = getWebsiteStatusStyle('deploying');
    expect(style.background).toContain('245, 158, 11');
    expect(style.color).toBe('var(--accent-amber)');
  });
  it('returns amber for pushing', () => {
    const style = getWebsiteStatusStyle('pushing');
    expect(style.color).toBe('var(--accent-amber)');
  });
  it('returns amber for generating', () => {
    const style = getWebsiteStatusStyle('generating');
    expect(style.color).toBe('var(--accent-amber)');
  });
  it('returns danger for failed', () => {
    const style = getWebsiteStatusStyle('failed');
    expect(style.background).toContain('248, 113, 113');
    expect(style.color).toBe('var(--color-danger)');
  });
  it('returns muted for unknown status', () => {
    const style = getWebsiteStatusStyle('idle');
    expect(style.color).toBe('var(--text-muted)');
  });
});

describe('getWebsiteStatusLabel', () => {
  it('capitalizes first letter', () => {
    expect(getWebsiteStatusLabel('live')).toBe('Live');
    expect(getWebsiteStatusLabel('deploying')).toBe('Deploying');
    expect(getWebsiteStatusLabel('failed')).toBe('Failed');
  });
});
```

**Step 2:** Run tests to verify they fail.

Run: `npm test -- src/lib/__tests__/analysis-styles.test.ts`
Expected: FAIL — module not found.

**Step 3:** Create `src/lib/analysis-styles.ts`.

```typescript
export function getBadgeClass(rec: string) {
  switch (rec) {
    case 'Tier 1': return 'badge-success';
    case 'Tier 2': return 'badge-warning';
    case 'Tier 3': return 'badge-danger';
    default: return 'badge-neutral';
  }
}

export function getConfidenceStyle(conf: string) {
  switch (conf) {
    case 'High': return { color: 'var(--accent-emerald)' };
    case 'Medium': return { color: 'var(--accent-amber)' };
    case 'Low': return { color: 'var(--color-danger)' };
    default: return { color: 'var(--text-muted)' };
  }
}

export function getWebsiteStatusStyle(status: string) {
  switch (status) {
    case 'live': return { background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)' };
    case 'deploying':
    case 'pushing':
    case 'generating': return { background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)' };
    case 'failed': return { background: 'rgba(248, 113, 113, 0.15)', color: 'var(--color-danger)' };
    default: return { background: 'rgba(113, 113, 122, 0.1)', color: 'var(--text-muted)' };
  }
}

export function getWebsiteStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
```

**Step 4:** Create `src/app/analyses/[id]/utils.ts`.

```typescript
export function getHeaderGradient(recommendation: string): string {
  switch (recommendation) {
    case 'Tier 1': return 'radial-gradient(ellipse at top left, rgba(52, 211, 153, 0.1) 0%, transparent 50%)';
    case 'Tier 2': return 'radial-gradient(ellipse at top left, rgba(251, 191, 36, 0.08) 0%, transparent 50%)';
    case 'Tier 3': return 'radial-gradient(ellipse at top left, rgba(248, 113, 113, 0.08) 0%, transparent 50%)';
    default: return 'none';
  }
}
```

**Step 5:** Run tests to verify they pass.

Run: `npm test -- src/lib/__tests__/analysis-styles.test.ts`
Expected: PASS

**Step 6:** Update `src/app/analyses/[id]/analysis/page.tsx`.

- Add imports at the top (after existing imports):
  ```typescript
  import { getBadgeClass, getConfidenceStyle } from '@/lib/analysis-styles';
  import { getHeaderGradient } from './utils';
  ```
- Delete the local `getBadgeClass` function (lines 18–25).
- Delete the local `getConfidenceStyle` function (lines 27–34).
- Replace the `getHeaderGradient` arrow function (lines 66–73) with a call: `const headerGradient = getHeaderGradient(analysis.recommendation);` and update the usage from `getHeaderGradient()` to `headerGradient`.

**Step 7:** Update `src/app/analyses/[id]/page.tsx`.

- Add imports at the top:
  ```typescript
  import { getBadgeClass, getConfidenceStyle, getWebsiteStatusStyle, getWebsiteStatusLabel } from '@/lib/analysis-styles';
  import { getHeaderGradient } from './utils';
  ```
- Delete the local `getBadgeClass` function (lines 46–53).
- Delete the local `getConfidenceStyle` function (lines 55–62).
- Delete the local `getWebsiteStatusStyle` function (lines 64–73). **Important:** The local version returns `{ bg, color }` but the shared version returns `{ background, color }`. Update all call sites from `.bg` to `.background`. After replacing, search the file for any remaining `.bg` references to confirm none were missed.
- Delete the local `getWebsiteStatusLabel` function (lines 75–77).
- Replace the `getHeaderGradient` arrow function (lines 192–199) with `const headerGradient = getHeaderGradient(analysis.recommendation);` and update usage.

**Step 8:** Update `src/app/page.tsx`.

- Add import at the top:
  ```typescript
  import { getBadgeClass, getWebsiteStatusStyle, getWebsiteStatusLabel } from '@/lib/analysis-styles';
  ```
- Delete the local `getBadgeClass` function (lines 18–25).
- Replace the inline website status ternary chains (lines 164–177) with:
  ```tsx
  style={getWebsiteStatusStyle(project.websiteStatus)}
  ```
  And replace the inline capitalization (line 177) with:
  ```tsx
  {getWebsiteStatusLabel(project.websiteStatus)}
  ```

**Step 9:** Run `npm run build` to verify compilation.

**Step 10:** Run `npm test` to verify all tests pass.

**Step 11:** Commit.
```bash
git add src/lib/analysis-styles.ts src/lib/__tests__/analysis-styles.test.ts "src/app/analyses/[id]/utils.ts" "src/app/analyses/[id]/analysis/page.tsx" "src/app/analyses/[id]/page.tsx" src/app/page.tsx
git commit -m "refactor: extract shared analysis style utilities (KB-003, KB-004, KB-007)"
```

---

### Task 4: Extract duplicated badge styles in foundation page

**KBs:** KB-002

**Files:**
- Modify: `src/app/analyses/[id]/foundation/page.tsx`

The foundation page has identical inline style objects for version and edited badges in both the expanded card (lines 362–368, 370–378) and collapsed card (lines 491–497, 500–508) branches.

**Step 1:** Read `src/app/analyses/[id]/foundation/page.tsx` fully.

**Step 2:** Add two `React.CSSProperties` constants inside the component, before the return statement. Find the right location by looking for where the component's JSX starts.

```typescript
const versionBadgeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 500,
  color: 'var(--text-muted)', background: 'var(--bg-elevated)',
  padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)',
};
const editedBadgeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 600,
  letterSpacing: '0.05em', textTransform: 'uppercase' as const,
  color: 'var(--accent-coral)', background: 'var(--accent-coral-soft)',
  padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)',
};
```

**Step 3:** Replace all 4 inline style objects:
- Expanded version badge (~line 362): replace `style={{...}}` with `style={versionBadgeStyle}`
- Expanded edited badge (~line 370): replace `style={{...}}` with `style={editedBadgeStyle}`
- Collapsed version badge (~line 491): replace `style={{...}}` with `style={versionBadgeStyle}`
- Collapsed edited badge (~line 500): replace `style={{...}}` with `style={editedBadgeStyle}`

**Step 4:** Ensure `React` is imported at the top of the file (needed for `React.CSSProperties`). If it's not already imported, add it.

**Step 5:** Run `npm run build` to verify compilation.

**Step 6:** Run `npm test` to verify tests pass.

**Step 7:** Commit.
```bash
git add "src/app/analyses/[id]/foundation/page.tsx"
git commit -m "refactor: extract duplicated badge styles in foundation page (KB-002)"
```

---

### Task 5: Extract getDashboardData helpers

**KBs:** KB-005
**Ordering:** Complete Task 3 before this task — both modify `src/app/analyses/[id]/page.tsx`.

**Files:**
- Modify: `src/app/analyses/[id]/page.tsx`

The `getDashboardData` function (lines 79–175) has two extractable blocks. This task extracts them as module-private helpers in the same file.

**Step 1:** Read `src/app/analyses/[id]/page.tsx` fully (line numbers may have shifted from Task 3).

**Step 2:** Add two helper functions above `getDashboardData`:

```typescript
function parseSeoMetrics(seoData: string | undefined): { agreedKeywords: number; serpValidated: number } {
  if (!seoData) return { agreedKeywords: 0, serpValidated: 0 };
  try {
    const seo = JSON.parse(seoData);
    return {
      agreedKeywords: seo.synthesis?.comparison?.agreedKeywords?.length ?? 0,
      serpValidated: seo.synthesis?.serpValidated?.filter((v: { hasContentGap: boolean }) => v.hasContentGap)?.length ?? 0,
    };
  } catch {
    return { agreedKeywords: 0, serpValidated: 0 };
  }
}

async function fetchGscMetrics(ideaId: string): Promise<{ gscImpressions: number | null; gscClicks: number | null; gscCTR: number | null }> {
  const gscData = await getGSCAnalytics(ideaId).catch(() => null);
  if (!gscData?.timeSeries?.length) return { gscImpressions: null, gscClicks: null, gscCTR: null };
  const last7 = gscData.timeSeries.slice(-7);
  const gscImpressions = last7.reduce((sum: number, d: { impressions: number }) => sum + d.impressions, 0);
  const gscClicks = last7.reduce((sum: number, d: { clicks: number }) => sum + d.clicks, 0);
  const gscCTR = gscImpressions > 0 ? (gscClicks / gscImpressions) * 100 : 0;
  return { gscImpressions, gscClicks, gscCTR };
}
```

**Step 3:** In `getDashboardData`, replace the SEO parsing block (the `let agreedKeywords = 0; let serpValidated = 0;` block through the try/catch) with:
```typescript
const { agreedKeywords, serpValidated } = parseSeoMetrics(content?.seoData);
```

**Step 4:** Replace the GSC metrics block (the `let gscImpressions` through the closing `}` of `if (gscLink)`) with:
```typescript
const gscMetrics = gscLink ? await fetchGscMetrics(analysis.ideaId) : { gscImpressions: null, gscClicks: null, gscCTR: null };
const { gscImpressions, gscClicks, gscCTR } = gscMetrics;
```

**Step 5:** Run `npm run build` to verify compilation.

**Step 6:** Run `npm test` to verify tests pass.

**Step 7:** Commit.
```bash
git add "src/app/analyses/[id]/page.tsx"
git commit -m "refactor: extract getDashboardData helpers (KB-005)"
```

---

### Task 6: Simplify competitiveness badge ternaries

**KBs:** KB-006

**Files:**
- Modify: `src/components/SEODeepDive.tsx`

**Step 1:** Read `src/components/SEODeepDive.tsx`. Find the competitiveness badge ternary chains (around lines 145–164).

**Step 2:** Add a lookup object above the return statement (or above the JSX that uses it):

```typescript
const competitivenessStyles: Record<string, { background: string; color: string }> = {
  Low: { background: 'rgba(52, 211, 153, 0.1)', color: 'var(--accent-emerald)' },
  Medium: { background: 'rgba(251, 191, 36, 0.1)', color: 'var(--accent-amber)' },
  High: { background: 'rgba(248, 113, 113, 0.1)', color: 'var(--color-danger)' },
};
```

**Step 3:** Replace the `style={{...}}` block containing the ternary chains with:
```tsx
style={competitivenessStyles[kw.estimatedCompetitiveness ?? ''] ?? competitivenessStyles.High}
```

The existing code uses 'High' styling as the default fallback, so `?? competitivenessStyles.High` preserves that behavior.

**Step 4:** Run `npm run build` to verify compilation.

**Step 5:** Run `npm test` to verify tests pass.

**Step 6:** Commit.
```bash
git add src/components/SEODeepDive.tsx
git commit -m "refactor: replace competitiveness ternary chains with lookup object (KB-006)"
```

---

### Task 7: Extract GitHub/Vercel API helpers to shared module

**KBs:** KB-009, KB-012, KB-015

**Files:**
- Create: `src/lib/github-api.ts`
- Modify: `src/lib/agent-tools/website.ts`
- Modify: `src/lib/painted-door-agent.ts`

Four GitHub/Vercel helper functions are duplicated between `painted-door-agent.ts` (lines 71–304) and `agent-tools/website.ts` (lines 24–246). The `website.ts` versions are canonical (they have the optional `message` parameter on `pushFilesToGitHub`).

**Note:** KB-009 triage suggests the filename `github-vercel-api.ts` while KB-015 suggests `github-api.ts`. This plan uses `github-api.ts` (per KB-015) since all four functions are GitHub/Vercel API helpers and the shorter name is sufficient.

**Step 1:** Read `src/lib/agent-tools/website.ts` lines 20–246 to get the canonical helper implementations.

**Step 2:** Create `src/lib/github-api.ts` by extracting the four functions from `website.ts`. Copy lines 24–246 (the `createGitHubRepo`, `pushFilesToGitHub`, `createVercelProject`, `triggerDeployViaGitPush` functions) into the new file. Add `export` to each function. Add the necessary imports at the top (these will reference `Octokit` or `fetch` — check what the functions actually use).

**Step 3:** In `src/lib/agent-tools/website.ts`:
- Delete lines 20–246 (the comment `// GitHub API helpers...` through the end of `triggerDeployViaGitPush`).
- Add import at the top: `import { createGitHubRepo, pushFilesToGitHub, createVercelProject, triggerDeployViaGitPush } from '@/lib/github-api';`

**Step 4:** In `src/lib/painted-door-agent.ts`:
- Delete lines 71–304 (all four duplicate helper functions: `createGitHubRepo`, `pushFilesToGitHub`, `createVercelProject`, `triggerDeployViaGitPush`).
- **Keep** `getProjectProductionUrl` (lines 306–337) and `waitForDeployment` (lines 339–382) — these are V1-only with no duplicates.
- Add import at the top: `import { createGitHubRepo, pushFilesToGitHub, createVercelProject, triggerDeployViaGitPush } from './github-api';`

**Step 5:** Run `npm run build` to verify compilation. Pay attention to any type errors from the import — the `painted-door-agent.ts` call site at line ~433 passes `pushFilesToGitHub(repo.owner, repo.name, allFiles)` without a `message` argument, which should work with the optional parameter default.

**Step 6:** Run `npm test` to verify tests pass.

**Step 7:** Commit.
```bash
git add src/lib/github-api.ts src/lib/agent-tools/website.ts src/lib/painted-door-agent.ts
git commit -m "refactor: extract GitHub/Vercel API helpers to shared module (KB-009, KB-012, KB-015)"
```

---

### Task 8: Split analytics page — extract inline components

**KBs:** KB-008

**Files:**
- Create: `src/components/SummaryCard.tsx`
- Create: `src/components/ChecklistItem.tsx`
- Create: `src/components/PropertySelectorWithHelper.tsx`
- Create: `src/components/GSCSetupChecklist.tsx`
- Create: `src/components/WeeklySummaryCard.tsx`
- Modify: `src/app/analyses/[id]/analytics/page.tsx`

The analytics page (1293 lines) has 5 inline component definitions that communicate exclusively through props. This task extracts each to its own file.

**Step 1:** Read `src/app/analyses/[id]/analytics/page.tsx` fully to understand all components and their prop dependencies.

**Step 2:** Extract `SummaryCard` (lines 109–120) to `src/components/SummaryCard.tsx`.
- Define a props interface based on what the component receives.
- Add `'use client';` at the top if the component uses any client-side features (check for useState, useEffect, event handlers).
- Export as default.

**Step 3:** Extract `ChecklistItem` (lines 122–180) to `src/components/ChecklistItem.tsx`.
- Define props interface. This component is interactive (has toggle behavior).
- Add `'use client';` directive.
- Export as default.

**Step 4:** Extract `PropertySelectorWithHelper` (lines 182–426) to `src/components/PropertySelectorWithHelper.tsx`.
- This includes an internal `CopyButton` sub-component (lines 247–264) — keep it in the same file.
- Move the `GSCProperty` interface (lines 34–37) into this file since it's primarily used here.
- Has 3× `useState`, 1× `useEffect`, clipboard API — needs `'use client';`.
- Export as default.

**Step 5:** Extract `GSCSetupChecklist` (lines 428–603) to `src/components/GSCSetupChecklist.tsx`.
- Import `ChecklistItem` from `./ChecklistItem`.
- Has its own state and refresh flow — needs `'use client';`.
- Export as default.

**Step 6:** Extract `WeeklySummaryCard` (lines 605–652) to `src/components/WeeklySummaryCard.tsx`.
- Define props interface. This is a stateless display component.
- Export as default.

**Step 7:** Update `src/app/analyses/[id]/analytics/page.tsx`:
- Remove all 5 inline component definitions.
- Add imports for all 5 extracted components.
- Keep `buildComparisons` (lines 40–85) and `computeSummary` (lines 87–107) in the page file — they are page-specific data transformation functions.
- If `GSCProperty` was used in the page component as well, import it from `PropertySelectorWithHelper` or export it separately.

**Step 8:** Run `npm run build` to verify compilation.

**Step 9:** Run `npm test` to verify tests pass.

**Step 10:** Commit.
```bash
git add src/components/SummaryCard.tsx src/components/ChecklistItem.tsx src/components/PropertySelectorWithHelper.tsx src/components/GSCSetupChecklist.tsx src/components/WeeklySummaryCard.tsx "src/app/analyses/[id]/analytics/page.tsx"
git commit -m "refactor: extract analytics page inline components (KB-008)"
```

---

### Task 9: Split research-agent — extract prompts and parsers

**KBs:** KB-013

**Files:**
- Create: `src/lib/research-agent-prompts.ts`
- Create: `src/lib/research-agent-parsers.ts`
- Modify: `src/lib/research-agent.ts`
- Modify: `src/lib/__tests__/research-agent-parsers.test.ts`

**Step 1:** Read `src/lib/research-agent.ts` fully to understand all functions and their dependencies.

**Step 2:** Create `src/lib/research-agent-prompts.ts`.

Move these from `research-agent.ts`:
- `createPrompt()` function (lines 34–196) — imports `ProductIdea` from `@/types` and `buildExpertiseContext` from `./expertise-profile`.
- `RESEARCH_SYSTEM_PROMPT` constant (lines 523–554).

Export both.

**Step 3:** Create `src/lib/research-agent-parsers.ts`.

Move these from `research-agent.ts`:
- `parseScores` (lines 198–250)
- `parseRecommendation` (lines 252–267)
- `parseConfidence` (lines 269–284)
- `parseRisks` (lines 286–317)
- `parseSummary` (lines 319–337)

Import `Analysis`, `AnalysisScores` from `@/types` as needed. Export all five functions.

**Step 4:** Update `src/lib/research-agent.ts`:
- Remove the moved code.
- Add imports:
  ```typescript
  import { createPrompt, RESEARCH_SYSTEM_PROMPT } from './research-agent-prompts';
  import { parseScores, parseRecommendation, parseConfidence, parseRisks, parseSummary } from './research-agent-parsers';
  ```
- Keep `ANALYSIS_STEPS`, both orchestrators (`runResearchAgent`, `runResearchAgentV2`), `runResearchAgentAuto`, and `buildSEOScoringContext`.

**Step 5:** Update `src/lib/__tests__/research-agent-parsers.test.ts`:
- Change import from `'../research-agent'` to `'../research-agent-parsers'`.
- **Verify** the test file does not import any other symbols from `research-agent` that remain in the original file. If it does, keep a second import for those symbols.

**Step 6:** Run `npm run build` to verify compilation.

**Step 7:** Run `npm test` to verify tests pass. Pay special attention to `research-agent-parsers.test.ts`.

**Step 8:** Commit.
```bash
git add src/lib/research-agent-prompts.ts src/lib/research-agent-parsers.ts src/lib/research-agent.ts src/lib/__tests__/research-agent-parsers.test.ts
git commit -m "refactor: extract research-agent prompts and parsers to separate modules (KB-013)"
```

---

### Task 10: Split content-agent along architectural boundaries

**KBs:** KB-014

**Files:**
- Create: `src/lib/content-context.ts`
- Create: `src/lib/content-vault.ts`
- Create: `src/lib/content-agent-v2.ts`
- Modify: `src/lib/content-agent.ts`
- Modify: multiple importing files (see below)

`content-agent.ts` (652 lines) has three distinct subsystems that should be separate modules. **Critical:** `buildContentContext` is imported by 8 other source files — all must be updated.

**Step 1:** Read `src/lib/content-agent.ts` fully.

**Step 2:** Create `src/lib/content-context.ts`.

Move `buildContentContext` (lines 46–123) into this file. It's an async function that imports from `@/lib/db`, `@/types`, and potentially other modules. Read the function to determine all its imports. Export the function and any types it defines (like `ContentContext` if defined here).

**Step 3:** Create `src/lib/content-vault.ts`.

Move these module-private functions (lines 386–445):
- `getContentDir` (lines 386–388)
- `getFilename` (lines 390–401)
- `writeContentToVault` (lines 403–411)
- `writeCalendarIndex` (lines 413–445)

Add necessary imports (`fs`, `path`, etc.). Export all four.

**Step 4:** Create `src/lib/content-agent-v2.ts`.

Move these (lines 451–638):
- `CONTENT_SYSTEM_PROMPT` (lines 451–486)
- `generateContentPiecesV2` (lines 488–638)

Add necessary imports. This module imports from `./content-context` (for `buildContentContext`) and likely uses agent runner utilities. Export `generateContentPiecesV2`.

**Step 5:** Update `src/lib/content-agent.ts`:
- Remove all moved code.
- Add imports from the three new modules.
- Keep: `generateContentCalendar`, `appendNewPieces`, `generateContentPieces`, `generateSinglePiece`, `generateContentPiecesAuto`.
- Re-export `buildContentContext` from this file so that callers importing it from `content-agent` still work: `export { buildContentContext } from './content-context';`

**Step 6:** Update import paths in files that directly import `buildContentContext`.

These files import `buildContentContext` from `content-agent` — update them to import from `content-context` instead (or rely on the re-export in Step 5):
- `src/lib/publish-pipeline.ts`
- `src/lib/painted-door-agent.ts`
- `src/app/api/content-pipeline/[ideaId]/route.ts`
- `src/lib/agent-tools/foundation.ts`
- `src/lib/agent-tools/website.ts` (also imports `generateContentCalendar` which stays)
- `src/lib/agent-tools/content.ts`
- `src/lib/__tests__/foundation-tools.test.ts`
- `experiments/foundation-validation/validate.ts`

**Use the re-export approach from Step 5.** Do not update the 8 importing files — the re-export ensures backward compatibility. Import path cleanup can be done in a future pass.

**Step 7:** Run `npm run build` to verify compilation.

**Step 8:** Run `npm test` to verify tests pass.

**Step 9:** Commit.
```bash
git add src/lib/content-context.ts src/lib/content-vault.ts src/lib/content-agent-v2.ts src/lib/content-agent.ts
git commit -m "refactor: split content-agent into context, vault, and v2 modules (KB-014)"
```

---

### Task 11: Split foundation page — extract icons and card components

**KBs:** KB-016

**Files:**
- Create: `src/app/analyses/[id]/foundation/FoundationIcons.tsx`
- Create: `src/app/analyses/[id]/foundation/ExpandedDocCard.tsx`
- Create: `src/app/analyses/[id]/foundation/CollapsedDocCard.tsx`
- Modify: `src/app/analyses/[id]/foundation/page.tsx`

The foundation page (633 lines) has 11 SVG icon functions and two large card JSX branches.

**Step 1:** Read `src/app/analyses/[id]/foundation/page.tsx` fully.

**Step 2:** Create `FoundationIcons.tsx` — extract all 11 SVG icon functions (lines 65–159):
`CheckCircleIcon`, `EmptyCircleIcon`, `ReadyCircleIcon`, `ErrorCircleIcon`, `PlayIcon`, `ChevronUpIcon`, `ArrowLeftIcon`, `ChatIcon`, `RefreshIcon`, `RetryIcon`, `WarningIcon`.

Export each as a named export.

**Step 3:** Create `ExpandedDocCard.tsx` — extract the expanded card JSX branch. Read the page to understand what props it needs (doc data, label, advisor info, type, generating state, event handlers for collapse/regenerate). Add `'use client';` if it uses event handlers. Define a props interface.

**Step 4:** Create `CollapsedDocCard.tsx` — extract the collapsed card JSX branch. Similar approach: define props for type, label, advisor, requirements, doc data, card state, generating state, event handlers for expand/generate.

**Step 5:** Update `page.tsx`:
- Import icons from `./FoundationIcons`.
- Import `ExpandedDocCard` and `CollapsedDocCard`.
- Remove the inline icon functions and card JSX branches.
- The page should now be ~100–120 lines: state management, data fetching, and a `.map()` that renders either `ExpandedDocCard` or `CollapsedDocCard`.

**Step 6:** Run `npm run build` to verify compilation.

**Step 7:** Run `npm test` to verify tests pass.

**Step 8:** Commit.
```bash
git add "src/app/analyses/[id]/foundation/FoundationIcons.tsx" "src/app/analyses/[id]/foundation/ExpandedDocCard.tsx" "src/app/analyses/[id]/foundation/CollapsedDocCard.tsx" "src/app/analyses/[id]/foundation/page.tsx"
git commit -m "refactor: extract foundation page icons and card components (KB-016)"
```

---

### Task 12: Deduplicate analytics agent report-building logic

**KBs:** KB-018

**Files:**
- Modify: `src/lib/analytics-agent.ts`
- Modify: `src/lib/agent-tools/analytics.ts`
- Modify: `src/lib/__tests__/analytics-agent.test.ts`

**Note:** `analytics-agent.ts` and `agent-tools/analytics.ts` have an existing circular import (the agent imports `createAnalyticsTools`, and the tools file imports `getWeekId` etc. from the agent). This task adds `getPreviousWeekId` and `buildWeeklyReport` to that existing import direction (tools → agent), which does not create a new cycle. Node module resolution tolerates this, but be aware of the mutual dependency.

**Step 1:** Read `src/lib/analytics-agent.ts` and `src/lib/agent-tools/analytics.ts` fully.

**Step 2:** Export `getPreviousWeekId` from `analytics-agent.ts` — change `function getPreviousWeekId` to `export function getPreviousWeekId`.

**Step 3:** Write retroactive tests for `getPreviousWeekId` in `src/lib/__tests__/analytics-agent.test.ts`:

```typescript
describe('getPreviousWeekId', () => {
  it('returns the previous week for mid-year', () => {
    expect(getPreviousWeekId('2026-W07')).toBe('2026-W06');
  });
  it('handles week 1 rollover to previous year', () => {
    // Verify correct behavior at year boundary
    expect(getPreviousWeekId('2026-W01')).toBe('2025-W52');
  });
});
```

**Step 4:** Run tests to verify `getPreviousWeekId` tests pass: `npm test -- src/lib/__tests__/analytics-agent.test.ts`

**Step 5:** Write failing tests for the new `buildWeeklyReport` function:

```typescript
describe('buildWeeklyReport', () => {
  it('returns zero-padded snapshot for a published piece slug not in GSC data', () => {
    // A published slug with no corresponding GSC page should get a snapshot with 0 impressions/clicks
    // Call buildWeeklyReport with snapshots that don't cover all published slugs
    // Assert the result includes a zero-padded entry for the unmatched slug
  });
  it('calculates correct clicksChange and impressionsChange deltas from previous week', () => {
    // Provide current and previous week snapshots with known values
    // Assert the delta calculations match expected differences
  });
});
```

**Step 6:** Run tests to verify they FAIL (buildWeeklyReport doesn't exist yet): `npm test -- src/lib/__tests__/analytics-agent.test.ts`
Expected: FAIL with "buildWeeklyReport is not a function" or similar.

**Step 7:** Extract `buildWeeklyReport` in `analytics-agent.ts`. Read both files to identify the exact duplicated report-assembly logic:
- In `runAnalyticsAgent` (lines 380–454): the allSnapshots-building, per-piece comparison, report assembly, AND the `saveSiteSnapshot`/`saveWeeklyReport`/`addPerformanceAlerts` calls.
- In `agent-tools/analytics.ts` `save_report` tool (around lines 325–384): similar logic.

Create and export a shared function that encapsulates the duplicated block. Define parameters based on what both call sites provide.

**Step 8:** Run tests to verify `buildWeeklyReport` tests now PASS: `npm test -- src/lib/__tests__/analytics-agent.test.ts`

**Step 9:** Update `runAnalyticsAgent` in `analytics-agent.ts` to call `buildWeeklyReport(...)` instead of the inline assembly (replacing lines 380–454).

**Step 10:** Update `agent-tools/analytics.ts`:
- Import `getPreviousWeekId` and `buildWeeklyReport` from `../analytics-agent`.
- Remove the inline previous-week calculations in `compare_weeks` and `save_report`.
- Replace the report-assembly block in `save_report` with a `buildWeeklyReport(...)` call.

**Step 11:** Run `npm run build` to verify compilation.

**Step 12:** Run `npm test` to verify all tests pass.

**Step 13:** Commit.
```bash
git add src/lib/analytics-agent.ts src/lib/agent-tools/analytics.ts src/lib/__tests__/analytics-agent.test.ts
git commit -m "refactor: deduplicate analytics agent report-building logic (KB-018)"
```

---

### Task 13: Extract useContentCalendar hook from content page

**KBs:** KB-020

**Files:**
- Create: `src/hooks/useContentCalendar.ts`
- Create: `src/components/AppendFeedbackInput.tsx`
- Modify: `src/app/analyses/[id]/content/page.tsx`

**Step 1:** Read `src/app/analyses/[id]/content/page.tsx` fully. It has ~13 useState declarations and ~10 handler functions.

**Step 2:** Create `src/hooks/` directory if it doesn't exist.

**Step 3:** Create `src/hooks/useContentCalendar.ts`.

Move all state declarations (~lines 14–26 plus line 153) and all handler functions (~lines 28–261) into a custom hook:
```typescript
export function useContentCalendar(analysisId: string) {
  // All useState declarations
  // All handler functions
  // All useEffect hooks

  return {
    // All state values and setters that the UI needs
    // All handler functions
  };
}
```

Add `'use client';` directive. Add all necessary imports (React hooks, API calls, types).

**Step 4:** Create `src/components/AppendFeedbackInput.tsx`.

Extract the append feedback UI block (~lines 405–439) as a component:
```typescript
'use client';

interface AppendFeedbackInputProps {
  feedbackText: string;
  onChange: (text: string) => void;
  onAppend: () => void;
  onCancel: () => void;
  appending: boolean;
}

export default function AppendFeedbackInput({ feedbackText, onChange, onAppend, onCancel, appending }: AppendFeedbackInputProps) {
  // The textarea + buttons JSX from the page
}
```

**Step 5:** Update `src/app/analyses/[id]/content/page.tsx`:
- Import `useContentCalendar` from `@/hooks/useContentCalendar`.
- Import `AppendFeedbackInput` from `@/components/AppendFeedbackInput`.
- Remove all moved state/handler code.
- Destructure the hook's return value.
- Replace the append feedback JSX with `<AppendFeedbackInput ... />`.
- The page should shrink from 512 to ~200 lines.

**Step 6:** Run `npm run build` to verify compilation.

**Step 7:** Run `npm test` to verify tests pass.

**Step 8:** Commit.
```bash
git add src/hooks/useContentCalendar.ts src/components/AppendFeedbackInput.tsx "src/app/analyses/[id]/content/page.tsx"
git commit -m "refactor: extract useContentCalendar hook and AppendFeedbackInput component (KB-020)"
```

---

### Task 14: Add module prefixes to console.error calls

**KBs:** KB-022

**Files:**
- Modify: `src/lib/serp-search.ts`
- Modify: `src/lib/research-agent.ts`
- Modify: `src/lib/painted-door-agent.ts`
- Modify: `src/lib/content-agent.ts`
- Modify: `src/lib/seo-analysis.ts`

**Important:** This task is intentionally last because Tasks 7, 9, and 10 move code in these files, shifting line numbers. Read each file fresh to find the current locations.

**Step 1:** In `src/lib/serp-search.ts`, find the `console.error` call (originally line 79):
```
console.error(`SERP search failed for "${keyword}":`, error);
```
Change to:
```
console.error(`[serp-search] SERP search failed for "${keyword}":`, error);
```

**Step 2:** In `src/lib/research-agent.ts`, find the `console.error` call (originally line 401, may have shifted after Task 9):
```
console.error('SEO pipeline failed, falling back:', seoError);
```
Change to:
```
console.error('[research-agent] SEO pipeline failed, falling back:', seoError);
```

**Step 3:** In `src/lib/painted-door-agent.ts`, find TWO `console.error` calls (originally lines 536 and 760, shifted after Task 7):
```
console.error('Painted door agent failed:', error);
```
Change to:
```
console.error('[painted-door] Painted door agent failed:', error);
```
And:
```
console.error('Website agent v2 failed:', error);
```
Change to:
```
console.error('[website-v2] Website agent v2 failed:', error);
```

**Step 4:** In `src/lib/content-agent.ts`, find TWO `console.error` calls (originally lines 103 and 316, shifted after Task 10):
```
console.error('Failed to parse SEO data for content context');
```
Change to:
```
console.error('[content-agent] Failed to parse SEO data for content context');
```
And:
```
console.error(`Failed to generate ${piece.title}:`, error);
```
Change to:
```
console.error(`[content-agent] Failed to generate ${piece.title}:`, error);
```

**Note:** The `buildContentContext` function (which contained the first console.error) may have moved to `src/lib/content-context.ts` in Task 10. If so, update it there with prefix `[content-context]` instead.

**Step 5:** In `src/lib/seo-analysis.ts`, find FOUR `console.error` calls (lines 238, 241, 299, 829):
```
console.error('Claude SEO: no tool_use block in response');
→ console.error('[seo-analysis] Claude SEO: no tool_use block in response');

console.error('Claude SEO tool use failed:', error);
→ console.error('[seo-analysis] Claude SEO tool use failed:', error);

console.error('OpenAI SEO analysis failed:', error);
→ console.error('[seo-analysis] OpenAI SEO analysis failed:', error);

console.error('Failed to parse SEO JSON, returning defaults. First 300 chars:', jsonStr.substring(0, 300));
→ console.error('[seo-analysis] Failed to parse SEO JSON, returning defaults. First 300 chars:', jsonStr.substring(0, 300));
```

**Step 6:** Run `npm run build` to verify compilation.

**Step 7:** Run `npm test` to verify tests pass.

**Step 8:** Commit.
```bash
git add src/lib/serp-search.ts src/lib/research-agent.ts src/lib/painted-door-agent.ts src/lib/content-agent.ts src/lib/seo-analysis.ts
git commit -m "refactor: add module prefixes to console.error calls (KB-022)"
```

If `buildContentContext` moved to `content-context.ts`, also add that file:
```bash
git add src/lib/content-context.ts
```

---

## Decision Log

### Summary
| # | Decision | Choice Made | Alternatives Considered |
|---|----------|-------------|------------------------|
| 1 | KB-003/004/007 grouping | Single task extracting all shared style utils | Separate tasks per KB |
| 2 | KB-009/012/015 grouping | Single task for GitHub/Vercel helper extraction | Separate tasks with dependency chain |
| 3 | Doc updates grouping | Single task for KB-024/025/026 | Separate tasks per doc file |
| 4 | Style utils location | `src/lib/analysis-styles.ts` (new file) | `src/lib/utils.ts` (existing) |
| 5 | Header gradient location | `src/app/analyses/[id]/utils.ts` | Same file as analysis-styles.ts |
| 6 | Content-agent buildContentContext | Re-export from content-agent.ts | Update all 8 import sites |
| 7 | Console.error task ordering | Task 14 (last) | Earlier in sequence |
| 8 | Task 3 getWebsiteStatusStyle shape | `{ background, color }` (standard CSS) | `{ bg, color }` (current non-standard) |

### Appendix: Decision Details

#### Decision 1: KB-003/004/007 grouping
**Chose:** Single task
**Why:** All three extract duplicated style/utility functions from the same set of analysis page files. KB-003 and KB-007 both touch `src/app/page.tsx` and `src/app/analyses/[id]/page.tsx`. Executing them separately would require reading the same files twice and managing intermediate states.
**Rejected:** Separate tasks — adds overhead with no independence benefit since files overlap.

#### Decision 4: Style utils location
**Chose:** New `src/lib/analysis-styles.ts`
**Why:** `src/lib/utils.ts` contains generic utilities (slugify, fuzzyMatchPair, buildLeaderboard). The analysis style functions are domain-specific to the Analysis type system. Mixing domains in one file reduces cohesion.
**Rejected:** `src/lib/utils.ts` — would make utils.ts a grab-bag.

#### Decision 5: Header gradient location
**Chose:** `src/app/analyses/[id]/utils.ts`
**Why:** `getHeaderGradient` is only used by pages within the `[id]` directory. It doesn't belong in lib — it's a page-level presentation concern. Colocating it with its consumers follows Next.js conventions.
**Rejected:** `src/lib/analysis-styles.ts` — the gradient function closes over `analysis.recommendation` (currently), and is only used by 2 sibling pages, not app-wide.

#### Decision 6: Content-agent buildContentContext re-export
**Chose:** Re-export from `content-agent.ts` to minimize import churn
**Why:** 8 source files import `buildContentContext` from `content-agent`. Updating all 8 import paths is mechanical but risky in a single session — one missed file breaks the build. Re-exporting preserves backward compatibility while allowing the actual implementation to live in `content-context.ts`.
**Rejected:** Update all 8 imports — higher risk for no functional benefit. Can be done later as a cleanup.

#### Decision 7: Console.error task ordering
**Chose:** Last task (Task 14)
**Why:** Tasks 7, 9, and 10 modify `painted-door-agent.ts`, `research-agent.ts`, and `content-agent.ts` — the same files KB-022 targets. Running KB-022 first would reference line numbers that subsequent tasks invalidate. Running it last means we grep for the actual strings rather than relying on stale line numbers.
**Rejected:** Earlier position — would require re-verifying line numbers after later tasks move code.

#### Decision 8: getWebsiteStatusStyle shape change
**Chose:** `{ background, color }` using standard CSS property name
**Why:** The current `[id]/page.tsx` version returns `{ bg, color }` where `bg` is not a CSS property — call sites must manually map `bg` to `background` in style props. The `page.tsx` home page uses `background` directly in its ternary chains. Standardizing on `{ background, color }` lets both call sites spread the result directly into `style={{}}`.
**Rejected:** Keep `{ bg, color }` — would require home page to use a non-standard property name, creating inconsistency.
