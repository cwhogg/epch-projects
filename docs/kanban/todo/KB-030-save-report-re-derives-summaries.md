# KB-030: save_report tool re-derives summaries already computed in compare_weeks

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/agent-tools/analytics.ts:283-344`
- **Observed:** save_report (lines 291-306) recomputes totalClicks, totalImpressions, averagePosition, averageCtr, fetches previousSnapshots, and calls detectChanges — all of which compare_weeks (lines 193-222) already computed and returned to the agent. The agent is instructed to call compare_weeks before save_report, making the recalculation pure duplication of work and state.
- **Expected:** Have save_report accept the pre-computed summary data as input rather than re-deriving it
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-16
