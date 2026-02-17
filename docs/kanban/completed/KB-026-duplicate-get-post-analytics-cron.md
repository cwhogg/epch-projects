# KB-026: Duplicate GET/POST handler bodies in analytics cron route

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/cron/analytics/route.ts:9-58`
- **Observed:** The GET and POST handlers share identical bodies — same Redis guard, same runAnalyticsAgentAuto call, same evaluateAllCanvases call, same AGENT_PAUSED error branch. The only difference is the auth check in GET. Any logic change must be applied twice.
- **Expected:** Extract a shared handler function called by both GET and POST, with the auth check only in GET.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** `src/app/api/cron/analytics/route.ts:17-35` and `:40-57` are near-identical blocks. Both run `isRedisConfigured()`, `runAnalyticsAgentAuto()`, `evaluateAllCanvases()`, and the `AGENT_PAUSED` error branch. The only functional difference is the CRON_SECRET auth check in GET (lines 10-15). One minor divergence already exists: the error log strings differ — GET uses `'Cron analytics failed:'` (line 31), POST uses `'Manual analytics failed:'` (line 52) — confirming that the handlers have already silently diverged and will continue to do so.
- **Root Cause:** GET was written first as the Vercel cron trigger. POST was added later for manual dashboard invocations and the handler body was copy-pasted rather than extracted, which is the standard cause of this pattern in Next.js route files.
- **Risk Assessment:** Zero API surface risk — GET and POST response shapes are unchanged. No tests exist for this route, so no test suite to break. The extracted function contains no security logic; auth check stays in GET only. The only decision point is the log message: pass a `source: string` parameter to the extracted function so `'Cron analytics failed:'` and `'Manual analytics failed:'` are preserved.
- **Validated Fix:**
  1. In `src/app/api/cron/analytics/route.ts`, extract an `async function runAnalytics(source: string): Promise<NextResponse>` that contains the Redis guard, the `runAnalyticsAgentAuto()` call, the `evaluateAllCanvases()` call, and the full error branch using `source` in the `console.error` message.
  2. Replace the GET handler body (after the auth check) with `return runAnalytics('Cron')`.
  3. Replace the POST handler body entirely with `return runAnalytics('Manual')`.
  4. No imports change. No other files are affected.
- **Files Affected:** `src/app/api/cron/analytics/route.ts` only
- **Estimated Scope:** Small — removes ~18 duplicate lines, adds ~20 lines for the extracted function, net file size roughly unchanged but duplication eliminated
