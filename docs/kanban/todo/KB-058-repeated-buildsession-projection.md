# KB-058: Repeated buildSession projection in GET handler

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/painted-door/[id]/route.ts:84-136`
- **Observed:** The GET handler calls `getBuildSession(id)` up to three times across its branches and projects the same `{ mode, currentStep, steps }` shape in three separate locations. This creates maintenance risk if the projection shape needs to change.
- **Expected:** Fetch the build session once at the top of the try block and extract a `projectBuildSession(session)` helper for the repeated shape.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17
