# KB-079: Redundant reduce calls in useWeeklyReport ideaSummary

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/hooks/useWeeklyReport.ts:67-81`
- **Observed:** The ideaSummary object literal calls `reduce` for totalClicks and totalImpressions 2-3 times each (6 total iterations when 3 suffice). The averageCtr formula is hard to read as a deeply nested ternary.
- **Expected:** Extract `totalClicks`, `totalImpressions`, `totalPosition` as named locals, then reference them in the object literal.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-18
