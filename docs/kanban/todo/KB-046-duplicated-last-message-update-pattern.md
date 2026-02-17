# KB-046: Duplicated last-message update pattern in handleSend

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/foundation/[id]/edit/[docType]/page.tsx:140-163`
- **Observed:** The pattern of cloning prev, overwriting the last element, and returning the updated array is written out in full twice within the same function — once for streaming updates (lines 140-144) and once for finalization error appending (lines 158-163). Duplication here means a future change to how assistant messages are tracked requires two edits in close proximity.
- **Expected:** Extract a shared updateLastMessage helper
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17
