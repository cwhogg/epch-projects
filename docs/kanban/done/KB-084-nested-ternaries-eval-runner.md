# KB-084: Nested ternaries in eval-runner

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `e2e/eval-runner.ts:64,136-137,142-148`
- **Observed:** Three instances of nested ternary operators: result status label (line 64), overall result calculation (lines 136-137), and judge score derivation in `combine()` (lines 142-148).
- **Expected:** Replace with if/else chains or record lookups per coding standards.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** CONFIRM
- **Evidence:**
  - `e2e/eval-runner.ts:64` — `result.result === 'pass' ? 'PASS' : result.result === 'warn' ? 'WARN' : 'FAIL'` in console.log call
  - `e2e/eval-runner.ts:136-137` — `const overall = Object.values(dimensions).some(d => d.result === 'fail') ? 'fail' : Object.values(dimensions).some(d => d.result === 'warn') ? 'warn' : 'pass';`
  - `e2e/eval-runner.ts:145` — `const jr = j.score >= EVAL_CONFIG.judgeThresholds.pass ? 'pass' : j.score >= EVAL_CONFIG.judgeThresholds.warn ? 'warn' : 'fail';` inside `combine()`
  - All three instances confirmed present and matching KB description.
- **Root Cause:** Authoring style under time pressure in e2e tooling where readability wasn't the focus. Not intentional — the file already demonstrates the preferred pattern (record lookup `p` used in `combine()` and `worst()`), but it was not applied consistently.
- **Risk Assessment:** Minimal. This is internal e2e tooling with no external callers. `combine()` and `worst()` are module-private functions. All rewrites are logic-equivalent. No API shape changes, no test breakage risk (this file is the test runner, not a tested module), no auth/security involvement.
- **Validated Fix:**
  1. Line 64 — replace nested ternary with record lookup:
     ```ts
     const label = ({ pass: 'PASS', warn: 'WARN', fail: 'FAIL' } as const)[result.result];
     console.log(label);
     ```
  2. Lines 136-137 — replace nested ternary with if/else chain:
     ```ts
     let overall: 'pass' | 'warn' | 'fail';
     if (Object.values(dimensions).some(d => d.result === 'fail')) overall = 'fail';
     else if (Object.values(dimensions).some(d => d.result === 'warn')) overall = 'warn';
     else overall = 'pass';
     ```
  3. Line 145 in `combine()` — replace nested ternary with if/else chain:
     ```ts
     let jr: 'pass' | 'warn' | 'fail';
     if (j.score >= EVAL_CONFIG.judgeThresholds.pass) jr = 'pass';
     else if (j.score >= EVAL_CONFIG.judgeThresholds.warn) jr = 'warn';
     else jr = 'fail';
     ```
- **Files Affected:** `e2e/eval-runner.ts` only
- **Estimated Scope:** Small — three localized changes in one file, ~10 lines total
