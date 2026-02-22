# KB-122: Simplify getTools helper in website-lock-brand.test.ts

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/agent-tools/__tests__/website-lock-brand.test.ts:104-107`
- **Observed:** `getTools()` helper wraps `createWebsiteTools` in a single-line return with an unnecessary intermediate variable.
- **Expected:** Simplify to direct return: `async function getTools() { return createWebsiteTools('idea-1'); }`
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-21
