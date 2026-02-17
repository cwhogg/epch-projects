# KB-039: Extract validation canvas assembly out of getDashboardData

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/analyses/[id]/page.tsx:95-117`
- **Observed:** The validation canvas fetch-and-assembly block (nested Promise.all, four object constructions, double type cast through unknown) is inlined inside getDashboardData, which already fans out seven concurrent fetches. This inflates the function and obscures both the outer data-fetch shape and the canvas assembly logic.
- **Expected:** Extract into a buildValidationCanvasData(id, canvasState) helper function.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17
