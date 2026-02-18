# KB-085: Compressed multi-statement lines in eval-runner

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `e2e/eval-runner.ts:33,35,39,43`
- **Observed:** Multiple assignments compressed onto single lines with semicolons (e.g., `trigger = 'manual'; scopeReason = ...`). Reduces scanability.
- **Expected:** Put each assignment on its own line within if/else branches.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-18
