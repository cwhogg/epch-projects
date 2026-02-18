# KB-063: Repeated environment variable checks could use validation loop

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/painted-door/[id]/route.ts:14-41`
- **Observed:** The POST handler has four sequential environment variable checks (Redis, ANTHROPIC_API_KEY, GITHUB_TOKEN, VERCEL_TOKEN) with identical response shapes but different error messages. Each is a separate if-block returning a 500 with JSON error.
- **Expected:** Consolidate into a single validation loop over required env var names, reducing ~20 lines to ~5.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-17

- **Resolved:** 2026-02-17
- **Fix:** Closed during triage — the four checks are not uniform: the Redis check uses `isRedisConfigured()` (a helper that wraps two env vars) while the other three check `process.env.*` directly. A loop over three named vars would still require the Redis check separately, reducing savings to ~12-15 lines (not ~20 as projected). More importantly, each error message is intentionally distinct — the Redis message actively guides operators ("Please add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."). A generic loop pattern would either degrade that message or require special-casing that eliminates the savings. The explicit sequential checks are more readable, self-document the route's required env vars, and are easier to extend. Closing as a false positive on the simplifier's line-count heuristic.
