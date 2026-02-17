# KB-009: Split agent-tools/website.ts exceeding 1131 lines

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/agent-tools/website.ts:1-1131`
- **Observed:** The website tools file is 1131 lines, containing GitHub API helpers, Vercel API helpers, a full Git Data API workflow, and all website agent tool definitions. The GitHub/Vercel infrastructure code could be extracted into dedicated modules to make each concern independently understandable.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** REVISE
- **Evidence:**
  - `src/lib/agent-tools/website.ts:20-246` — four GitHub/Vercel helper functions defined as module-private: `createGitHubRepo`, `pushFilesToGitHub`, `createVercelProject`, `triggerDeployViaGitPush`. The comment at line 20 reads "GitHub API helpers (extracted from painted-door-agent.ts)", indicating extraction was already intended.
  - `src/lib/painted-door-agent.ts:71-303` — the same four functions defined again as module-private. `painted-door-agent.ts` imports `createWebsiteTools` from `website.ts` (line 23), but never removed its own local copies of the helpers. Both files independently define identical implementations. `pushFilesToGitHub` in `website.ts` (line 69) adds an optional `message` parameter not present in `painted-door-agent.ts:114` — this is the only divergence between the two copies.
  - No tests exist for `website.ts` or `painted-door-agent.ts`.
- **Root Cause:** Partial extraction. When `website.ts` was created, the four helper functions were copied into it from `painted-door-agent.ts`, but `painted-door-agent.ts` was never cleaned up. `website.ts` grew to 1131 lines partly because it carries infrastructure code that belongs in a shared utility, and partly because `painted-door-agent.ts` retains dead copies that were never deleted. The code simplifier flagged line count as the symptom but the root cause is an incomplete refactor.
- **Risk Assessment:**
  - Deleting helpers from `painted-door-agent.ts` and importing from a shared module removes dead code with no behavioral change — `painted-door-agent.ts` will use the same logic it was already using.
  - The `message` parameter divergence in `pushFilesToGitHub` must be preserved in the shared version. The `painted-door-agent.ts` call site passes no message argument; the `website.ts` call site at line 753 passes a dynamic message. The shared function must keep the optional `message` parameter from `website.ts`.
  - No tests for either file — refactor carries standard manual verification risk (confirm build passes, confirm `npm run lint` passes).
  - No API response shape changes. Pure infrastructure refactor.
- **Validated Fix:**
  1. Create `src/lib/github-vercel-api.ts` — move the four helpers from `website.ts` (lines 24-246) into this new module and export them. Preserve the optional `message` parameter on `pushFilesToGitHub`.
  2. In `src/lib/agent-tools/website.ts` — remove lines 20-246 (the local helper definitions). Add an import from `../github-vercel-api` for the four functions. Verify remaining file length is approximately 880 lines (reasonable for a single tool registry).
  3. In `src/lib/painted-door-agent.ts` — remove lines 69-303 (the duplicate local definitions of all four helpers plus the `// ---------- GitHub API ----------` and `// ---------- Vercel API ----------` section comments). Add an import from `./github-vercel-api` for the four functions.
  4. Run `npm run build` and `npm run lint` to verify no regressions.
  - **Prerequisite:** None. The shared module is new; no existing consumers need updating beyond the two files above.
- **Files Affected:**
  - `src/lib/github-vercel-api.ts` (new file — created from extracted helpers)
  - `src/lib/agent-tools/website.ts` (remove local helpers, add import)
  - `src/lib/painted-door-agent.ts` (remove duplicate helpers, add import)
- **Estimated Scope:** Small. ~235 lines deleted from `website.ts`, ~235 lines deleted from `painted-door-agent.ts`, ~60 lines added to new `github-vercel-api.ts`. Net: significant line count reduction in both files, no logic changes.
