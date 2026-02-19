# KB-082: Extract hexToLuminance and contrastRatio to module level

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/agent-tools/website.ts:468-483`
- **Observed:** hexToLuminance and contrastRatio are pure functions defined as closures inside the evaluate_brand tool's execute callback. Every other validation helper in this file is a named module-level function. These closures are re-created on every tool call, can't be unit-tested in isolation, and break the established pattern.
- **Expected:** Move both functions to module level alongside the other checkXxx validation helpers to match the file's established pattern and enable isolated testing.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** CONFIRM
- **Evidence:** `src/lib/agent-tools/website.ts:468-483` — `hexToLuminance` and `contrastRatio` are defined as `const` closures inside the `execute` callback of the `evaluate_brand` tool. Lines 27–150+ establish a consistent pattern of named exported module-level functions (`checkLayoutMetadata`, `checkH1Count`, `checkSemanticHtml`, etc.). These two closures are the only deviation from that pattern. They have no dependency on the surrounding closure scope.
- **Root Cause:** Functions were written inline at the point of use during initial implementation of `evaluate_brand`, before (or without noticing) the module-level validation helper pattern was established. Accidental pattern drift, not intentional design.
- **Risk Assessment:** Very low. Both functions are currently internal-only (no external callers). Moving them to module level is purely additive — they become exportable but nothing is forced to use the export. No API response shapes change, no auth logic is touched, no tests break. Minor performance improvement: closures are no longer recreated on every tool call.
- **Validated Fix:**
  1. Cut `hexToLuminance` and `contrastRatio` from `website.ts:468-483` (inside the execute callback).
  2. Paste them as named `export function` declarations at module level, in the validator block alongside the other `checkXxx` helpers (after the `ValidationResult` type at line 25 is a natural insertion point).
  3. No other call site changes needed — `contrastRatio(...)` at line 486 remains syntactically identical.
  4. Add tests to `website-validators.test.ts`: import both functions; test `hexToLuminance` with `#ffffff` (expect 1.0) and `#000000` (expect 0.0); test `contrastRatio` with white/black (expect 21.0), a WCAG AA pass pair (ratio >= 4.5), and a WCAG AA fail pair (ratio < 4.5).
- **Files Affected:**
  - `src/lib/agent-tools/website.ts` — move functions to module level, add `export`
  - `src/lib/__tests__/website-validators.test.ts` — add `hexToLuminance` and `contrastRatio` imports and test cases
- **Estimated Scope:** Small — ~16 lines moved, ~20 lines of tests added
