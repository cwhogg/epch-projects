# KB-001: Inconsistent route matching patterns across analysis-related routes

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/nav-utils.ts:6-12`
- **Observed:** The /analysis case uses complex negative conditions (checking what paths DON'T include) to determine active state. This pattern is fragile because adding new /analyses/* routes requires remembering to exclude them here. The /foundation and /content cases use positive matching (checking what paths DO include), which is more maintainable.
- **Expected:** Refactor the /analysis case to use positive matching — explicitly list which /analyses/* patterns should activate the Analysis tab, rather than excluding everything else.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16
