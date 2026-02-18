# KB-056: Duplicated pivot-suggestions assembly pattern across route and page

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/app/api/validation/[ideaId]/route.ts:40-52`
- **Observed:** The pattern of fetching pivot suggestions and history for all ASSUMPTION_TYPES, then building two separate Record maps (pivotSuggestions, pivotHistory) from the results appears in both `src/app/api/validation/[ideaId]/route.ts` (lines 40-52) and `src/app/project/[id]/page.tsx` (lines 97-116). Both do a Promise.all over ASSUMPTION_TYPES, build the same two maps, and omit empty arrays. A shared `buildPivotData(ideaId)` helper would eliminate the duplication.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** MEDIUM
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:**
  - `src/app/api/validation/[ideaId]/route.ts:40-52` — `Promise.all` over `ASSUMPTION_TYPES`, fetches `getPivotSuggestions` and `getPivotHistory` per type, builds two `Record<string, unknown[]>` maps filtering out empty arrays. No `.catch()` on individual fetches — a single failure throws the entire GET.
  - `src/app/project/[id]/page.tsx:97-116` — identical pattern but with `.catch(() => [])` guards on each fetch, making it more error-resilient. Uses same filter-empty logic and produces the same two maps.
  - The two sites have already diverged in error handling — a real maintenance risk materializing.
  - `src/lib/validation-canvas.ts` already imports `getPivotSuggestions` (line 10) and is the natural home for the helper.
  - `src/types/index.ts:499-504` defines `ValidationCanvasData` with `pivotSuggestions: Partial<Record<AssumptionType, PivotSuggestion[]>>` and `pivotHistory: Partial<Record<AssumptionType, PivotRecord[]>>` — a properly typed helper eliminates the `as unknown as ValidationCanvasData` cast at `page.tsx:116`.
- **Root Cause:** Both sites independently implemented the same assembly pattern because only the low-level `getPivotSuggestions`/`getPivotHistory` functions existed in `src/lib/db.ts`. No mid-level helper existed to assemble the full pivot data structure. Accidental duplication, not intentional.
- **Risk Assessment:** No API response shape changes — returned keys (`pivotSuggestions`, `pivotHistory`) are identical. Route error handling becomes slightly more resilient (adopts `.catch(() => [])`). Existing tests mock at the `db` function level and should continue working; new unit tests for the helper are needed. No auth or security logic involved. Scope is small.
- **Validated Fix:**
  1. Add `buildPivotData(ideaId: string): Promise<{ pivotSuggestions: Partial<Record<AssumptionType, PivotSuggestion[]>>; pivotHistory: Partial<Record<AssumptionType, PivotRecord[]>> }>` to `src/lib/validation-canvas.ts`. Use `.catch(() => [])` on each individual fetch for graceful degradation. Filter empty arrays before building each map.
  2. In `src/app/api/validation/[ideaId]/route.ts`, replace lines 40-52 with a call to `buildPivotData(ideaId)`. Remove `getPivotSuggestions` and `getPivotHistory` from the import.
  3. In `src/app/project/[id]/page.tsx`, replace lines 97-116 with a call to `buildPivotData(id)` alongside `getAllAssumptions`. Restore the existing `Promise.all([getAllAssumptions, buildPivotData])` structure. Remove `getPivotSuggestions` and `getPivotHistory` from the import.
  4. Add unit tests for `buildPivotData` in `src/lib/__tests__/validation-canvas.test.ts` or a new `src/lib/__tests__/validation-canvas-db.test.ts` — covering: all-empty result, partial results, and fetch-error graceful degradation.
- **Files Affected:**
  - `src/lib/validation-canvas.ts` (add helper)
  - `src/app/api/validation/[ideaId]/route.ts` (replace inline block, update import)
  - `src/app/project/[id]/page.tsx` (replace inline block, update import)
  - `src/lib/__tests__/validation-canvas.test.ts` or `src/lib/__tests__/validation-canvas-db.test.ts` (add helper tests)
- **Estimated Scope:** Small — ~20 lines added to `validation-canvas.ts`, ~10-12 lines removed from each callsite, test additions.
