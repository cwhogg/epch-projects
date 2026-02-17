# KB-015: GitHub API helpers duplicated across painted-door-agent and agent-tools/website

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/painted-door-agent.ts:71-112`
- **Observed:** `createGitHubRepo` and `pushFilesToGitHub` are defined identically in both `src/lib/painted-door-agent.ts` (lines 71-112, 114-230) and `src/lib/agent-tools/website.ts` (lines 24-67, 69-165). Any bug fix or API change must be applied in two places, and the two implementations have already diverged slightly (e.g., the commit message parameter differs).
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** CONFIRM
- **Evidence:**
  - `src/lib/painted-door-agent.ts:71-112` — `createGitHubRepo` (local, unexported)
  - `src/lib/painted-door-agent.ts:114-211` — `pushFilesToGitHub` (local, unexported, hardcoded commit message at line 186)
  - `src/lib/painted-door-agent.ts:215-251` — `createVercelProject` (local, unexported) — also duplicated, not noted in KB
  - `src/lib/painted-door-agent.ts:259-304` — `triggerDeployViaGitPush` (local, unexported) — also duplicated, not noted in KB
  - `src/lib/agent-tools/website.ts:20-22` — comment reads "GitHub API helpers (extracted from painted-door-agent.ts)" confirming extraction was started but not completed
  - `src/lib/agent-tools/website.ts:24-67` — `createGitHubRepo` (copy)
  - `src/lib/agent-tools/website.ts:69-165` — `pushFilesToGitHub` (copy, but with parameterized `message` at line 73, allowing "Fix build errors" on retries at line 753)
  - `src/lib/agent-tools/website.ts:167-203` — `createVercelProject` (copy)
  - `src/lib/agent-tools/website.ts:205-246` — `triggerDeployViaGitPush` (copy)
  - Divergence is real and consequential: `website.ts` `pushFilesToGitHub` accepts a `message` parameter; `painted-door-agent.ts` version does not. A bug fix in one copy will not automatically propagate to the other.
- **Root Cause:** Incomplete v1-to-v2 migration. The developer copied the GitHub/Vercel helpers from `painted-door-agent.ts` into `agent-tools/website.ts` as part of the v2 agent refactor but never deleted the originals from the v1 file. The v1 pipeline (`runPaintedDoorAgent`) still calls its own local copies; only v2 uses the `website.ts` versions. The comment in `website.ts` is explicit that extraction was intended.
- **Risk Assessment:** Low. These are internal helpers with no external API surface. No call-site signature changes are needed (the `message` parameter defaults cover the v1 call site). No test files exist for either module, so no test breakage risk. No auth or security logic is altered — tokens continue to be read from `process.env`.
- **Validated Fix:**
  1. Create `src/lib/github-api.ts` (or `src/lib/deployment-helpers.ts`) and export all four functions: `createGitHubRepo`, `pushFilesToGitHub` (using the parameterized `website.ts` signature with `message` default), `createVercelProject`, `triggerDeployViaGitPush`.
  2. In `src/lib/agent-tools/website.ts`: remove the four local function definitions (lines 24–246) and add an import from the new shared module.
  3. In `src/lib/painted-door-agent.ts`: remove the four local function definitions (lines 71–304) and add an import from the new shared module. The existing call site at line 433 (`pushFilesToGitHub(repo.owner, repo.name, allFiles)`) is compatible with the defaulted `message` parameter — no change needed there.
  4. Run `npm run build` to confirm no import errors.
- **Files Affected:**
  - `src/lib/github-api.ts` (new file — or `src/lib/deployment-helpers.ts`)
  - `src/lib/painted-door-agent.ts` (remove 4 local helpers, add import)
  - `src/lib/agent-tools/website.ts` (remove 4 local helpers, add import)
- **Estimated Scope:** Small — approximately 230 lines deleted across two files, ~80 lines added to the new shared module, plus two import lines.
