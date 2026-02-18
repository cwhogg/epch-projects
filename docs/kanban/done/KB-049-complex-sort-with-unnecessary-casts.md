# KB-049: Overly complex sort with unnecessary type casting

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/research-agent-prompts.ts:17-22`
- **Observed:** The filter + sort logic uses `(RELEVANT_TYPES as readonly string[]).includes(d.type)` with a type cast, then sorts using a separate `order` object with `as keyof typeof order` casts and `?? 99` fallback. The `RELEVANT_TYPES` array already encodes the desired order.
- **Expected:** Use `RELEVANT_TYPES.indexOf()` for sorting (the array already defines order), or a simple `a.type === 'strategy' ? -1 : 1` comparison since only two types remain after filtering.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** `src/lib/research-agent-prompts.ts:17-22` — code matches KB description exactly. `RELEVANT_TYPES` is `readonly ['strategy', 'positioning'] as const` (line 4). The sort on lines 19-22 constructs a redundant `order` object `{ strategy: 0, positioning: 1 }` that restates what `RELEVANT_TYPES` already expresses. The `?? 99` fallback is dead code — it can never fire because the filter on line 18 ensures only `strategy` and `positioning` docs reach the sort. The `as keyof typeof order` casts exist solely to satisfy TypeScript after the filter fails to narrow `d.type`.
- **Root Cause:** Accidental complexity accumulation. TypeScript's `readonly` tuple type creates friction with `includes()` (requiring the `as readonly string[]` cast) and with keyed index access (requiring `as keyof typeof order`). The developer solved each friction point locally rather than noticing the array already encodes sort order and a simple ternary is sufficient.
- **Risk Assessment:** No API surface changes — `buildFoundationContext` returns a string and its callers are unaffected. The existing test at `src/lib/__tests__/research-agent-prompts.test.ts:34-45` directly verifies sort order (positioning-first input produces strategy-first output). The simplified fix preserves this order so tests will continue to pass. Zero risk.
- **Validated Fix:** Replace lines 17-22 in `src/lib/research-agent-prompts.ts` with:
  ```typescript
  const relevant = docs
    .filter((d) => (RELEVANT_TYPES as readonly string[]).includes(d.type))
    .sort((a, b) => (a.type === 'strategy' ? -1 : 1));
  ```
  The filter cast `as readonly string[]` must stay — `FoundationDocType` is a 6-member union and TypeScript requires this to accept it as an argument to `includes` on a const tuple. The sort ternary replaces the `order` object and both `as keyof typeof order` casts entirely. The `?? 99` dead-code fallback is eliminated.
- **Files Affected:** `src/lib/research-agent-prompts.ts` (lines 19-22 only)
- **Estimated Scope:** Small — 4 lines replaced with 1 line, no other files touched
