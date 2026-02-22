# KB-120: Dead code in website-lock-tools.test.ts

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/agent-tools/__tests__/website-lock-tools.test.ts:130-150`
- **Observed:** `VALID_DESIGN_TOKENS` constant and `makeDesignDoc` function are defined but never referenced in any test. `mockGetAllFoundationDocs` and `mockGetFoundationDoc` are extracted as named variables but never used in test bodies. All are leftover from the deleted regex-based token extraction approach.
- **Expected:** Remove `VALID_DESIGN_TOKENS`, `makeDesignDoc`, and the standalone mock variable declarations. Replace with inline `vi.fn()` in the mock factory.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-21
