# KB-033: Migrate content-critique-agent to runAgentLifecycle

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/content-critique-agent.ts:1-9, 83-163`
- **Observed:** This branch introduced runAgentLifecycle in agent-runtime.ts and migrated analytics-agent.ts, research-agent.ts, and content-agent-v2.ts to use it, but content-critique-agent.ts was skipped. It still imports 6 individual lifecycle primitives and re-implements the full pause/resume/cleanup sequence manually — the identical pattern that runAgentLifecycle now encapsulates. Three agents use the abstraction; one does not.
- **Expected:** Migrate content-critique-agent.ts to use runAgentLifecycle, matching the pattern in the other three V2 agents.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-17
