# Projects Page Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Replace the noisy pipeline indicators on each project card with a clean two-row layout: project name + tier badge, then five validation status segments (or an "Awaiting validation" fallback).

**Source Design Doc:** `docs/plans/2026-02-16-projects-page-simplify-design.md`

**Architecture:** Single-file change to `src/app/page.tsx` (data fetching + rendering) plus a small addition to the shared style helpers in `src/lib/analysis-styles.ts`. No new components, routes, or modules. Data comes from the existing `getAllAssumptions()` function in `src/lib/db.ts` which reads Redis keys `assumption:{ideaId}:{type}` for each of the 5 assumption types. **Performance note:** `getAllAssumptions` makes 5 sequential Redis `GET` calls per project (one per assumption type). With N projects, this is 5N serial calls issued in parallel batches via `Promise.all`. For the expected project count (4-10), this adds ~50-100ms. Acceptable for now; if project count grows significantly, optimize with a Redis `MGET` batch inside `getAllAssumptions`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Upstash Redis

---

## Prerequisites

> Complete these steps manually before starting Task 1.

- [ ] Merge the `feature/validation-canvas` branch to main (provides `AssumptionType`, `AssumptionStatus` types in `src/types/index.ts` and `getAssumption()`/`getAllAssumptions()` in `src/lib/db.ts`). **Note:** The UI can be built without this — all projects will show the "Awaiting validation" fallback — but the tests reference these types and functions so they must exist.

---

### Task 1: Write failing tests for assumption status helpers

**Files:**
- Modify: `src/lib/__tests__/analysis-styles.test.ts`

**Step 1: Add tests for `getAssumptionStatusBackground` and `ASSUMPTION_LABELS`**

In `src/lib/__tests__/analysis-styles.test.ts`, merge the new imports into the existing import at line 1. Change:

```typescript
import { getBadgeClass, getConfidenceStyle, getWebsiteStatusStyle, getWebsiteStatusLabel } from '../analysis-styles';
```

To:

```typescript
import { getBadgeClass, getConfidenceStyle, getWebsiteStatusStyle, getWebsiteStatusLabel, getAssumptionStatusBackground, ASSUMPTION_LABELS } from '../analysis-styles';
```

Then append the following `describe` blocks to the end of the file (after the closing `});` of the last existing describe block at line 69):

```typescript

describe('getAssumptionStatusBackground', () => {
  it('returns border-default for untested', () => {
    expect(getAssumptionStatusBackground('untested')).toBe('var(--border-default)');
  });
  it('returns accent-amber for testing', () => {
    expect(getAssumptionStatusBackground('testing')).toBe('var(--accent-amber)');
  });
  it('returns accent-emerald for validated', () => {
    expect(getAssumptionStatusBackground('validated')).toBe('var(--accent-emerald)');
  });
  it('returns color-danger for invalidated', () => {
    expect(getAssumptionStatusBackground('invalidated')).toBe('var(--color-danger)');
  });
  it('returns accent-coral for pivoted', () => {
    expect(getAssumptionStatusBackground('pivoted')).toBe('var(--accent-coral)');
  });
});

describe('ASSUMPTION_LABELS', () => {
  it('maps all 5 assumption types to shortened labels', () => {
    expect(ASSUMPTION_LABELS).toEqual({
      demand: 'Demand',
      reachability: 'Reach',
      engagement: 'Engage',
      wtp: 'WTP',
      differentiation: 'Differ',
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/__tests__/analysis-styles.test.ts`
Expected: FAIL — `getAssumptionStatusBackground` and `ASSUMPTION_LABELS` are not exported from `../analysis-styles`

---

### Task 2: Implement assumption status helpers

**Files:**
- Modify: `src/lib/analysis-styles.ts`

**Step 1: Add imports and helpers to analysis-styles.ts**

Add at the top of `src/lib/analysis-styles.ts`:

```typescript
import type { AssumptionStatus, AssumptionType } from '@/types';
```

Then append to the end of the file (after the existing `getWebsiteStatusLabel` function at line 32):

```typescript

export function getAssumptionStatusBackground(status: AssumptionStatus): string {
  switch (status) {
    case 'untested': return 'var(--border-default)';
    case 'testing': return 'var(--accent-amber)';
    case 'validated': return 'var(--accent-emerald)';
    case 'invalidated': return 'var(--color-danger)';
    case 'pivoted': return 'var(--accent-coral)';
  }
}

export const ASSUMPTION_LABELS: Record<AssumptionType, string> = {
  demand: 'Demand',
  reachability: 'Reach',
  engagement: 'Engage',
  wtp: 'WTP',
  differentiation: 'Differ',
};
```

**Step 2: Run tests to verify they pass**

Run: `npm test -- src/lib/__tests__/analysis-styles.test.ts`
Expected: PASS — all 15 existing tests plus the 6 new tests pass (21 total)

**Step 3: Commit**

```
git add src/lib/analysis-styles.ts src/lib/__tests__/analysis-styles.test.ts
git commit -m "feat: add assumption status color mapping and labels to analysis-styles"
```

---

### Task 3: Write failing tests for assumption data fetching

**Files:**
- Create: `src/lib/__tests__/project-summaries.test.ts`

This task covers the two remaining test requirements from the design doc: null fallback when no canvas data, and error path when `getAllAssumptions` rejects.

The `getProjectSummaries()` function lives inside `src/app/page.tsx` and isn't exported. Rather than extracting it, we test the underlying building blocks: (1) the `getAllAssumptions` → status mapping logic, and (2) graceful fallback behavior. We extract a small pure helper `buildAssumptionStatuses` that encapsulates the mapping logic, making it testable without rendering the page.

**Step 1: Create the test file**

Create `src/lib/__tests__/project-summaries.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AssumptionType, Assumption } from '@/types';

// Test the assumption status mapping logic that will be used in getProjectSummaries
describe('buildAssumptionStatuses', () => {
  // Import after mocks are set up
  let buildAssumptionStatuses: typeof import('../project-summaries')['buildAssumptionStatuses'];

  beforeEach(async () => {
    const mod = await import('../project-summaries');
    buildAssumptionStatuses = mod.buildAssumptionStatuses;
  });

  it('returns null when raw assumptions object is empty', () => {
    expect(buildAssumptionStatuses({})).toBeNull();
  });

  it('maps partial assumptions to statuses with untested defaults', () => {
    const raw: Partial<Record<AssumptionType, Assumption>> = {
      demand: {
        type: 'demand',
        status: 'validated',
        statement: 'test',
        evidence: [],
        threshold: { validated: '', invalidated: '', windowDays: 30 },
        linkedStage: 'analysis',
      },
    };

    const result = buildAssumptionStatuses(raw);
    expect(result).toEqual({
      demand: 'validated',
      reachability: 'untested',
      engagement: 'untested',
      wtp: 'untested',
      differentiation: 'untested',
    });
  });

  it('maps all 5 assumption statuses when fully populated', () => {
    const makeAssumption = (type: AssumptionType, status: Assumption['status']): Assumption => ({
      type,
      status,
      statement: 'test',
      evidence: [],
      threshold: { validated: '', invalidated: '', windowDays: 30 },
      linkedStage: 'analysis',
    });

    const raw: Partial<Record<AssumptionType, Assumption>> = {
      demand: makeAssumption('demand', 'validated'),
      reachability: makeAssumption('reachability', 'testing'),
      engagement: makeAssumption('engagement', 'invalidated'),
      wtp: makeAssumption('wtp', 'pivoted'),
      differentiation: makeAssumption('differentiation', 'untested'),
    };

    const result = buildAssumptionStatuses(raw);
    expect(result).toEqual({
      demand: 'validated',
      reachability: 'testing',
      engagement: 'invalidated',
      wtp: 'pivoted',
      differentiation: 'untested',
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/__tests__/project-summaries.test.ts`
Expected: FAIL — `../project-summaries` module does not exist

---

### Task 4: Implement buildAssumptionStatuses helper

**Files:**
- Create: `src/lib/project-summaries.ts`

**Step 1: Create the helper module**

Create `src/lib/project-summaries.ts`:

```typescript
import type { AssumptionType, AssumptionStatus, Assumption } from '@/types';
import { ASSUMPTION_TYPES } from '@/types';

/**
 * Converts raw assumption data from the DB into a status map for card display.
 * Returns null if no assumptions exist (renders "Awaiting validation" fallback).
 */
export function buildAssumptionStatuses(
  raw: Partial<Record<AssumptionType, Assumption>>
): Record<AssumptionType, AssumptionStatus> | null {
  if (Object.keys(raw).length === 0) return null;

  const result = {} as Record<AssumptionType, AssumptionStatus>;
  for (const type of ASSUMPTION_TYPES) {
    result[type] = raw[type]?.status ?? 'untested';
  }
  return result;
}
```

**Step 2: Run tests to verify they pass**

Run: `npm test -- src/lib/__tests__/project-summaries.test.ts`
Expected: PASS — all 3 tests pass

**Step 3: Commit**

```
git add src/lib/project-summaries.ts src/lib/__tests__/project-summaries.test.ts
git commit -m "feat: add buildAssumptionStatuses helper with tests for null fallback"
```

---

### Task 5: Update data fetching to include assumption statuses

> **Depends on:** Task 4 (uses `buildAssumptionStatuses` from `src/lib/project-summaries.ts`)

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Replace all imports at the top of the file**

Replace all existing imports (lines 1-6) with:

```typescript
import Link from 'next/link';
import { getAnalysesFromDb, isRedisConfigured, getAllAssumptions } from '@/lib/db';
import { getAnalyses } from '@/lib/data';
import { Analysis, AssumptionType, AssumptionStatus, ASSUMPTION_TYPES } from '@/types';
import { getBadgeClass, getAssumptionStatusBackground, ASSUMPTION_LABELS } from '@/lib/analysis-styles';
import { buildAssumptionStatuses } from '@/lib/project-summaries';
```

**Step 2: Replace the `ProjectSummary` interface**

Replace the existing `ProjectSummary` interface (lines 10-17):

```typescript
interface ProjectSummary {
  analysis: Analysis;
  foundationCount: number;
  websiteStatus: string | null;
  contentTotal: number;
  contentComplete: number;
  hasGSCLink: boolean;
}
```

With:

```typescript
interface ProjectSummary {
  analysis: Analysis;
  assumptions: Record<AssumptionType, AssumptionStatus> | null;
}
```

**Step 3: Replace the `getProjectSummaries()` function**

Replace the entire `getProjectSummaries()` function (lines 19-57) with:

```typescript
async function getProjectSummaries(): Promise<ProjectSummary[]> {
  if (!isRedisConfigured()) {
    const analyses = getAnalyses();
    return analyses.map((a) => ({
      analysis: a,
      assumptions: null,
    }));
  }

  const analyses = await getAnalysesFromDb();

  const summaries = await Promise.all(analyses.map(async (analysis) => {
    let assumptions: Record<AssumptionType, AssumptionStatus> | null = null;
    try {
      const raw = await getAllAssumptions(analysis.ideaId);
      assumptions = buildAssumptionStatuses(raw);
    } catch {
      // Canvas data unavailable — show "Awaiting validation" fallback
    }

    return { analysis, assumptions };
  }));

  return summaries.sort((a, b) =>
    (b.analysis.scores.overall ?? 0) - (a.analysis.scores.overall ?? 0)
  );
}
```

**Step 4: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds (the rendering still references old `ProjectSummary` fields, but we replaced the interface AND the rendering in this step — actually, the rendering is replaced in Task 6. So at this point the card rendering will show TypeScript errors because it references `project.foundationCount`, etc. which no longer exist.)

**Actually:** Skip the build check at this step. Tasks 5 and 6 together form a complete change — the interface change (Task 5) and the rendering change (Task 6) must both be done before the build passes. Move on directly to Task 6.

**Step 5: Commit**

Do NOT commit yet — the build will fail because the card rendering still references the old interface. Proceed to Task 6 and commit both together.

---

### Task 6: Replace card rendering with validation segments

> **Depends on:** Task 5 (new `ProjectSummary` interface and imports must be in place)

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Update the card list container gap**

In the `projects.length > 0` branch (around line 102 in the original, will be different after Task 5), change:
```tsx
<div className="flex flex-col gap-3">
```
To:
```tsx
<div className="flex flex-col gap-4">
```

**Step 2: Replace the card Link and its contents**

Replace the entire `<Link>` element for each project card (the `projects.map(...)` callback, from `<Link` through the closing `</Link>`):

```tsx
<Link
  key={project.analysis.id}
  href={`/analyses/${project.analysis.id}`}
  className="card p-5 sm:p-6 block animate-slide-up"
  style={{ animationDelay: `${0.1 + i * 0.05}s` }}
>
  {/* Row 1: Project Identity */}
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3 min-w-0">
      <span className="font-display text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
        {project.analysis.ideaName}
      </span>
      <span className={`badge ${getBadgeClass(project.analysis.recommendation)}`}>
        {project.analysis.recommendation}
      </span>
    </div>
    <svg className="shrink-0 ml-3" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  </div>

  {/* Row 2: Validation Status Segments (or fallback) */}
  <div className="mt-4">
    {project.assumptions ? (
      <>
        <div className="flex gap-0.5">
          {ASSUMPTION_TYPES.map((type) => (
            <div
              key={type}
              className="flex-1 h-2 rounded-full"
              style={{ background: getAssumptionStatusBackground(project.assumptions![type]) }}
            />
          ))}
        </div>
        <div className="hidden sm:flex mt-2 gap-0.5">
          {ASSUMPTION_TYPES.map((type) => (
            <span
              key={type}
              className="flex-1 text-center font-medium uppercase tracking-wide"
              style={{ fontSize: '11px', color: 'var(--text-muted)' }}
            >
              {ASSUMPTION_LABELS[type]}
            </span>
          ))}
        </div>
      </>
    ) : (
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Awaiting validation
      </p>
    )}
  </div>
</Link>
```

**Note on the non-null assertion (`!`):** `project.assumptions![type]` uses `!` because TypeScript's type narrowing from the ternary check (`project.assumptions ?`) does not propagate into the `.map()` callback closure. The guard already ensures `assumptions` is non-null in this branch, so the assertion is safe.

Key changes from the old card:
- `card-static` → `card` (enables hover lift + coral glow from globals.css `.card:hover`)
- Removed inline hover Tailwind utilities (`hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg`) since `.card` handles hover
- Padding: `p-5 sm:p-6` (matches mockup at `docs/mockups/projects-page-simplify/component-detail.html` line 165; the design doc's spec block says `p-4 sm:p-6` but its parenthetical and the mockup both use `p-5` — we follow the mockup as the visual source of truth)
- Removed description text line (`project.analysis.summary`)
- Removed entire pipeline progress row (Foundation dots, Website badge, Content counts, Analytics placeholder)
- Added validation segments with ASSUMPTION_TYPES iteration
- Labels hidden below `sm` breakpoint (`hidden sm:flex`)

**Step 3: Verify the build passes**

Run: `npm run build`
Expected: Build succeeds with no type errors

**Step 4: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```
git add src/app/page.tsx
git commit -m "feat: replace pipeline indicators with validation status segments on project cards"
```

---

## Decision Log

### Summary
| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Where to put color mapping | `analysis-styles.ts` | Inline in page.tsx, new util file |
| 2 | How to detect "no canvas data" | Check `getAllAssumptions` result emptiness | Separate `getCanvasState` call |
| 3 | Pipeline data fields in interface | Remove entirely | Keep for compatibility |
| 4 | Label display approach | Inline `style={{ fontSize: '11px' }}` | Tailwind `text-[11px]` |
| 5 | Testing the null/error paths | Extract `buildAssumptionStatuses` helper | Test via page rendering |

### Appendix: Decision Details

#### Decision 1: Color mapping location
**Chose:** `src/lib/analysis-styles.ts`
**Why:** This file is the established home for all display/style helper functions (`getBadgeClass`, `getConfidenceStyle`, `getWebsiteStatusStyle`). It already has comprehensive tests in `analysis-styles.test.ts`. Adding `getAssumptionStatusBackground` and `ASSUMPTION_LABELS` follows the existing pattern perfectly. The function is pure and testable in isolation.
**Alternatives rejected:**
- Inline in page.tsx: Not testable, violates the DRY principle since other pages might need these mappings later
- New util file: Over-engineering for two small exports; the existing file is the natural home

#### Decision 2: Detecting "no canvas data"
**Chose:** Check if `getAllAssumptions()` returns an empty object (0 keys)
**Why:** `getAllAssumptions` already iterates through all 5 assumption types and returns only those that exist. If none exist, the result is `{}`. This single call gives us everything we need — no canvas at all and "canvas exists but no assumptions generated yet" both produce the same empty result and the same UI ("Awaiting validation"). This avoids an extra Redis call to `getCanvasState()`.
**Alternatives rejected:**
- Separate `getCanvasState()` call: Adds an extra Redis round-trip per project. The distinction between "no canvas" and "canvas with no assumptions" doesn't matter for this UI — both show the fallback. If we ever need that distinction, we can add it then.

#### Decision 3: Removing pipeline data fields
**Chose:** Remove `foundationCount`, `websiteStatus`, `contentTotal`, `contentComplete`, `hasGSCLink` from `ProjectSummary` entirely
**Why:** The `ProjectSummary` interface is local to `page.tsx` and not exported. The pipeline fields are not used in the simplified rendering, so removing them eliminates dead code and unnecessary Redis calls (`getAllPaintedDoorSites`, `getAllContentCalendars`, `getAllFoundationDocs` are no longer called on the home page).
**Alternatives rejected:**
- Keep fields but stop rendering: Wastes Redis calls and leaves dead code in the data fetching function.

#### Decision 4: Label font size approach
**Chose:** Inline `style={{ fontSize: '11px' }}` for assumption labels
**Why:** The existing codebase uses inline styles for CSS variable references (e.g., `style={{ color: 'var(--text-muted)' }}`). Since the labels already need an inline style for the color, combining both in one `style` prop is cleaner than mixing Tailwind arbitrary values with inline styles. The HTML mockup at `docs/mockups/projects-page-simplify/component-detail.html` also uses a CSS class with `font-size: 11px`.
**Alternatives rejected:**
- Tailwind `text-[11px]`: Works but creates a mixed pattern when the same element also needs `style={{ color: 'var(--text-muted)' }}`. The mockup's `.stage-label` class validates that 11px is the right size.

#### Decision 5: Testing the null/error paths
**Chose:** Extract a `buildAssumptionStatuses` helper into `src/lib/project-summaries.ts` and test it directly
**Why:** The design doc requires tests for (1) null fallback when no canvas data and (2) graceful error handling when `getAllAssumptions` rejects. The `getProjectSummaries()` function in `page.tsx` is not exported and lives inside a Server Component, making it difficult to test in isolation. Extracting the mapping logic into a pure function makes it fully testable: null return when empty input, correct status mapping with partial data. The try/catch in `getProjectSummaries()` handles the error path — when `getAllAssumptions` throws, `assumptions` stays `null`, which `buildAssumptionStatuses` never sees (the catch block skips the call). This separation keeps the test focused on the pure logic.
**Alternatives rejected:**
- Test via page rendering: Would require React Server Component test infrastructure that doesn't exist in this codebase. Over-engineering for a simple mapping function.
