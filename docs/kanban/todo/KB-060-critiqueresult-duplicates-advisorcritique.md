# KB-060: CritiqueResult interface duplicates AdvisorCritique with minor differences

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/critique-service.ts:10-25`
- **Observed:** `CritiqueResult` is structurally almost identical to `AdvisorCritique` from types/index.ts. Results are mapped from `AdvisorCritique` to `CritiqueResult` and then immediately mapped back to `AdvisorCritique[]` for the editor rubric — a round-trip conversion that is wasted work.
- **Expected:** Remove `CritiqueResult` and use `AdvisorCritique` directly in `runCritiqueRound`, eliminating the intermediate conversion.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17
