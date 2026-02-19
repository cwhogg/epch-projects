# KB-086: Redundant type guard in text extraction

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `e2e/eval-runner.ts:110-113`
- **Observed:** After filtering blocks to `type === 'text'`, the subsequent `.map(b => 'text' in b ? b.text : '')` check is redundant — every block is guaranteed to have `text`.
- **Expected:** Simplify to `.filter(b => b.type === 'text').map(b => b.text)` with appropriate type narrowing.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** REVISE
- **Evidence:** `e2e/eval-runner.ts:110-113` contains the exact pattern described. The Anthropic SDK defines `ContentBlock` as `TextBlock | ThinkingBlock | RedactedThinkingBlock | ToolUseBlock | ServerToolUseBlock | WebSearchToolResultBlock` (`node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts:181`). Only `TextBlock` has a `text` field.
- **Root Cause:** The `'text' in b ? b.text : ''` guard is NOT redundant. TypeScript's `Array.prototype.filter` does not narrow union types without an explicit type predicate. After `.filter(b => b.type === 'text')`, the array is still typed as `ContentBlock[]`, not `TextBlock[]`. The guard is compensating for the absence of a type predicate on the filter call.
- **Risk Assessment:** The KB item's proposed fix `.map(b => b.text)` would produce a TypeScript compile error because `text` is not present on all members of `ContentBlock`. The `ThinkingBlock` type (added to the SDK after this code was written) has `thinking` not `text`. Applying the proposed fix as-is would break the build.
- **Validated Fix:** The correct simplification uses a type predicate on the filter to achieve proper narrowing, then the map becomes safe: `.filter((b): b is TextBlock => b.type === 'text').map(b => b.text)`. This requires importing `TextBlock` from `@anthropic-ai/sdk`. This is functionally equivalent to the current code but removes the runtime ternary and is idiomatic TypeScript.
- **Files Affected:** `e2e/eval-runner.ts` (import addition + lines 110-113)
- **Estimated Scope:** Small — 2 lines changed, 1 import added
- **Resolved:** 2026-02-18
