# KB-035: Status timestamp logic is three consecutive conditional spreads

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/validation/[ideaId]/status/route.ts:48-54`
- **Observed:** Three separate conditional spread expressions manage validatedAt and invalidatedAt. The execution order makes it work, but intent is not obvious. Adding a fifth status means touching all three lines.
- **Expected:** A status-to-timestamps lookup object or small pure function that makes all cases explicit.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** REVISE
- **Evidence:** Code at `src/app/api/validation/[ideaId]/status/route.ts:51-53` contains three consecutive conditional spreads as described. The KB item's description is accurate. However, the KB item says "adding a fifth status means touching all three lines" — but `'pivoted'` is already defined as a fifth status in `src/types/index.ts:457` (`AssumptionStatus = 'untested' | 'testing' | 'validated' | 'invalidated' | 'pivoted'`), and the current spread logic does NOT handle it. A `'pivoted'` status would fall through all three conditions and clear both timestamps (matching `untested`/`testing` behavior via the third spread), which may or may not be correct — but it's silently implicit, not explicit. This is a real gap, not just a style concern.
- **Root Cause:** The pattern was written incrementally as statuses were added. The three spreads were correct for four statuses but the addition of `'pivoted'` was never reflected in this logic. The VALID_STATUSES array on line 10 also does not include `'pivoted'`, meaning it is not a currently reachable value via this endpoint — but the type mismatch between the guard list and the full type is itself a latent inconsistency.
- **Risk Assessment:** The fix is low-risk. The function is fully tested; a pure helper function that takes a status and returns partial timestamp fields is easily unit-testable and does not change API response shapes. The only risk is accidentally changing the behavior for `'pivoted'` if it gets added to VALID_STATUSES later — but the fix makes that behavior explicit rather than implicit, which is strictly safer.
- **Validated Fix:** Replace the three conditional spreads (lines 51-53) with a small pure helper that is exhaustive over all timestamp-bearing statuses. The helper should return `Partial<Pick<Assumption, 'validatedAt' | 'invalidatedAt'>>` keyed by status. The lookup approach (a `Record` or `switch`) makes every status's timestamp behavior visible in one place. Also evaluate whether `'pivoted'` should be added to `VALID_STATUSES` in the same file, or if that is intentionally gated elsewhere. These are two separate concerns and should be addressed in order: (1) extract the helper, (2) separately decide on `'pivoted'` in VALID_STATUSES.
- **Files Affected:** `src/app/api/validation/[ideaId]/status/route.ts` (primary change); test file for this route should be updated to cover the helper's behavior for all five statuses explicitly.
- **Estimated Scope:** Small — approximately 10-15 lines changed in the route file, plus test coverage additions.
