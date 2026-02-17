# KB-025: onProgress callback reads Redis on every agent step regardless of action

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/content-critique-agent.ts:116-142`
- **Observed:** The onProgress callback does a full Redis get + JSON.parse + JSON.stringify + Redis set on every agent step (tool_call, complete, error). It always pays the full Redis round-trip cost even for steps that produce no state change (silently does nothing if the step isn't tool_call/complete/error, yet still reads Redis first).
- **Expected:** Early-return for unhandled step types before the Redis read, avoiding unnecessary round-trips.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** `src/lib/content-critique-agent.ts:116-142` — the `onProgress` callback calls `getRedis().get(...)` at line 119 unconditionally on every agent step. The conditional branch at lines 127-135 handles only `tool_call`, `complete`, and `error`. Any other step type falls through without mutating `p`, but the Redis SET at line 137 still executes. Both round-trips (GET + SET) are wasted for unhandled step types.
- **Root Cause:** Accidental omission — the early-return guard was never added when the callback was written. The code was structured read-then-update-then-write without accounting for step types that require no update.
- **Risk Assessment:** Low. The fix inserts a guard before the Redis GET and changes nothing about the three handled step types. No API surface is affected. Existing tests mock `runAgent` and never invoke `onProgress` directly, so they will not break. One new test should be added to cover the early-return path.
- **Validated Fix:**
  1. In `src/lib/content-critique-agent.ts`, after the `console.log` at line 117, add:
     ```typescript
     if (step !== 'tool_call' && step !== 'complete' && step !== 'error') return;
     ```
     This must appear before the `getRedis().get(...)` call at line 119.
  2. In `src/lib/__tests__/content-critique-agent.test.ts`, add a test that extracts the `onProgress` config from the `runAgent` mock call and invokes it with an unhandled step type (e.g., `'thinking'`). Assert that `getRedis().get` was not called.
- **Files Affected:**
  - `src/lib/content-critique-agent.ts`
  - `src/lib/__tests__/content-critique-agent.test.ts`
- **Estimated Scope:** Small — 3-4 lines added to source, 1 new test case (~15 lines)
