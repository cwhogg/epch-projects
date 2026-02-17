# KB-047: Duplicated `capitalize` function across two files

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/components/ReanalyzeForm.tsx:17` and `src/lib/research-agent-prompts.ts:12`
- **Observed:** The `capitalize` function is defined identically in both files. Both are `s.charAt(0).toUpperCase() + s.slice(1)`.
- **Expected:** Extract `capitalize` into a shared utility (e.g., `src/lib/utils.ts`) and import from both files.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-17
