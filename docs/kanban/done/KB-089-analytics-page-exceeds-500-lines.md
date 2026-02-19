# KB-089: Project analytics page exceeds 500 lines

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/app/project/[id]/analytics/page.tsx:1-551`
- **Observed:** The analytics page is 551 lines and contains distinct concerns: GSC property linking UI, summary card rendering, time-series charting, keyword comparison, per-page performance table, weekly report section with alerts and per-piece table. The top-level `buildComparisons` and `computeSummary` helper functions (lines 25-92) could move to a shared hook or utility. The per-page performance table (lines 342-424) is a self-contained section that renders twice (mobile card list + desktop table) with identical data.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** CONFIRM
- **Evidence:**
  - File confirmed at 551 lines: `src/app/project/[id]/analytics/page.tsx:1-551`
  - `buildComparisons` (lines 25–70) and `computeSummary` (lines 72–92) are pure computation functions with no JSX, no hooks, no React dependencies — they are misplaced in a page file
  - Per-page performance table (lines 341–425) is inline JSX that duplicates the mobile-card + desktop-table pattern already established in `src/components/PerformanceTable.tsx`, but uses `GSCQueryRow` data (`page.query`, `page.clicks`, etc.) rather than the `PieceRow` shape `PerformanceTable` expects — so extraction into a new `PagePerformanceTable` component is correct, not reuse of the existing one
  - No existing test covers `buildComparisons`, `computeSummary`, or the analytics page component
- **Root Cause:** Incremental feature accumulation. Both patterns were written inline at time of authorship and never extracted: the pure functions because they were small at the time, the table because `PerformanceTable.tsx` uses a different data shape and a quick inline implementation was faster.
- **Risk Assessment:**
  - No API response shape changes — pure UI refactoring
  - No auth or security logic touched
  - Utility extraction (`buildComparisons`, `computeSummary`) is zero-risk: pure functions moved verbatim, same call signatures, same outputs
  - Component extraction carries minimal risk: JSX moved verbatim, only failure mode is a missed import
  - No existing tests to break; new tests for the extracted utility functions should be added
- **Validated Fix:** Two independent extractions, either can be done first:
  1. Create `src/lib/analytics-utils.ts` — move `buildComparisons` and `computeSummary` verbatim; update `page.tsx` import; add tests in `src/lib/__tests__/analytics-utils.test.ts` covering `buildComparisons` (matched keywords, unmatched keywords, unexpectedWinners sorting) and `computeSummary` (totalClicks, averageCtr, weighted averagePosition, topQuery)
  2. Create `src/components/PagePerformanceTable.tsx` — extract the `{analytics.pageData.length > 0 && ...}` block (lines 341–425) verbatim; component accepts `pageData: GSCQueryRow[]`; replace the inline block in `page.tsx` with `<PagePerformanceTable pageData={analytics.pageData} />`; guard stays on the call site
- **Files Affected:**
  - `src/app/project/[id]/analytics/page.tsx` (modified — two sections removed, two imports added)
  - `src/lib/analytics-utils.ts` (new)
  - `src/lib/__tests__/analytics-utils.test.ts` (new)
  - `src/components/PagePerformanceTable.tsx` (new)
- **Estimated Scope:** Small — ~70 lines of new utility/component files, ~90 lines removed from page.tsx (net reduction ~90 lines to ~460)
