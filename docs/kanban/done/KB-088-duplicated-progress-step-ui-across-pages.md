# KB-088: Duplicated progress-step UI across analyze and content-generate pages

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/app/ideas/[id]/analyze/page.tsx:230-303`
- **Observed:** The step-card rendering block (status icon selection, style objects keyed on running/complete/error/pending, step name and detail text) is duplicated almost verbatim between `src/app/ideas/[id]/analyze/page.tsx` (lines 230-303) and `src/app/content/[id]/generate/page.tsx` (lines 302-375), about 60 lines each. A new contributor would update one and miss the other.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** CONFIRM
- **Evidence:**
  - `src/app/ideas/[id]/analyze/page.tsx` lines 231-303: step map with icon selection, status-keyed background/border styles, name text with `isSeoSubStep` font-size toggle, optional detail line.
  - `src/app/content/[id]/generate/page.tsx` lines 302-375: same structure, but no SEO sub-step logic; adds explicit `error` state background (`rgba(248, 113, 113, 0.1)`) and border (`rgba(248, 113, 113, 0.3)`) and error name color (`var(--color-danger)`) that the analyze block omits; name always uses `text-sm truncate` instead of the conditional `text-xs/text-sm`.
  - Duplication is real. The blocks share ~55 lines of near-identical JSX and are clearly the same conceptual component evolved independently.
- **Root Cause:** The generate page was built after the analyze page and the step-list block was copy-pasted as a starting point. Variations crept in organically: SEO sub-step indentation is analyze-specific; error container styling was added to generate but never backported to analyze. No intentional design reason for them to differ.
- **Risk Assessment:**
  - Pure UI render component — no API shapes, no state, no auth logic.
  - No existing tests for either page file (confirmed via test file search); no test breakage risk.
  - Analyze page currently lacks error-state container styling (red bg/border) that generate has. The shared component should use the generate page's complete version, which is a correctness improvement for analyze, not a regression.
  - Visual regression risk is minimal: same design tokens, same markup structure, same class names throughout.
  - New test file for the shared component should accompany the extraction per project TDD convention.
- **Validated Fix:**
  1. Create `src/components/ProgressStepList.tsx` exporting a `ProgressStepList` component.
  2. Props: `steps: { name: string; status: 'pending' | 'running' | 'complete' | 'error'; detail?: string }[]` and `showSubStepIndent?: boolean` (defaults false).
  3. Implement using the generate page's error styling as the canonical version (adds correctness to analyze), plus the `showSubStepIndent` prop to preserve analyze's SEO sub-step behavior.
  4. In analyze page: add `import { ProgressStepList } from '@/components/ProgressStepList'`, replace lines 231-303 with `<ProgressStepList steps={steps} showSubStepIndent />`.
  5. In generate page: import same component, replace lines 302-375 (inside the `!pipelineMode` block) with `<ProgressStepList steps={steps} />`.
  6. Create `src/components/__tests__/ProgressStepList.test.tsx` covering: pending/running/complete/error icon rendering; sub-step indent when `showSubStepIndent` is true; detail text display; empty steps list.
- **Files Affected:**
  - `src/components/ProgressStepList.tsx` (new)
  - `src/components/__tests__/ProgressStepList.test.tsx` (new)
  - `src/app/ideas/[id]/analyze/page.tsx` (lines 231-303 replaced)
  - `src/app/content/[id]/generate/page.tsx` (lines 302-375 replaced)
- **Estimated Scope:** Small — ~60 lines removed from each page, ~50-line shared component created, ~40-line test file. Net reduction ~70 lines. Low complexity.
