# KB-028: Sequential Redis round-trips for pivot data in validation GET route

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/validation/[ideaId]/route.ts:43-48`
- **Observed:** Pivot suggestions and history are fetched one at a time in a for-loop across 5 assumption types, resulting in up to 10 sequential Redis round-trips per canvas page load. All 10 fetches are independent and could be parallelized.
- **Expected:** Use Promise.all to parallelize the independent Redis fetches.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16
