# KB-004: Extract duplicated header gradient function

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/analyses/[id]/analysis/page.tsx:66-73`, `src/app/analyses/[id]/page.tsx:192-199`
- **Observed:** getHeaderGradient() appears identically in both files. Same gradient logic duplicated across two files makes consistent styling updates difficult.
- **Expected:** Extract to a shared utility and import in both pages.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16
