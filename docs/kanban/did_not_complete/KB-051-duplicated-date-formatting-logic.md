# KB-051: Duplicated date formatting logic between prompt builder and UI

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/components/ReanalyzeForm.tsx:12` and `src/lib/research-agent-prompts.ts:7`
- **Observed:** `formatDocDate` and `formatDate` both format ISO strings to `en-US` with `{ month: 'short', day: 'numeric', timeZone: 'UTC' }`. The core date formatting is identical; they differ only in editedAt/generatedAt resolution.
- **Expected:** Extract the shared date formatting into a utility function. The editedAt/generatedAt resolution can stay at the call site.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-17
- **Resolved:** 2026-02-17
- **Fix:** Closed during triage — duplication is real but not worth extracting. Both call sites are one-liners using the same locale and options object. Two call sites across different architectural layers (UI component vs. server-side prompt builder) does not meet the bar for shared utility extraction. Extracting adds an import and a new module dependency for a net saving of roughly one line. CLAUDE.md simplicity-first philosophy contradicts this micro-abstraction. The `capitalize` helper is also duplicated, same reasoning applies. No bug risk, no consistency risk, no maintenance burden.
