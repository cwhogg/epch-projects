# KB-086: Redundant type guard in text extraction

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `e2e/eval-runner.ts:110-113`
- **Observed:** After filtering blocks to `type === 'text'`, the subsequent `.map(b => 'text' in b ? b.text : '')` check is redundant — every block is guaranteed to have `text`.
- **Expected:** Simplify to `.filter(b => b.type === 'text').map(b => b.text)` with appropriate type narrowing.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-18
