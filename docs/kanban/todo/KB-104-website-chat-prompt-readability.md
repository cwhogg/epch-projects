# KB-104: Long system prompt string in website-chat prompt adapter case

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `e2e/prompt-adapter.ts:70-120`
- **Observed:** The `website-chat` case builds its system prompt as a single long template literal requiring horizontal scrolling. It's the longest line in the file by a wide margin.
- **Expected:** Break the system prompt into named sections and join them, improving readability without changing behavior. Consistent with existing `advisor-chat` pattern but adapted for the longer prompt.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-19
