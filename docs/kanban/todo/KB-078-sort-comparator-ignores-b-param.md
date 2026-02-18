# KB-078: Sort comparator ignores parameter b in buildFoundationContext

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/research-agent-prompts.ts:16`
- **Observed:** `.sort((a, b) => (a.type === 'strategy' ? -1 : 1))` ignores `b` entirely, violating the sort contract. Works because RELEVANT_TYPES has at most one of each type.
- **Expected:** `.sort((a, b) => (a.type === 'strategy' ? -1 : b.type === 'strategy' ? 1 : 0))`
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-18
