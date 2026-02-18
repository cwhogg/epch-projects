# KB-083: Inverted threshold field names in eval-config outputLength

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `e2e/eval-config.ts:13-16`
- **Observed:** `max` is the lower threshold (triggers warn) and `warn` is the higher threshold (triggers fail). Semantically inverted — `max` reads as the hard limit, not the soft one.
- **Expected:** Rename to `warnAt` and `failAt` (or `softLimit`/`hardLimit`) so field names match actual semantics. Update Thresholds interface and check function accordingly.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-18
