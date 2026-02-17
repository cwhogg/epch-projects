# KB-048: Redundant outer try/catch in `buildEnrichedContext`

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/analyze/[id]/route.ts:11-26`
- **Observed:** The outer try/catch wrapping `buildEnrichedContext` is dead code. Each `getFoundationDoc` call already has `.catch(() => null)` which swallows errors. `Promise.all` on caught promises cannot reject. The `buildFoundationContext` call is synchronous and pure. The outer catch can never fire.
- **Expected:** Remove the outer try/catch. The `.catch(() => null)` on each fetch already handles all async failure scenarios.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17
