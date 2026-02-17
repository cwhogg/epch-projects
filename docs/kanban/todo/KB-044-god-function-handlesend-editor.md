# KB-044: God function in handleSend — five responsibilities in one callback

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/foundation/[id]/edit/[docType]/page.tsx:97-174`
- **Observed:** handleSend performs input validation, optimistic message state mutation, HTTP POST, a streaming read loop with incremental UI updates, XML tag extraction via StreamParser, and finalization error handling — all in a single 77-line useCallback. A new contributor cannot locate the streaming logic, the document extraction logic, or the error path without reading the entire function.
- **Expected:** Extract streaming read loop and document extraction into a separate helper or custom hook
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-17
