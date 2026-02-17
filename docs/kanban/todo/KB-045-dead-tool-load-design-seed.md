# KB-045: Dead tool: load_design_seed is never needed

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/agent-tools/foundation.ts:299-311`
- **Observed:** load_design_seed exposes a tool that returns designPrinciplesSeed, but generate_foundation_doc already loads and injects designPrinciplesSeed directly (line 249). The tool is redundant — no agent call path requires it separately, and exposing it as an agent tool invites unnecessary round trips.
- **Expected:** Remove the load_design_seed tool definition
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17
