# KB-023: Duplicate author system prompt assembly in generate_draft and revise_draft

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/agent-tools/critique.ts:219-225 and 441-447`
- **Observed:** The identical 6-line block that builds the author system prompt — loading the advisor prompt, conditionally appending the framework — is copied verbatim in both the generate_draft tool and the revise_draft tool. Any change to how the author prompt is assembled must be made in two places.
- **Expected:** Extract a shared helper function (e.g., `buildAuthorSystemPrompt`) that both tools call.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16
