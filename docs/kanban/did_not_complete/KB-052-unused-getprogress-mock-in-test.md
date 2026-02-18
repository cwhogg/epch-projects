# KB-052: Unused `getProgress` mock in analyze route test

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/analyze/[id]/__tests__/route.test.ts:6`
- **Observed:** The mock for `@/lib/db` includes `getProgress: vi.fn()` but it's never used in any test assertion. It exists only to satisfy the module shape.
- **Expected:** Consider whether the production code's import structure can be split so the test doesn't need to mock unused functions. Low priority — no change needed unless the test grows unwieldy.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-17

- **Resolved:** 2026-02-17
- **Fix:** Closed during triage — The `getProgress: vi.fn()` entry is not dead code; it is a required module shape stub. The production route (`src/app/api/analyze/[id]/route.ts:2`) imports `getProgress` from `@/lib/db`. When the test loads `POST` and `buildEnrichedContext` from that route, the entire route module is evaluated, which triggers the `@/lib/db` import. The `vi.mock` factory must cover every export that the production module imports to prevent real module code from leaking through. Removing `getProgress: vi.fn()` from the mock would leave it undefined and could cause the GET handler path to break if it were ever exercised indirectly. The proposed fix (splitting `@/lib/db` into sub-modules) would add structural complexity to eliminate a single `vi.fn()` line — cost far exceeds benefit. This is correct, idiomatic Vitest usage, not a simplification opportunity.
