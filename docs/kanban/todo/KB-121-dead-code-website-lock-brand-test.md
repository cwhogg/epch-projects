# KB-121: Dead code in website-lock-brand.test.ts

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/agent-tools/__tests__/website-lock-brand.test.ts:21-27`
- **Observed:** `mockGetFoundationDoc` is declared and wired into the mock factory but no test exercises it. Vestigial from when lock_brand didn't exist and brand extraction happened via Foundation doc parsing.
- **Expected:** Remove the standalone `mockGetFoundationDoc` declaration. Replace with inline `vi.fn()` in the mock factory.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-21
