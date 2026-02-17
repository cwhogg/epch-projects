# KB-029: Agent run lifecycle duplicated across three agent modules

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/analytics-agent.ts:496-563`
- **Observed:** The pattern of checking for a paused run, building an AgentConfig, calling runAgent or resumeAgent, handling AGENT_PAUSED, cleaning up state, and fetching the saved result is implemented identically in runAnalyticsAgentV2 (analytics-agent.ts:496), runResearchAgentV2 (research-agent.ts:222), and generateContentPiecesV2 (content-agent-v2.ts:58). Three copies of the same ~60-line lifecycle block means any fix to pause/resume handling must be applied in three places.
- **Expected:** Extract a shared `runAgentLifecycle()` helper in agent-runtime.ts that encapsulates the check-for-paused, run-or-resume, handle-pause, cleanup pattern
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-16

## Triage (2026-02-17)

- **Verdict:** REVISE
- **Evidence:**
  - `src/lib/analytics-agent.ts:504-563` — `runAnalyticsAgentV2`: pause check (504-509), runId derivation (511), AgentConfig build (513-530), run/resume dispatch (533-540), pause throw (542-546), cleanup (548-549), error rethrow (551-553), fetch saved result (555-562)
  - `src/lib/research-agent.ts:223-386` — `runResearchAgentV2`: identical lifecycle skeleton (223-228, 230, 290-332, 334-351, 354-358, 361-362, 364-367), plus extra progress-object initialization before AgentConfig build (236-269)
  - `src/lib/content-agent-v2.ts:64-208` — `generateContentPiecesV2`: identical lifecycle skeleton (64-69, 71, 114-157, 160-184, 187-191, 193-194, 196-198); no result fetch (content saved via side-effect tools)
  - `src/lib/agent-runtime.ts` — already houses all primitives (`runAgent`, `resumeAgent`, `saveActiveRun`, `getActiveRunId`, `clearActiveRun`, `deleteAgentState`, `saveAgentState`, `getAgentState`); no lifecycle wrapper exists yet
- **Root Cause:** Each agent module was written independently as the agentic pattern was introduced. `agent-runtime.ts` was never extended with a lifecycle wrapper above the primitives — the pattern was copy-pasted each time a new agent was added.
- **Risk Assessment:**
  - No API response shape changes — purely internal refactor
  - `throw new Error('AGENT_PAUSED')` must be preserved so upstream route handlers continue to catch it; the helper must rethrow
  - `research-agent.ts` initializes a progress object between the pause check and AgentConfig build — this code must be callable from inside the config factory, not lost
  - `content-agent-v2.ts` uses a `currentPieceIdx` closure variable inside `onProgress` — this closure lives inside the config factory and continues to work correctly
  - Three files modified plus `agent-runtime.ts` extended; scope is medium
- **Validated Fix — REVISE from original proposal:**
  The original "extract `runAgentLifecycle()`" is correct in intent but the signature needs to accommodate per-agent variation. Use a factory-function pattern:

  ```typescript
  // agent-runtime.ts — add:
  export async function runAgentLifecycle(
    agentId: string,
    entityId: string,
    makeConfig: (runId: string, isResume: boolean, pausedState: AgentState | null) => AgentConfig,
    makeInitialMessage: () => string,
  ): Promise<AgentState> {
    const existingRunId = await getActiveRunId(agentId, entityId);
    let pausedState = existingRunId ? await getAgentState(existingRunId) : null;
    if (pausedState && pausedState.status !== 'paused') pausedState = null;

    const runId = pausedState ? pausedState.runId : `${agentId}-${entityId}-${Date.now()}`;
    const isResume = !!pausedState;

    const config = makeConfig(runId, isResume, pausedState);

    let state: AgentState;
    if (pausedState) {
      state = await resumeAgent(config, pausedState);
    } else {
      state = await runAgent(config, makeInitialMessage());
    }

    if (state.status === 'paused') {
      await saveActiveRun(agentId, entityId, runId);
      throw new Error('AGENT_PAUSED');
    }

    await clearActiveRun(agentId, entityId);
    await deleteAgentState(runId);

    if (state.status === 'error') {
      throw new Error(state.error || `${agentId} agent failed`);
    }

    return state;
  }
  ```

  Each caller then becomes:
  - Pass `agentId`, `entityId` (e.g., `weekId`, `idea.id`, `ideaId`)
  - `makeConfig` receives `runId`, `isResume`, `pausedState` so it can initialize progress and build tools
  - `makeInitialMessage` returns the agent-specific initial prompt string
  - After `runAgentLifecycle` returns, caller does its agent-specific result fetch (analytics: `getWeeklyReport`; research: `getAnalysisFromDb`; content: nothing)

  Steps:
  1. Add `runAgentLifecycle` export to `src/lib/agent-runtime.ts`
  2. Refactor `src/lib/analytics-agent.ts:496-563` to use `runAgentLifecycle`
  3. Refactor `src/lib/research-agent.ts:222-386` to use `runAgentLifecycle`
  4. Refactor `src/lib/content-agent-v2.ts:58-198` to use `runAgentLifecycle`
  5. Add/update tests for `runAgentLifecycle` in agent-runtime test file (if one exists)

- **Files Affected:**
  - `src/lib/agent-runtime.ts` (add `runAgentLifecycle` export)
  - `src/lib/analytics-agent.ts` (refactor `runAnalyticsAgentV2`)
  - `src/lib/research-agent.ts` (refactor `runResearchAgentV2`)
  - `src/lib/content-agent-v2.ts` (refactor `generateContentPiecesV2`)

- **Estimated Scope:** Medium — ~50 lines added to agent-runtime.ts, ~40-60 lines removed from each of the three agent modules. Primary complexity is the `makeConfig` factory pattern and verifying the `currentPieceIdx` closure in content-agent still works.
