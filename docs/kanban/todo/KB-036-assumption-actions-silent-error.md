# KB-036: AssumptionActions silently swallows fetch errors

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/components/AssumptionActions.tsx:15-29`
- **Observed:** The updateStatus function doesn't handle non-ok responses or network failures. On failure, loading resets and the UI returns to pre-loading state with no feedback to the user. Silent failure in a user-facing action.
- **Expected:** Show an error state or message when the status update fails.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17
