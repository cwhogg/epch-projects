# KB-054: Analytics page god component with 12 state variables and multiple async flows

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/app/project/[id]/analytics/page.tsx:108-300`
- **Observed:** The `AnalyticsPage` component manages 12 state variables (loading, error, analysisInfo, linkedSiteUrl, analytics, properties, selectedProperty, linking, refreshing, gscConfigured, weeklyReport, availableWeeks, selectedWeek, reportLoading, runningReport) and owns three distinct async flows: GSC link/data init, weekly report fetch, and property refresh. The component is 747 lines and requires reading the entire component to understand any single flow.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** Component at `src/app/project/[id]/analytics/page.tsx:108-747`. State variables at lines 112-128: `loading`, `error`, `analysisInfo`, `linkedSiteUrl`, `analytics`, `properties`, `selectedProperty`, `linking`, `refreshing`, `gscConfigured` (GSC cluster) + `weeklyReport`, `availableWeeks`, `selectedWeek`, `reportLoading`, `runningReport` (weekly report cluster) — 15 total, not 12 as described. KB undercounts. Three async flows confirmed: `init()` useEffect (131-176), `fetchWeeklyReport` (237-260), `handleRefresh` (221-234). Additional handlers: `handleLink` (178-202), `handleUnlink` (204-219), `handleRunReport` (266-276). Two duplicate inline property-refresh lambdas at lines 422-429 and 436-444 fetching the same endpoint. Derived computation at lines 283-313 (30 lines of logic) occupies the render path before JSX begins.
- **Root Cause:** Accidental accumulation. GSC linking was the original feature; weekly report state was added later (the `// Weekly report state` comment at line 123 marks the seam). Each addition followed the path of least resistance — add state variables at the top, add a handler, wire into JSX. The two state clusters have zero cross-dependency and were never separated.
- **Risk Assessment:** No API routes are touched. No breaking changes to response shapes. No existing test file for `analytics/page.tsx` — hook files will be new additions, not modifications to covered code. No auth or security logic in this layer. The two hook clusters are genuinely non-overlapping so the extraction is mechanical.
- **Validated Fix:**
  1. Create `src/hooks/useGSCData.ts` — extract `loading`, `error`, `analysisInfo`, `linkedSiteUrl`, `analytics`, `properties`, `selectedProperty`, `linking`, `refreshing`, `gscConfigured` state plus the `init` useEffect, `handleLink`, `handleUnlink`, `handleRefresh`, and a single `handlePropertyRefresh` function (replacing the duplicated inline lambdas at lines 422-429 and 436-444). Hook accepts `ideaId: string` and returns all state and handlers.
  2. Create `src/hooks/useWeeklyReport.ts` — extract `weeklyReport`, `availableWeeks`, `selectedWeek`, `reportLoading`, `runningReport` state plus `fetchWeeklyReport`, `handleRunReport`, `handleWeekChange`. Hook accepts `ideaId: string` and returns all state and handlers. Include the `ideaPieces` / `ideaAlerts` / `ideaSummary` derived values as hook return values (they depend only on weekly report state and `ideaId`).
  3. Update `src/app/project/[id]/analytics/page.tsx` to consume both hooks. The `buildComparisons` / `computeSummary` pure functions and the `comparisons` / `unexpectedWinners` / `overallSummary` derivations can remain in the page file since they depend on both `analytics` (from hook 1) and `predictedKeywords` (from `analysisInfo` in hook 1).
  4. Add tests for `useGSCData` and `useWeeklyReport` covering init, error paths, link/unlink flows, and weekly report fetch/run flows. CLAUDE.md requires error path tests for every async operation.
- **Files Affected:** `src/app/project/[id]/analytics/page.tsx` (shrinks from 747 to ~380 lines), new `src/hooks/useGSCData.ts`, new `src/hooks/useWeeklyReport.ts`, new test files for both hooks.
- **Estimated Scope:** Medium — two new hook files (~80 lines each), page file reduction of ~360 lines, two new test files (~80-100 tests between them).
