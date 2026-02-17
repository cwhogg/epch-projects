# KB-027: Interleaved Promise.all with index arithmetic to reconstruct pivot data

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/analyses/[id]/page.tsx:114-128`
- **Observed:** Pivot suggestions and history for all assumption types are fetched in a single flattened Promise.all and then reconstructed via i*2 / i*2+1 index math. The same data is fetched in the validation route (route.ts lines 43-48) using a readable for-loop; these two call-sites make the same decision differently, and the page.tsx variant is fragile to any reordering.
- **Expected:** Use a consistent pattern across both call sites — either parallel fetches with per-type grouping or a shared helper function.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16
