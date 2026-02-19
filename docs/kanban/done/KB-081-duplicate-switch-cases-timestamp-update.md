# KB-081: Duplicate switch cases in getTimestampUpdate

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/validation/[ideaId]/status/route.ts:16-19`
- **Observed:** The `invalidated` and `pivoted` cases return identical objects `{ invalidatedAt: now, validatedAt: undefined }` but are separate cases with duplicated return statements.
- **Expected:** Combine as fallthrough: `case 'invalidated': case 'pivoted': return { invalidatedAt: now, validatedAt: undefined };`
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** CONFIRM
- **Evidence:** `src/app/api/validation/[ideaId]/status/route.ts:16-19` — lines 16-17 and 18-19 are two separate cases with byte-for-byte identical return values: `{ invalidatedAt: now, validatedAt: undefined }`. The same file already uses fallthrough for `untested`/`testing` at lines 20-22, establishing the pattern.
- **Root Cause:** Accidental duplication. `pivoted` was likely added after `invalidated` by copy-pasting the return rather than adding a fallthrough. Not intentional.
- **Risk Assessment:** Zero API risk — `getTimestampUpdate` is a private function used only within this file. Return shape is unchanged. Existing tests at lines 120-132 of `src/app/api/validation/__tests__/status.test.ts` explicitly cover the `pivoted` case and will continue to pass.
- **Validated Fix:** Replace lines 16-19 with a fallthrough:
  ```typescript
  case 'invalidated':
  case 'pivoted':
    return { invalidatedAt: now, validatedAt: undefined };
  ```
  No imports change. No other files affected.
- **Files Affected:** `src/app/api/validation/[ideaId]/status/route.ts` (lines 16-19 only)
- **Estimated Scope:** Small — 2 lines removed, 0 behavior change
