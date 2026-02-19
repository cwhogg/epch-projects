# KB-078: Sort comparator ignores parameter b in buildFoundationContext

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/research-agent-prompts.ts:16`
- **Observed:** `.sort((a, b) => (a.type === 'strategy' ? -1 : 1))` ignores `b` entirely, violating the sort contract. Works because RELEVANT_TYPES has at most one of each type.
- **Expected:** `.sort((a, b) => (a.type === 'strategy' ? -1 : b.type === 'strategy' ? 1 : 0))`
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** CONFIRM
- **Evidence:** `src/lib/research-agent-prompts.ts:16` — `.sort((a, b) => (a.type === 'strategy' ? -1 : 1))` — `b` is declared but never used. Pattern confirmed exactly as described. `RELEVANT_TYPES` at line 5 contains exactly `['strategy', 'positioning']`, confirming the two-type constraint the KB notes.
- **Root Cause:** Author wrote a shortcut comparator that works in practice because the data model guarantees at most one document per type. The implementation leaks that runtime invariant into the sort logic rather than expressing intent correctly. Accidental — not intentional design.
- **Risk Assessment:** Zero API risk — `buildFoundationContext` returns a string; section order is cosmetic. No callers are affected by the fix. No test files cover this function. No auth or security logic involved. If `RELEVANT_TYPES` ever gains a third type, the current comparator produces undefined sort behavior; the fix handles that case correctly with the `0` fallback.
- **Validated Fix:** Replace line 16 of `src/lib/research-agent-prompts.ts`:
  - Before: `.sort((a, b) => (a.type === 'strategy' ? -1 : 1))`
  - After: `.sort((a, b) => (a.type === 'strategy' ? -1 : b.type === 'strategy' ? 1 : 0))`
  - No prerequisites. One-line change.
- **Files Affected:** `src/lib/research-agent-prompts.ts` (line 16 only)
- **Estimated Scope:** Small — 1 line changed, 1 file
