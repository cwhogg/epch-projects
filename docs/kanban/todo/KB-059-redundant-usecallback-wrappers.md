# KB-059: Redundant useCallback wrappers on functions only used in effects

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/website/[id]/page.tsx:23-75`
- **Observed:** `pollProgress`, `triggerGeneration`, and `resetProgress` are wrapped in `useCallback` with an eslint-disable comment to suppress exhaustive-deps warnings. With React 19's compiler, memoization is handled automatically. The build page already uses plain async functions.
- **Expected:** Convert to plain `async function` declarations, remove `useCallback` import, and eliminate the eslint-disable suppression to align with the build page pattern.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17
