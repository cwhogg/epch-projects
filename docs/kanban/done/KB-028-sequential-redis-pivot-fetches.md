# KB-028: Sequential Redis round-trips for pivot data in validation GET route

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/validation/[ideaId]/route.ts:43-48`
- **Observed:** Pivot suggestions and history are fetched one at a time in a for-loop across 5 assumption types, resulting in up to 10 sequential Redis round-trips per canvas page load. All 10 fetches are independent and could be parallelized.
- **Expected:** Use Promise.all to parallelize the independent Redis fetches.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** `src/app/api/validation/[ideaId]/route.ts:43-48` — for-loop over 5 `ASSUMPTION_TYPES` with sequential `await getPivotSuggestions(...)` and `await getPivotHistory(...)` calls. Confirmed 10 independent Redis `get` operations executed one at a time. `getPivotSuggestions` at `src/lib/db.ts:394` and `getPivotHistory` at `src/lib/db.ts:410` are both pure single-key Redis GETs with no side effects and no inter-call dependencies.
- **Root Cause:** Accidental — the for-loop was the natural first-pass imperative approach. There is no ordering dependency between types or between suggestions and history fetches. The accumulators are populated after each await, but the values could be gathered in parallel and assembled identically.
- **Risk Assessment:** No response shape change — `pivotSuggestions` and `pivotHistory` JSON keys and structure are identical regardless of fetch ordering. If any Redis call throws, `Promise.all` rejection is caught by the existing catch block (same error handling path). No auth or security logic involved. Existing tests at `src/app/api/validation/__tests__/route.test.ts:57-58` mock both functions returning `[]` and assert on response shape only — they pass unchanged after this fix.
- **Validated Fix:**
  1. Remove the for-loop at lines 43-49 of `src/app/api/validation/[ideaId]/route.ts`.
  2. Replace with two parallel `Promise.all` calls — one over all 5 types for suggestions, one for history — then iterate the results to populate the accumulators (preserving the `.length > 0` filter before assignment). Example:
     ```ts
     const [allSuggestions, allHistory] = await Promise.all([
       Promise.all(ASSUMPTION_TYPES.map(type => getPivotSuggestions(ideaId, type))),
       Promise.all(ASSUMPTION_TYPES.map(type => getPivotHistory(ideaId, type))),
     ]);
     ASSUMPTION_TYPES.forEach((type, i) => {
       if (allSuggestions[i].length > 0) pivotSuggestions[type] = allSuggestions[i];
       if (allHistory[i].length > 0) pivotHistoryMap[type] = allHistory[i];
     });
     ```
  3. No changes required to `src/lib/db.ts` or any test files.
- **Files Affected:** `src/app/api/validation/[ideaId]/route.ts` only
- **Estimated Scope:** Small — ~10 lines changed, no new dependencies, no test updates needed
