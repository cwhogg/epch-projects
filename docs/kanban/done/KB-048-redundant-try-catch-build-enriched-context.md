# KB-048: Redundant outer try/catch in `buildEnrichedContext`

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/analyze/[id]/route.ts:11-26`
- **Observed:** The outer try/catch wrapping `buildEnrichedContext` is dead code. Each `getFoundationDoc` call already has `.catch(() => null)` which swallows errors. `Promise.all` on caught promises cannot reject. The `buildFoundationContext` call is synchronous and pure. The outer catch can never fire.
- **Expected:** Remove the outer try/catch. The `.catch(() => null)` on each fetch already handles all async failure scenarios.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** `src/app/api/analyze/[id]/route.ts:11-26` — outer try/catch confirmed present. Each `getFoundationDoc` call at lines 13-14 has `.catch(() => null)`, converting any rejection to `null` before `Promise.all` sees it. `buildFoundationContext` at line 18 is synchronous (confirmed by test mock using `mockReturnValue`). The catch block at lines 23-26 is unreachable by any code path.
- **Root Cause:** Accidental leftover. The function was likely written with a defensive outer catch first, then per-call `.catch(() => null)` was added to support partial success (one fetch failing shouldn't block the other). The outer catch was never removed after the inner catches made it dead code.
- **Risk Assessment:** Low. No API response shape changes. The only behavior difference is: if `buildFoundationContext` ever threw synchronously (it doesn't), the error would propagate to the `after()` callback's try/catch at `route.ts:78-88` instead of being silently swallowed — which is strictly better. Existing error-path tests at lines 114 and 122 already pass via the `.catch(() => null)` mechanism, not the outer catch. No test changes required.
- **Validated Fix:** Remove lines 11 (`try {`) and 23-26 (the entire catch block). Un-indent the function body (lines 12-22) by one level. Function signature and return type are unchanged.
- **Files Affected:** `src/app/api/analyze/[id]/route.ts` (lines 11-26, ~4 lines removed, ~12 lines un-indented)
- **Estimated Scope:** Small — cosmetic indentation change plus 4 line deletions, zero logic changes
