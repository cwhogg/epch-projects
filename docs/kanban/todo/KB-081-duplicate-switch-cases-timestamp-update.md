# KB-081: Duplicate switch cases in getTimestampUpdate

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/validation/[ideaId]/status/route.ts:16-19`
- **Observed:** The `invalidated` and `pivoted` cases return identical objects `{ invalidatedAt: now, validatedAt: undefined }` but are separate cases with duplicated return statements.
- **Expected:** Combine as fallthrough: `case 'invalidated': case 'pivoted': return { invalidatedAt: now, validatedAt: undefined };`
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-18
