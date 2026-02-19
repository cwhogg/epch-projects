# KB-094: assembleSystemPrompt is a god function with 6 async fetches and prompt assembly

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/app/api/painted-door/[id]/chat/route.ts:23-110`
- **Observed:** `assembleSystemPrompt` is 88 lines and performs 6 distinct async operations (advisor prompt, framework prompt, foundation docs, content context, idea fetch, existing site check), plus mode-specific string assembly and advisor roster building — all in a single flat function. Any change to how any data source is fetched or formatted requires navigating this entire function.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** REVISE
- **Evidence:** Code at `src/app/api/painted-door/[id]/chat/route.ts:23-110` matches the KB description. The function is 88 lines. However the KB overcounts async operations: `getAdvisorSystemPrompt` (line 28) and `getFrameworkPrompt` (line 31) are synchronous file reads with caching — not async. The four genuinely async calls are: `getAllFoundationDocs` (line 34), `buildContentContext` (line 49), `getIdeaFromDb` (line 50), and `getPaintedDoorSite` (line 62). Additionally those four async calls are currently sequential despite being data-independent.
- **Root Cause:** Incremental feature accretion. The numbered comments (`// 1.`, `// 2.`, etc.) show the author was aware of the sections but kept them flat for convenience. Not intentional design.
- **Risk Assessment:** No API surface change — the function signature and return type are unchanged. Tests at `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts` mock all sub-dependencies and test `assembleSystemPrompt` as a black box; they remain valid after extraction. No auth logic touched. Sub-functions should be unexported to avoid widening the module's API surface. The `getIdeaFromDb` double-fetch (once directly at line 50, once inside `buildContentContext` at `src/lib/content-context.ts:13`) persists after decomposition — not worth fixing in this pass as the call hits a fast Redis cache.
- **Validated Fix:** Extract five private helper functions, then make `assembleSystemPrompt` a thin coordinator. Also parallelise the three independent async fetches with `Promise.all`.
  1. Extract `fetchFoundationSection(ideaId: string): Promise<string>` — wraps `getAllFoundationDocs` call (lines 34-46) and returns the formatted markdown block.
  2. Extract `fetchIdeaSection(ideaId: string): Promise<string>` — wraps `getIdeaFromDb` + `buildContentContext` calls (lines 49-59) and returns the formatted markdown block.
  3. Extract `fetchSiteSection(ideaId: string): Promise<string>` — wraps `getPaintedDoorSite` call (lines 62-66) and returns the formatted markdown block (empty string when no live site).
  4. Extract `buildModeInstruction(mode: BuildMode): string` — pure function returning the mode-specific instruction block (lines 69-75).
  5. Extract `buildAdvisorRoster(): string` — pure function building the advisor roster markdown (lines 78-81).
  6. In the revised `assembleSystemPrompt`: call `fetchFoundationSection`, `fetchIdeaSection`, and `fetchSiteSection` in parallel via `Promise.all`, then assemble the final template with results from all helpers.
  7. None of the five helpers need to be exported. Keep them module-private.
  8. No test changes required — existing tests mock all sub-dependencies and test the exported function's output contract.
- **Files Affected:**
  - `src/app/api/painted-door/[id]/chat/route.ts` (only file modified)
- **Estimated Scope:** Small — ~30 lines added (helper function signatures and bodies), ~55 lines reorganised. Net coordinator function shrinks from 88 lines to ~30 lines. Parallel `Promise.all` is a latency improvement with zero behaviour change for callers.
