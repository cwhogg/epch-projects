# KB-117: applyPivot fetches downstream assumptions sequentially in a for loop

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/validation-canvas.ts:358-370`
- **Observed:** `applyPivot` resets downstream assumption types by iterating over the `DOWNSTREAM[type]` array (up to 4 types) with sequential `await getAssumption` + conditional `await saveAssumption` calls. The fetch calls are independent and could be batched with `Promise.all` to parallelize all reads before conditionally writing saves, reducing Redis round-trips when multiple downstream assumptions need resetting.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** MEDIUM
- **Created:** 2026-02-21
