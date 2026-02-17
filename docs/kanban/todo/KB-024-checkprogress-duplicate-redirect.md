# KB-024: checkProgress contains duplicate redirect logic across pipelineMode branches

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/analyses/[id]/content/generate/page.tsx:76-104`
- **Observed:** checkProgress branches on pipelineMode into two near-identical fetch-then-set-state blocks. Both branches end with the same setTimeout redirect (2000ms, same URL). The redirect is the only shared behavior but lives duplicated in both arms of the if/else.
- **Expected:** Extract the shared redirect logic after the if/else, or unify the two branches.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16
