# KB-043: Duplicated dependency graph in canGenerate

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/foundation/[id]/page.tsx:28-36`
- **Observed:** canGenerate re-encodes the exact same doc dependency graph that already exists as DOC_UPSTREAM in src/lib/agent-tools/foundation.ts. The same decision — which docs are required before a type can be generated — is being made in two places. Adding a new doc type requires updating both, and they can silently diverge.
- **Expected:** Import and reuse DOC_UPSTREAM from the shared module instead of duplicating the dependency graph
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-17
