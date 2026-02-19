# KB-102: trigger.test.ts duplicates eval-config pattern array

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `e2e/eval-helpers/__tests__/trigger.test.ts:13-28`
- **Observed:** The `patterns` array is a hand-maintained copy of a subset of `EVAL_CONFIG.llmSurfacePatterns`. Every future pattern addition requires updating both files in sync.
- **Expected:** Import `EVAL_CONFIG.llmSurfacePatterns` directly from `eval-config.ts` instead of duplicating the array (~16 lines removed).
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-19
