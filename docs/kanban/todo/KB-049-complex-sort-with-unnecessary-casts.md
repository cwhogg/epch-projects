# KB-049: Overly complex sort with unnecessary type casting

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/research-agent-prompts.ts:17-22`
- **Observed:** The filter + sort logic uses `(RELEVANT_TYPES as readonly string[]).includes(d.type)` with a type cast, then sorts using a separate `order` object with `as keyof typeof order` casts and `?? 99` fallback. The `RELEVANT_TYPES` array already encodes the desired order.
- **Expected:** Use `RELEVANT_TYPES.indexOf()` for sorting (the array already defines order), or a simple `a.type === 'strategy' ? -1 : 1` comparison since only two types remain after filtering.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-17
