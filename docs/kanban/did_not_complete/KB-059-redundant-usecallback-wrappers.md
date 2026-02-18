# KB-059: Redundant useCallback wrappers on functions only used in effects

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/website/[id]/page.tsx:23-75`
- **Observed:** `pollProgress`, `triggerGeneration`, and `resetProgress` are wrapped in `useCallback` with an eslint-disable comment to suppress exhaustive-deps warnings. With React 19's compiler, memoization is handled automatically. The build page already uses plain async functions.
- **Expected:** Convert to plain `async function` declarations, remove `useCallback` import, and eliminate the eslint-disable suppression to align with the build page pattern.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17
- **Resolved:** 2026-02-17
- **Fix:** Closed during triage — false positive. The KB item's premise that these functions are "only used in effects" is inaccurate. `triggerGeneration` and `resetProgress` are called from JSX event handlers (lines 411, 430, 434). More critically, `pollProgress` uses `useCallback` with `triggered` in its dependency array (line 43) to prevent a stale closure inside the `setInterval` at lines 56 and 97 — a correctness concern, not a performance one. The React 19 compiler argument addresses memoization overhead but does not resolve stale closures in long-running intervals. Removing `useCallback` here would introduce a subtle bug where `pollProgress` closes over a stale `triggered` value from the render when the interval started. The build page comparison (plain `async function loadIdea()` declared inside a `useEffect`) is a structurally different pattern that does not involve interval-based polling or cross-function dependencies.
