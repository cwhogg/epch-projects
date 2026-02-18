# KB-060: CritiqueResult interface duplicates AdvisorCritique with minor differences

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/critique-service.ts:10-25`
- **Observed:** `CritiqueResult` is structurally almost identical to `AdvisorCritique` from types/index.ts. Results are mapped from `AdvisorCritique` to `CritiqueResult` and then immediately mapped back to `AdvisorCritique[]` for the editor rubric — a round-trip conversion that is wasted work.
- **Expected:** Remove `CritiqueResult` and use `AdvisorCritique` directly in `runCritiqueRound`, eliminating the intermediate conversion.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:**
  - `CritiqueResult` defined at `src/lib/critique-service.ts:10-18` with fields: `advisorId`, `advisorName`, `score`, `pass`, `issues: {severity, description}[]`, `strengths: string[]`, `error?`
  - `AdvisorCritique` defined at `src/types/index.ts:424-431` with fields: `advisorId`, `name`, `score`, `pass`, `issues: CritiqueIssue[]`, `error?`
  - Round-trip confirmed: `runSingleCritic` returns `AdvisorCritique` (line 62). `runCritiqueRound` at lines 166-188 maps these into `CritiqueResult[]` (renaming `name` to `advisorName`, stripping `suggestion` from issues, adding vestigial `strengths: []`). Lines 192-199 then map back to `AdvisorCritique[]` for `applyEditorRubric`, re-adding `suggestion: ''`.
  - `CritiqueResult` is not imported by any file outside `critique-service.ts` (grep confirms zero external references).
  - `CritiqueRoundResult.critiques` (the public return type) is only consumed by `src/lib/__tests__/critique-service.test.ts`. Test assertions reference `c.advisorId`, `c.score`, `c.issues.length`, `c.error` — none reference `advisorName` or `strengths`.
- **Root Cause:** `CritiqueResult` was created as a slightly different output shape from `AdvisorCritique` — likely when `runCritiqueRound` was the primary critique path before the `agent-tools/critique.ts` pipeline was built. The `strengths` field was intended but never implemented (always `[]`). The `advisorName` rename was gratuitous divergence from the canonical `name` field used everywhere else. Now that the agent-tools pipeline uses `AdvisorCritique` throughout, `CritiqueResult` is a redundant intermediate type with no external consumers.
- **Risk Assessment:** Low. No external callers import `CritiqueResult`. The `CritiqueRoundResult.critiques` type changes from `CritiqueResult[]` to `AdvisorCritique[]`, but the only consumer (the test file) does not reference the divergent fields (`advisorName`, `strengths`). The `issues` field gains a `suggestion` field, which tests do not inspect. No API response shapes change; this is fully internal to `critique-service.ts`.
- **Validated Fix:**
  1. In `src/lib/critique-service.ts`, delete the `CritiqueResult` interface (lines 10-18).
  2. Change `CritiqueRoundResult.critiques` type from `CritiqueResult[]` to `AdvisorCritique[]` (line 21).
  3. In `runCritiqueRound`, replace the `CritiqueResult[]` mapping block (lines 166-188) with a direct `AdvisorCritique[]` mapping from `results`:
     - On fulfilled: return `result.value` directly (it is already `AdvisorCritique` from `runSingleCritic`).
     - On rejected: return the error object using `AdvisorCritique` field names (`name` not `advisorName`, no `strengths`).
  4. Delete the `advisorCritiques` conversion block (lines 191-199) entirely — pass the `AdvisorCritique[]` directly to `applyEditorRubric`.
  5. No changes needed to tests or any other file.
- **Files Affected:** `src/lib/critique-service.ts` only.
- **Estimated Scope:** Small — approximately 20 lines removed/changed, net reduction of ~15 lines.
