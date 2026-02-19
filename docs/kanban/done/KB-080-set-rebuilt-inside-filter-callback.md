# KB-080: Set rebuilt inside filter callback in useWeeklyReport

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/hooks/useWeeklyReport.ts:61-64`
- **Observed:** `ideaAlerts` filter creates a new `Set(ideaPieces.map(...))` on every iteration of the filter callback. This rebuilds the Set for every alert element.
- **Expected:** Hoist `const ideaSlugs = new Set(ideaPieces.map((p) => p.slug))` above the filter callback.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** CONFIRM
- **Evidence:** `src/hooks/useWeeklyReport.ts:61-64` — `ideaSlugs` Set is constructed inside the `.filter()` callback body on line 62, executing `new Set(ideaPieces.map((p) => p.slug))` once per alert element instead of once before the loop.
- **Root Cause:** Accidental — the Set construction was written inline during the filter without recognizing it runs per-element. No intentional design reason to rebuild it on each iteration.
- **Risk Assessment:** Zero risk. This is a pure client-side hook computation with no API surface, no response shape changes, and no callers affected by the internal reordering. `ideaPieces` is already computed on line 60 and available.
- **Validated Fix:** Hoist the Set construction above the filter call:
  ```ts
  const ideaSlugs = new Set(ideaPieces.map((p) => p.slug));
  const ideaAlerts = weeklyReport?.alerts.filter((a) => ideaSlugs.has(a.pieceSlug)) ?? [];
  ```
- **Files Affected:** `src/hooks/useWeeklyReport.ts` (lines 61-64 only)
- **Estimated Scope:** Small — 2 lines changed, zero complexity
