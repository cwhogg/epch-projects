# KB-084: Nested ternaries in eval-runner

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `e2e/eval-runner.ts:64,136-137,142-148`
- **Observed:** Three instances of nested ternary operators: result status label (line 64), overall result calculation (lines 136-137), and judge score derivation in `combine()` (lines 142-148).
- **Expected:** Replace with if/else chains or record lookups per coding standards.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-18
