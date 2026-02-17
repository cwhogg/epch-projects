# KB-012: Split painted-door-agent.ts exceeding 792 lines

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/painted-door-agent.ts:1-792`
- **Observed:** The painted door agent is 792 lines combining GitHub API helpers, Vercel API helpers, pipeline orchestration, and agent configuration. Several of these GitHub/Vercel helpers are duplicated from agent-tools/website.ts (see KB-015), and the file does too much to scan quickly.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** REVISE
- **Evidence:**
  - `src/lib/painted-door-agent.ts` is exactly 792 lines (lines 1-792 confirmed).
  - The file contains two structurally distinct things:
    1. **V1 pipeline** (lines 42-558): `runPaintedDoorAgent` — a sequential, step-by-step imperative pipeline with its own inline GitHub/Vercel helpers (`createGitHubRepo`, `pushFilesToGitHub`, `createVercelProject`, `triggerDeployViaGitPush`, `getProjectProductionUrl`, `waitForDeployment`).
    2. **V2 agentic builder** (lines 560-792): `runPaintedDoorAgentV2` — drives the LLM-based agent loop, delegates all API work to `agent-tools/website.ts`, and handles pause/resume logic.
    3. Auto-switcher (lines 787-792): `runPaintedDoorAgentAuto` — two-line dispatch based on `AGENT_V2` env var.
  - The KB entry's duplication claim is accurate: `src/lib/agent-tools/website.ts` (lines 24-246) contains its own copies of `createGitHubRepo`, `pushFilesToGitHub`, `createVercelProject`, and `triggerDeployViaGitPush`. These are near-identical to the v1 copies in painted-door-agent.ts. The comment at `website.ts:21` even says "extracted from painted-door-agent.ts" — meaning extraction happened in the agent-tools direction but the v1 originals were never removed.
  - Key difference between the copies: `pushFilesToGitHub` in `website.ts:73` accepts an optional `message` parameter (`message = 'Initial commit: painted door test site'`) whereas the v1 copy in `painted-door-agent.ts:114` hardcodes the message. All other logic is functionally identical.
- **Root Cause:**
  - When the V2 agentic path was built, the GitHub/Vercel helpers were duplicated into `agent-tools/website.ts` to make that module self-contained. The V1 pipeline and its inline helpers were left intact to avoid disrupting a working path. The result is that both paths now live in the same file, with the V1 helpers orphaned relative to the V2 extraction.
  - This is not intentional design — it is accumulated drift from an incremental migration that was never completed.
- **Risk Assessment:**
  - Deleting the V1 inline helpers (lines 69-382) requires first confirming V1 is actually still invoked in production. `runPaintedDoorAgentAuto` gates on `AGENT_V2 === 'true'` — if that env var is set in Vercel, V1 is dead code. If it is not set, V1 is the live path and its helpers must not be deleted until V1 is removed.
  - The `getProjectProductionUrl` and `waitForDeployment` helpers (lines 306-382) exist only in V1 — they have no equivalent in `agent-tools/website.ts`, which uses a polling `check_deploy_status` tool instead. These cannot be deleted until V1 is retired.
  - No API response shapes change. No existing tests visible for this file (no test file found referencing painted-door-agent).
  - Splitting the file (V1 to one file, V2 to another) would add an import of `runPaintedDoorAgent` from a new path in the auto-switcher — minor, low risk.
- **Validated Fix:**
  The original KB item says "split the file." That framing is slightly off — the real fix is in two sequential phases:
  1. **Phase 1 (prerequisite — depends on KB-015):** KB-015 covers deduplication of the GitHub/Vercel helpers. Do that first. Once the shared helpers live in one canonical place (e.g., `src/lib/github-api.ts` / `src/lib/vercel-api.ts`), both `painted-door-agent.ts` (V1) and `agent-tools/website.ts` can import from there. This removes ~170 lines of inline helpers from `painted-door-agent.ts` without splitting the file.
  2. **Phase 2 (V1 retirement check):** Confirm whether `AGENT_V2=true` is set in Vercel production. If yes, V1 (`runPaintedDoorAgent`, lines 386-558) is dead code and can be deleted outright — along with `getProjectProductionUrl` and `waitForDeployment`. The auto-switcher collapses to a direct export. The file shrinks to ~200 lines covering only V2 setup + the `runPaintedDoorAgentAuto` wrapper.
  - If V1 is still live, Phase 2 is: extract V1 into `src/lib/painted-door-agent-v1.ts` and re-import it, keeping V2 in the main file. But this is only worth doing if the team plans to maintain V1 long-term; if V1 is going away, deletion is simpler.
  - Do NOT proceed with Phase 2 until Phase 1 (KB-015) is resolved — splitting helpers between files before deduplication would make KB-015 harder.
- **Files Affected:**
  - `src/lib/painted-door-agent.ts` (primary — helper removal and/or V1 deletion)
  - `src/lib/agent-tools/website.ts` (import updated after KB-015 dedup)
  - Potentially: `src/lib/github-api.ts`, `src/lib/vercel-api.ts` (new shared modules, created by KB-015)
- **Estimated Scope:** Medium — ~170 lines removed in Phase 1 (post KB-015), ~170 more removed in Phase 2 if V1 is retired. No logic changes, only code consolidation and deletion.
