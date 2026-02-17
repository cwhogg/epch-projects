# KB-035: Status timestamp logic is three consecutive conditional spreads

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/validation/[ideaId]/status/route.ts:48-54`
- **Observed:** Three separate conditional spread expressions manage validatedAt and invalidatedAt. The execution order makes it work, but intent is not obvious. Adding a fifth status means touching all three lines.
- **Expected:** A status-to-timestamps lookup object or small pure function that makes all cases explicit.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17
