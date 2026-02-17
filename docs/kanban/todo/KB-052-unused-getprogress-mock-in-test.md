# KB-052: Unused `getProgress` mock in analyze route test

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/analyze/[id]/__tests__/route.test.ts:6`
- **Observed:** The mock for `@/lib/db` includes `getProgress: vi.fn()` but it's never used in any test assertion. It exists only to satisfy the module shape.
- **Expected:** Consider whether the production code's import structure can be split so the test doesn't need to mock unused functions. Low priority — no change needed unless the test grows unwieldy.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-17
