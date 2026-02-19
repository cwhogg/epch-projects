# KB-096: content-pipeline GET reads raw Redis key bypassing getActiveRunId abstraction

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/app/api/content-pipeline/[ideaId]/route.ts:121-123`
- **Observed:** The GET handler reads `active_run:content-critique:${ideaId}` directly from Redis rather than using `getActiveRunId('content-critique', ideaId)` from `agent-runtime.ts`. Every other agent polling handler uses the abstraction, making the content-pipeline route the only caller that encodes the Redis key format directly in a route handler — if the key format changes in agent-runtime.ts, this route will silently break.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** MEDIUM
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** CONFIRM
- **Evidence:** `src/app/api/content-pipeline/[ideaId]/route.ts:122` reads `redis.get<string>(\`active_run:content-critique:${ideaId}\`)` directly. `src/lib/agent-runtime.ts:60` defines `activeRunKey` as `\`active_run:${agentId}:${entityId}\`` and exports `getActiveRunId` at line 74. `src/lib/foundation-agent.ts:58` calls `getActiveRunId('foundation', ideaId)` — the correct pattern. The content-pipeline route is the only call site that encodes the key format inline.
- **Root Cause:** Accidental inconsistency. The GET handler also needs a direct Redis instance for the `pipeline_progress:${runId}` lookup, so the developer used `getRedis()` for both reads rather than mixing import sources.
- **Risk Assessment:** No API response shape changes. No existing tests for this GET handler. No security or auth logic involved. Scope is minimal. The only risk is the import addition; if `agent-runtime` ever throws on import (e.g., misconfigured dependency), the GET handler would fail — but that is no worse than the current state where `getRedis()` would also throw.
- **Validated Fix:**
  1. Add `getActiveRunId` to the import from `@/lib/agent-runtime` at the top of `src/app/api/content-pipeline/[ideaId]/route.ts`.
  2. Replace lines 121-123:
     ```ts
     const runId = await redis.get<string>(
       `active_run:content-critique:${ideaId}`,
     );
     ```
     with:
     ```ts
     const runId = await getActiveRunId('content-critique', ideaId);
     ```
  3. The `getRedis()` import and its usage on line 118 (`const redis = getRedis()`) remain for the `pipeline_progress:${runId}` lookup on line 126.
- **Files Affected:** `src/app/api/content-pipeline/[ideaId]/route.ts` (one import addition, one call site replacement)
- **Estimated Scope:** Small — 2-3 lines changed
