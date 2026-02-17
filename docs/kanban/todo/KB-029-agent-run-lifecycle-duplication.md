# KB-029: Agent run lifecycle duplicated across three agent modules

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/analytics-agent.ts:496-563`
- **Observed:** The pattern of checking for a paused run, building an AgentConfig, calling runAgent or resumeAgent, handling AGENT_PAUSED, cleaning up state, and fetching the saved result is implemented identically in runAnalyticsAgentV2 (analytics-agent.ts:496), runResearchAgentV2 (research-agent.ts:222), and generateContentPiecesV2 (content-agent-v2.ts:58). Three copies of the same ~60-line lifecycle block means any fix to pause/resume handling must be applied in three places.
- **Expected:** Extract a shared `runAgentLifecycle()` helper in agent-runtime.ts that encapsulates the check-for-paused, run-or-resume, handle-pause, cleanup pattern
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-16
