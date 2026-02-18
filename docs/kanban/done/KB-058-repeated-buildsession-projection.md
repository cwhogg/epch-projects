# KB-058: Repeated buildSession projection in GET handler

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/painted-door/[id]/route.ts:84-136`
- **Observed:** The GET handler calls `getBuildSession(id)` up to three times across its branches and projects the same `{ mode, currentStep, steps }` shape in three separate locations. This creates maintenance risk if the projection shape needs to change.
- **Expected:** Fetch the build session once at the top of the try block and extract a `projectBuildSession(session)` helper for the repeated shape.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** `src/app/api/painted-door/[id]/route.ts` contains three separate `getBuildSession(id)` calls (lines 90, 108, 124) and three identical projections `{ mode: buildSession.mode, currentStep: buildSession.currentStep, steps: buildSession.steps }` (lines 98-102, 112-116, 129-133). The KB description is accurate.
- **Root Cause:** The GET handler was built incrementally — each new code path (build-session-only, progress-expired-with-live-site, active-progress) was added independently with its own fetch and projection rather than refactoring the shared structure.
- **Risk Assessment:** Low. No API response shape changes. The fix reduces Redis calls in the `!progress` branch (two separate calls become one). No auth or security logic is touched. Existing behavior is preserved exactly — only fetch location and projection are consolidated.
- **Validated Fix:**
  1. Extract a small helper above the GET handler: `function projectBuildSession(session: { mode: string; currentStep: string; steps: unknown[] }) { return { mode: session.mode, currentStep: session.currentStep, steps: session.steps }; }` (adjust types to match the actual `BuildSession` type from painted-door-db).
  2. In the `!progress` block (lines 86-120), hoist a single `const buildSession = await getBuildSession(id);` call before the `if (site && site.siteUrl && site.status === 'live')` branch. Both sub-branches already use the result — sharing one call eliminates one redundant Redis fetch.
  3. Replace all three inline projection literals with `projectBuildSession(buildSession)`.
  4. The third call at line 124 remains in its own block (progress-exists path) but uses the shared helper for the projection.
- **Files Affected:** `src/app/api/painted-door/[id]/route.ts`
- **Estimated Scope:** Small — ~10 lines changed, no behavior change, no other files affected
