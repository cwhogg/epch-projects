# KB-110: Remove temporary test-deploy debugging endpoint

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/painted-door/[id]/test-deploy/route.ts:1-121`
- **Observed:** The file's own JSDoc comment reads "Temporary debugging endpoint." It hardcodes a brand identity object with placeholder values and embeds the deployment timestamp directly in generated page content. This was scaffolding to verify the deploy pipeline.
- **Expected:** Delete the file if no longer needed, or convert to a proper test utility if the functionality is still useful.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-20
