# KB-018: Split analytics-agent.ts exceeding 564 lines

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/analytics-agent.ts:1-564`
- **Observed:** The analytics agent is 564 lines combining GSC data fetching, report generation, alert detection, and weekly digest formatting in a single module. Report formatting and alert detection are distinct responsibilities that would be easier to maintain independently.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** REVISE
- **Evidence:**
  - `src/lib/analytics-agent.ts` is 564 lines as described. The file's structure is: week ID utilities (lines 32-56), slug/URL utilities (lines 66-116), snapshot and alert logic (lines 119-284), V1 procedural orchestrator (lines 291-459), V2 agentic orchestrator with system prompt (lines 461-564).
  - `src/lib/agent-tools/analytics.ts` already imports `getWeekId`, `buildSlugLookup`, `createPieceSnapshots`, `detectChanges` directly from `analytics-agent.ts` (line 12-15). An import boundary already exists.
  - The `save_report` tool in `agent-tools/analytics.ts` (lines 291-402) duplicates ~70 lines of report-assembly logic from `runAnalyticsAgent` in `analytics-agent.ts` (lines 380-454): both build the zero-padded `allSnapshots` array, both build the per-piece comparison with `prevMap`, both call `saveSiteSnapshot`/`saveWeeklyReport`/`addPerformanceAlerts`.
  - The private `getPreviousWeekId` function (lines 43-56 of `analytics-agent.ts`) is re-implemented inline twice inside `agent-tools/analytics.ts`: once in `compare_weeks` (lines 192-201) and once in `save_report` (lines 309-317).
- **Root Cause:** The proposed fix (split the file) targets the wrong problem. The file is long but cohesive — it flows from smallest utility up to the top-level entry point. The actual problem is logic duplication between `analytics-agent.ts` and `agent-tools/analytics.ts`. V2 was added after V1 and the `save_report` tool re-implements report-building logic rather than reusing shared functions because `getPreviousWeekId` was never exported and no shared `buildWeeklyReport` helper exists.
- **Risk Assessment:** Low. The fix only exports new functions from an existing module and calls them from two existing callers. No API response shapes change. No auth or security logic is involved. Existing tests continue to pass. The new `buildWeeklyReport` helper should be covered by a test.
- **Validated Fix:**
  1. Export `getPreviousWeekId` from `src/lib/analytics-agent.ts` (change `function` to `export function` at line 43). This makes it importable from `agent-tools/analytics.ts` and testable.
  2. Extract a `buildWeeklyReport(params)` helper function in `analytics-agent.ts` that accepts: `weekId`, `snapshots`, `previousSnapshots`, `slugLookup`, `siteUrl`, `unmatchedPages`. It returns a `WeeklyReport`. This helper contains the allSnapshots-building and per-piece comparison logic currently duplicated in `runAnalyticsAgent` and in the `save_report` tool.
  3. Replace the duplicated block in `runAnalyticsAgent` (lines 380-442) with a call to `buildWeeklyReport(...)`.
  4. Replace the duplicated block in the `save_report` tool in `agent-tools/analytics.ts` (lines 325-384) with an import and call to `buildWeeklyReport(...)`. Remove the inline `getPreviousWeekId` re-implementation and import the exported version instead.
  5. Add unit tests for `buildWeeklyReport` (verifying zero-padding of unmatched slugs and correct per-piece delta calculation) and for `getPreviousWeekId`.
- **Files Affected:**
  - `src/lib/analytics-agent.ts` — export `getPreviousWeekId`, add and export `buildWeeklyReport`, refactor `runAnalyticsAgent` to call it
  - `src/lib/agent-tools/analytics.ts` — import `getPreviousWeekId` and `buildWeeklyReport`, remove duplicated inline logic from `compare_weeks` and `save_report` tools
  - `src/lib/__tests__/analytics-agent.test.ts` — add tests for `getPreviousWeekId` and `buildWeeklyReport`
- **Estimated Scope:** Small — approximately 70-80 lines of duplicated code eliminated, no new files needed, no public API changes
