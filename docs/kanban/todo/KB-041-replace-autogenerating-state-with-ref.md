# KB-041: Replace autoGenerating state with a ref

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/hooks/useContentCalendar.ts:23, 155-160`
- **Observed:** autoGenerating is set to true once and never reset. The effect that reads it deliberately omits it from its dependency array (eslint-disable-line), meaning it functions as a write-once flag. useState for a value that intentionally skips React's reactive machinery is misleading.
- **Expected:** Replace with useRef(false) — the correct primitive for a write-once, non-reactive flag.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17
