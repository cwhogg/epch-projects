# KB-085: Compressed multi-statement lines in eval-runner

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `e2e/eval-runner.ts:33,35,39,43`
- **Observed:** Multiple assignments compressed onto single lines with semicolons (e.g., `trigger = 'manual'; scopeReason = ...`). Reduces scanability.
- **Expected:** Put each assignment on its own line within if/else branches.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** CONFIRM
- **Evidence:** `e2e/eval-runner.ts` lines 33, 36, 39, 43 each compress two assignments onto one semicolon-separated line within the four branches of the trigger-detection block. Pattern confirmed exactly as described. (KB cited line 35; actual line is 36 — minor off-by-one in the KB description, does not affect the fix.)
- **Root Cause:** Intentional style choice to keep each if/else branch visually compact by pairing `trigger` and `scopeReason`, which are always set together. Localized to the four branches in `main()`. Not a systematic pattern elsewhere in the file.
- **Risk Assessment:** Zero risk. `eval-runner.ts` is a CLI entry point with no callers, no API surface, and no unit tests. Splitting assignments is a pure style change with no semantic effect.
- **Validated Fix:** In each of the four branches, split the semicolon-joined line into two separate lines. Specific changes:
  - Line 33: split `trigger = 'manual'; scopeReason = \`--scenario ${values.scenario}\`;` into two lines
  - Line 36: split `trigger = 'manual'; scopeReason = \`--tag ${values.tag}\`;` into two lines
  - Line 39: split `trigger = 'manual'; scopeReason = '--all';` into two lines
  - Line 43: split `trigger = 'auto'; scopeReason = \`auto-detect (${changedFiles.length} changed files)\`;` into two lines
  No other changes needed. No utility methods, imports, or types are affected.
- **Files Affected:** `e2e/eval-runner.ts` only
- **Estimated Scope:** Small — 4 line splits, ~4 lines added, zero logic change
