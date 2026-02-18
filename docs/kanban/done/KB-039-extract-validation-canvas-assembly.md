# KB-039: Extract validation canvas assembly out of getDashboardData

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/analyses/[id]/page.tsx:95-117`
- **Observed:** The validation canvas fetch-and-assembly block (nested Promise.all, four object constructions, double type cast through unknown) is inlined inside getDashboardData, which already fans out seven concurrent fetches. This inflates the function and obscures both the outer data-fetch shape and the canvas assembly logic.
- **Expected:** Extract into a buildValidationCanvasData(id, canvasState) helper function.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** The auto-close on 2026-02-17 was incorrect. The file moved from `src/app/analyses/[id]/page.tsx` to `src/app/project/[id]/page.tsx`, and the canvas assembly block is present at exactly `src/app/project/[id]/page.tsx:94-117`. The pattern matches the KB description precisely: a conditional inner `Promise.all` (line 97) that fans out across `ASSUMPTION_TYPES` with nested async calls, two accumulator loops (lines 107-110), and a double type cast (`as Record<string, unknown>` then `as unknown as ValidationCanvasData`) at line 113/116.
- **Root Cause:** Incremental growth. `canvasState` was added to the outer `Promise.all` first; the canvas-specific sub-fetches were then added inline rather than extracted. The double type cast is a shape mismatch between DB return types and the `ValidationCanvasData` interface — a bug-risk hiding place that TypeScript cannot catch.
- **Risk Assessment:** Low. The extraction is entirely within `src/app/project/[id]/page.tsx`. No API response shapes change. No imports need adding. No other files are affected. No test file exists for this page component. The double `as unknown as ValidationCanvasData` cast remains (inside the extracted function) — it is not made worse, but it is isolated and more visible.
- **Validated Fix:**
  1. In `src/app/project/[id]/page.tsx`, add a new async helper function before `getDashboardData`:
     ```ts
     async function buildValidationCanvasData(id: string, canvasState: NonNullable<typeof canvasState>): Promise<ValidationCanvasData> {
       const [canvasAssumptions, ...pivotResults] = await Promise.all([
         getAllAssumptions(id).catch(() => ({})),
         ...ASSUMPTION_TYPES.map(async (aType) => ({
           type: aType,
           suggestions: await getPivotSuggestions(id, aType).catch(() => []),
           history: await getPivotHistory(id, aType).catch(() => []),
         })),
       ]);
       const canvasPivotSuggestions: Record<string, unknown[]> = {};
       const canvasPivotHistory: Record<string, unknown[]> = {};
       for (const { type, suggestions, history } of pivotResults) {
         if (suggestions.length > 0) canvasPivotSuggestions[type] = suggestions;
         if (history.length > 0) canvasPivotHistory[type] = history;
       }
       return {
         canvas: canvasState,
         assumptions: canvasAssumptions as Record<string, unknown>,
         pivotSuggestions: canvasPivotSuggestions,
         pivotHistory: canvasPivotHistory,
       } as unknown as ValidationCanvasData;
     }
     ```
  2. Replace lines 94-117 in `getDashboardData` with:
     ```ts
     const validationCanvas = canvasState ? await buildValidationCanvasData(id, canvasState) : null;
     ```
  3. Note: The `canvasState` type parameter should use the actual return type of `getCanvasState` — adjust the signature to match once the actual type is confirmed from `src/lib/db.ts`.
- **Files Affected:** `src/app/project/[id]/page.tsx` only
- **Estimated Scope:** Small — ~25 lines extracted into a named function in the same file
