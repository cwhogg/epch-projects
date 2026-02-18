# KB-063: Repeated environment variable checks could use validation loop

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/painted-door/[id]/route.ts:14-41`
- **Observed:** The POST handler has four sequential environment variable checks (Redis, ANTHROPIC_API_KEY, GITHUB_TOKEN, VERCEL_TOKEN) with identical response shapes but different error messages. Each is a separate if-block returning a 500 with JSON error.
- **Expected:** Consolidate into a single validation loop over required env var names, reducing ~20 lines to ~5.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-17
