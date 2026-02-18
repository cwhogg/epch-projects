# KB-034: Duplicated canvas generation block across two files

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/research-agent.ts:192-198` and `src/lib/agent-tools/research.ts:351-357`
- **Observed:** The try/catch block that calls generateAssumptions after analysis completion appears identically in both files. The same dynamic import, error log pattern, and best-effort semantics are duplicated. Any change must be made in both places.
- **Expected:** Extract a shared helper (e.g., `tryGenerateCanvas(ideaId)`) that both call sites use.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:**
  - `src/lib/research-agent.ts:192-198` — V1 procedural agent (`runResearchAgent`) calls `generateAssumptions` directly after `updateIdeaStatus(idea.id, 'complete')`.
  - `src/lib/agent-tools/research.ts:351-357` — `save_final_analysis` tool used by V2 agentic agent (`runResearchAgentV2`) calls `generateAssumptions` with identical try/catch pattern and best-effort semantics.
  - Both blocks: dynamic import of `validation-canvas`, `await generateAssumptions(idea.id)`, `console.error` with a different log prefix (`[research-agent]` vs `[research-tools]`), and no re-throw.
  - The two blocks are executed by independent code paths (V1 procedural vs V2 agentic), not one calling the other. Both paths are live — `runResearchAgentAuto` at `src/lib/research-agent.ts:375-382` dispatches to either based on a feature flag.
- **Root Cause:** The canvas generation block was added when V2 was introduced alongside V1. Because the `save_final_analysis` tool is responsible for persisting the analysis in V2, canvas generation had to be placed inside the tool rather than in `runResearchAgentV2` itself. The same block already existed in V1. Neither path was refactored to share the logic.
- **Risk Assessment:** Minimal. The extraction target would be a small, self-contained async function with no external dependencies beyond the existing dynamic import. No API response shapes change. No callers are affected — the helper would be internal to `src/lib/`. The only test exposure is `src/lib/__tests__/validation-canvas.test.ts` (tests `generateAssumptions` directly), which does not need to change. The log prefix difference (`[research-agent]` vs `[research-tools]`) should be preserved or parameterized so observability is not degraded.
- **Validated Fix:**
  1. Add `tryGenerateCanvas(ideaId: string): Promise<void>` to `src/lib/validation-canvas.ts` (or a new `src/lib/canvas-utils.ts` if the module feels like the wrong home):
     ```ts
     export async function tryGenerateCanvas(ideaId: string, logPrefix: string): Promise<void> {
       try {
         await generateAssumptions(ideaId);
       } catch (err) {
         console.error(`[${logPrefix}] Canvas generation failed for ${ideaId}:`, err);
       }
     }
     ```
  2. Replace `src/lib/research-agent.ts:192-198` with: `await tryGenerateCanvas(idea.id, 'research-agent');`
  3. Replace `src/lib/agent-tools/research.ts:351-357` with: `await tryGenerateCanvas(idea.id, 'research-tools');`
  4. Remove the dynamic import wrapper in both call sites — `tryGenerateCanvas` handles it internally.
  5. Add or update tests in `src/lib/__tests__/validation-canvas.test.ts` (or a new file) to cover `tryGenerateCanvas`: success path, error path (should not throw), and verify `console.error` is called on failure.
  - No prerequisite changes needed. `generateAssumptions` already exists and is exported from `validation-canvas.ts`.
- **Files Affected:**
  - `src/lib/validation-canvas.ts` (add `tryGenerateCanvas`)
  - `src/lib/research-agent.ts` (replace lines 192-198)
  - `src/lib/agent-tools/research.ts` (replace lines 351-357)
  - `src/lib/__tests__/validation-canvas.test.ts` (add tests for new helper)
- **Estimated Scope:** Small — ~15 lines added, ~12 lines removed, net reduction.
