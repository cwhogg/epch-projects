# KB-082: Extract hexToLuminance and contrastRatio to module level

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/agent-tools/website.ts:468-483`
- **Observed:** hexToLuminance and contrastRatio are pure functions defined as closures inside the evaluate_brand tool's execute callback. Every other validation helper in this file is a named module-level function. These closures are re-created on every tool call, can't be unit-tested in isolation, and break the established pattern.
- **Expected:** Move both functions to module level alongside the other checkXxx validation helpers to match the file's established pattern and enable isolated testing.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-18
