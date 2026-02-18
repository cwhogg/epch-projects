# KB-045: Dead tool: load_design_seed is never needed

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/agent-tools/foundation.ts:299-311`
- **Observed:** load_design_seed exposes a tool that returns designPrinciplesSeed, but generate_foundation_doc already loads and injects designPrinciplesSeed directly (line 249). The tool is redundant — no agent call path requires it separately, and exposing it as an agent tool invites unnecessary round trips.
- **Expected:** Remove the load_design_seed tool definition
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** `load_design_seed` is defined at `src/lib/agent-tools/foundation.ts:304-315`. The `generate_foundation_doc` tool at line 246-250 already imports and injects `designPrinciplesSeed` directly — `load_design_seed` is never called by any route, agent system prompt, or other code path. The foundation agent system prompt (`src/lib/foundation-agent.ts:17-34`) lists only `generate_foundation_doc` and `load_foundation_docs` as intended tools; `load_design_seed` is never mentioned.
- **Root Cause:** Tool was created during early development when the design seed was fetched separately. The logic was later folded into `generate_foundation_doc` (line 249) but the standalone tool was not removed — a cleanup oversight.
- **Risk Assessment:** Low. No route, API handler, page, or agent prompt references `load_design_seed`. The only risk is a test regression: `src/lib/__tests__/foundation-tools.test.ts` has a `toHaveLength(3)` assertion (line 56), an explicit tool name array including `load_design_seed` (line 60), and a `describe('load_design_seed', ...)` block (lines 272-281) — all three must be updated as part of the fix.
- **Validated Fix:**
  1. In `src/lib/agent-tools/foundation.ts`: delete the `load_design_seed` tool object (the object starting at line 304 through the closing `},` at line 315, including the preceding blank line).
  2. In `src/lib/__tests__/foundation-tools.test.ts`:
     - Change `expect(tools).toHaveLength(3)` to `toHaveLength(2)`.
     - Remove `'load_design_seed'` from the name array on line 60.
     - Delete the `describe('load_design_seed', ...)` block (lines 272-281).
- **Files Affected:**
  - `src/lib/agent-tools/foundation.ts`
  - `src/lib/__tests__/foundation-tools.test.ts`
- **Estimated Scope:** Small — ~15 lines deleted across two files, no logic changes.
