# KB-038: Split checkProgress into two mode-specific polling functions

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/content/[id]/generate/page.tsx:76-108`
- **Observed:** checkProgress branches on pipelineMode to call different endpoints, update different state slices (setProgress vs setCritiqueProgress), and evaluate different completion conditions. This is two functions with one name sharing a polling interval — a new contributor must trace two parallel execution paths through a single function to understand either one.
- **Expected:** Split into two named functions (e.g., pollGenerationProgress and pollCritiqueProgress), each owning its endpoint, state update, and done-condition. Share the polling interval setup.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** `src/app/content/[id]/generate/page.tsx:76-108` — `checkProgress` is a 32-line `useCallback` with a top-level `if (pipelineMode)` branch. The two paths differ in endpoint (`/api/content-pipeline/${analysisId}` vs `/api/content/${analysisId}/generate`), state setter (`setCritiqueProgress` vs `setProgress`), done-condition (checks two statuses `'complete' || 'max-rounds-reached'` vs one `'complete'`), and the data shape consumed. The only shared logic is the `isDone` flag and the `setTimeout(() => router.push(...), 2000)` redirect at lines 100-104.
- **Root Cause:** The page was originally built for generation mode only. Pipeline/critique mode was added later by branching inside the existing polling callback rather than restructuring the component. This is incremental growth, not intentional co-location.
- **Risk Assessment:** Purely internal component restructuring. No external callers depend on `checkProgress`. No API response shapes change. No tests exist for this page component (`src/app/content/[id]/generate/`). The `useEffect` polling setup (lines 116-123) is unchanged — only its callback reference changes. No auth or security logic involved.
- **Validated Fix:**
  1. Replace `checkProgress` with two separate `useCallback` functions: `pollGenerationProgress` and `pollCritiqueProgress`.
  2. `pollGenerationProgress`: fetch `/api/content/${analysisId}/generate`, call `setProgress(data)`, redirect if `data.status === 'complete'`.
  3. `pollCritiqueProgress`: fetch `/api/content-pipeline/${analysisId}`, call `setCritiqueProgress(data)`, redirect if `data.status === 'complete' || data.status === 'max-rounds-reached'`.
  4. The redirect (`setTimeout(() => router.push(...), 2000)`) can be duplicated inline in each function — it is one line and duplication here is clearer than extracting a third callback.
  5. Update the `useEffect` at line 119 to call `pipelineMode ? pollCritiqueProgress : pollGenerationProgress` and update the dependency array accordingly.
  6. No changes needed to any external files or utilities.
- **Files Affected:** `src/app/content/[id]/generate/page.tsx` only
- **Estimated Scope:** Small — net change is ~10 lines (splitting one 32-line function into two ~15-line functions, updating one `useEffect` call)
