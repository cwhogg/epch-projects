# KB-027: Interleaved Promise.all with index arithmetic to reconstruct pivot data

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/analyses/[id]/page.tsx:114-128`
- **Observed:** Pivot suggestions and history for all assumption types are fetched in a single flattened Promise.all and then reconstructed via i*2 / i*2+1 index math. The same data is fetched in the validation route (route.ts lines 43-48) using a readable for-loop; these two call-sites make the same decision differently, and the page.tsx variant is fragile to any reordering.
- **Expected:** Use a consistent pattern across both call sites — either parallel fetches with per-type grouping or a shared helper function.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16

## Triage (2026-02-17)

- **Verdict:** REVISE
- **Evidence:** The index arithmetic pattern is confirmed at `src/app/analyses/[id]/page.tsx:97-111`. The `Promise.all` destructures `canvasAssumptions` first via rest spread, leaving `pivotResults` as a flat array. Index reconstruction uses `pivotResults[i * 2]` (suggestions) and `pivotResults[i * 2 + 1]` (history) inside `ASSUMPTION_TYPES.forEach`. The comparison route is `src/app/api/validation/[ideaId]/route.ts:43-48`, which uses a serial `for...of` loop — not a different parallel pattern. The KB item file reference ("route.ts") was ambiguous; the correct file is the validation route, not `src/app/api/analyses/[id]/route.ts`.
- **Root Cause:** The author needed a single `Promise.all` for full parallelism (10 concurrent Redis fetches: 5 types × 2 calls each) but TypeScript destructuring does not allow named rest elements in a mixed-type array. The index arithmetic is a workaround for that limitation. The validation route was written or modified separately and prioritized readability over parallelism, leaving two inconsistent patterns.
- **Risk Assessment:** No API response shape changes — the assembled `canvasPivotSuggestions` and `canvasPivotHistory` objects remain structurally identical. No auth or security logic is touched. The change is scoped inside an `if (canvasState)` guard. Existing tests (`src/app/api/validation/__tests__/route.test.ts`) test the route, not the page, so they are unaffected by the page.tsx change.
- **Validated Fix:** The KB item's proposed fix ("use consistent pattern across both call sites") is correct in direction but needs a concrete approach. The right fix preserves parallelism while eliminating the index math. Replace the index arithmetic block in `page.tsx` (lines 97-111) with a per-type `Promise.all` mapping pattern:

  ```typescript
  const [canvasAssumptions, pivotData] = await Promise.all([
    getAllAssumptions(id).catch(() => ({})),
    Promise.all(
      ASSUMPTION_TYPES.map(async (aType) => ({
        type: aType,
        suggestions: await getPivotSuggestions(id, aType).catch(() => []),
        history: await getPivotHistory(id, aType).catch(() => []),
      }))
    ),
  ]);
  const canvasPivotSuggestions: Record<string, unknown[]> = {};
  const canvasPivotHistory: Record<string, unknown[]> = {};
  for (const { type, suggestions, history } of pivotData) {
    if (suggestions.length > 0) canvasPivotSuggestions[type] = suggestions;
    if (history.length > 0) canvasPivotHistory[type] = history;
  }
  ```

  Optionally, apply the same pattern to `src/app/api/validation/[ideaId]/route.ts:43-48` to replace the serial loop with a parallel fetch — this is lower priority since it is a performance improvement, not a correctness fix, but would make both call sites consistent.

- **Files Affected:** `src/app/analyses/[id]/page.tsx` (primary); `src/app/api/validation/[ideaId]/route.ts` (optional, lower priority)
- **Estimated Scope:** Small — 10 lines replaced with ~15 cleaner lines in page.tsx; similar change in the route if included
