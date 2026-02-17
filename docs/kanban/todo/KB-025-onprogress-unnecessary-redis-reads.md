# KB-025: onProgress callback reads Redis on every agent step regardless of action

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/content-critique-agent.ts:116-142`
- **Observed:** The onProgress callback does a full Redis get + JSON.parse + JSON.stringify + Redis set on every agent step (tool_call, complete, error). It always pays the full Redis round-trip cost even for steps that produce no state change (silently does nothing if the step isn't tool_call/complete/error, yet still reads Redis first).
- **Expected:** Early-return for unhandled step types before the Redis read, avoiding unnecessary round-trips.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16
