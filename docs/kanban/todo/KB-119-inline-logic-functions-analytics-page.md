# KB-119: Inline pure functions buildComparisons and computeSummary in analytics page

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/app/project/[id]/analytics/page.tsx:26-93`
- **Observed:** `buildComparisons` (lines 26-71) and `computeSummary` (lines 73-93) are pure data-transformation functions with no React dependencies defined inline in a 555-line page component. They are not co-located with any UI logic that depends on them — they transform GSC data into comparison and summary shapes. KB-008's triage explicitly identified extracting these two functions to `src/lib/gsc/analytics-utils.ts` as part of the fix plan, but they remain inline in the current refactored file.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** MEDIUM
- **Created:** 2026-02-21
