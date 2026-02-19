# KB-083: Inverted threshold field names in eval-config outputLength

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `e2e/eval-config.ts:13-16`
- **Observed:** `max` is the lower threshold (triggers warn) and `warn` is the higher threshold (triggers fail). Semantically inverted — `max` reads as the hard limit, not the soft one.
- **Expected:** Rename to `warnAt` and `failAt` (or `softLimit`/`hardLimit`) so field names match actual semantics. Update Thresholds interface and check function accordingly.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** CONFIRM
- **Evidence:** `e2e/eval-config.ts:13` — `words: { max: 500, warn: 800 }`. `e2e/dimensions/output-length.ts:21` — `count > limits.warn` triggers fail; line 22 — `count > limits.max` triggers warn. The check function's own detail strings expose the confusion: "exceeds fail threshold ${limits.warn}" and "exceeds warn threshold ${limits.max}". The test at `e2e/dimensions/__tests__/output-length.test.ts:17` is also forced into an awkward name: "warns when word count exceeds max".
- **Root Cause:** Accidental naming collision. `warn` was likely named for the threshold level it represents, but the system has three levels (pass/warn/fail). The higher `warn` field triggers a `fail` outcome, not a `warn` outcome. The field names did not track the actual semantics when the three-level system was designed.
- **Risk Assessment:** Purely internal to `e2e/`. No API surface, no external callers. One test uses inline threshold syntax (`{ max: 10, warn: 20 }`) and must be updated alongside the rename. The numeric values and logic are correct — this is a pure rename with no behavior change.
- **Validated Fix:**
  1. `e2e/eval-config.ts:13-16` — rename all `max` keys to `warnAt` and `warn` keys to `failAt`
  2. `e2e/dimensions/output-length.ts:4` — update the `Thresholds` interface field names from `max`/`warn` to `warnAt`/`failAt`
  3. `e2e/dimensions/output-length.ts:19-22` — update the `check` function to use `limits.warnAt` and `limits.failAt`; also update the detail strings to reference the new names
  4. `e2e/dimensions/__tests__/output-length.test.ts:29` — update the inline per-scenario override from `{ max: 10, warn: 20 }` to `{ warnAt: 10, failAt: 20 }`
- **Files Affected:**
  - `e2e/eval-config.ts`
  - `e2e/dimensions/output-length.ts`
  - `e2e/dimensions/__tests__/output-length.test.ts`
- **Estimated Scope:** Small — 4 files, ~8 lines changed, pure rename
