# KB-103: Orphaned dimensionConfig.voice in autonomous-scoping scenario

- **Type:** bug
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `e2e/scenarios/website-chat-autonomous-scoping.json`
- **Observed:** The scenario declares `"dimensions": ["instruction-following", "output-length"]` but `dimensionConfig` defines a `"voice"` entry that is never used since `"voice"` is not in the dimensions array.
- **Expected:** Either remove the orphaned `dimensionConfig.voice` or add `"voice"` to the dimensions array if voice evaluation was intended.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-19
