# KB-002: Duplicated inline styles for version and edited badges

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/analyses/[id]/foundation/page.tsx:363-377, 491-507`
- **Observed:** The version badge styling and edited badge styling are duplicated across the expanded card view and collapsed card view. Same pattern repeats twice in the component.
- **Expected:** Extract shared badge style objects (e.g. `const versionBadgeStyle = {...}`, `const editedBadgeStyle = {...}`) to reduce duplication and ensure consistent styling if one instance gets updated.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16
