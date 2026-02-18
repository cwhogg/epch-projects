# KB-080: Set rebuilt inside filter callback in useWeeklyReport

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/hooks/useWeeklyReport.ts:61-64`
- **Observed:** `ideaAlerts` filter creates a new `Set(ideaPieces.map(...))` on every iteration of the filter callback. This rebuilds the Set for every alert element.
- **Expected:** Hoist `const ideaSlugs = new Set(ideaPieces.map((p) => p.slug))` above the filter callback.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-18
