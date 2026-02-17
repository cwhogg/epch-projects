# KB-051: Duplicated date formatting logic between prompt builder and UI

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/components/ReanalyzeForm.tsx:12` and `src/lib/research-agent-prompts.ts:7`
- **Observed:** `formatDocDate` and `formatDate` both format ISO strings to `en-US` with `{ month: 'short', day: 'numeric', timeZone: 'UTC' }`. The core date formatting is identical; they differ only in editedAt/generatedAt resolution.
- **Expected:** Extract the shared date formatting into a utility function. The editedAt/generatedAt resolution can stay at the call site.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-17
