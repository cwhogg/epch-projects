# KB-044: God function in handleSend — five responsibilities in one callback

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/foundation/[id]/edit/[docType]/page.tsx:97-174`
- **Observed:** handleSend performs input validation, optimistic message state mutation, HTTP POST, a streaming read loop with incremental UI updates, XML tag extraction via StreamParser, and finalization error handling — all in a single 77-line useCallback. A new contributor cannot locate the streaming logic, the document extraction logic, or the error path without reading the entire function.
- **Expected:** Extract streaming read loop and document extraction into a separate helper or custom hook
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** REVISE
- **Evidence:** `handleSend` at `src/app/foundation/[id]/edit/[docType]/page.tsx:97-174` is confirmed as 78 lines with six distinct responsibilities. The KB description is accurate. However, the KB suggests "custom hook" as a fix option — this is too invasive. The correct scope is narrower: extract only the streaming read loop and finalization into a named async helper function inside the component (not a hook), matching the established pattern in `src/app/website/[id]/build/page.tsx:120-203` where `streamResponse` performs the same role.
- **Root Cause:** The function was written inline during initial feature implementation (2026-02-17 merge). The website builder page (`website/[id]/build/page.tsx`) established the precedent of extracting streaming logic into a named inner function (`streamResponse`), but the foundation editor page was written without following that pattern — either before or without reference to it.
- **Risk Assessment:** No API response shape changes. No existing tests for this page exist, so none will break. No other files import `handleSend` — it is a component closure. One correctness risk: `chatText` is a running accumulator across chunks (each chunk appends `result.chatText` to the total). The extracted helper must preserve this accumulation behavior — it must pass the running total to the incremental `setMessages` update, not the per-chunk delta. This is already handled correctly in the current code and must be preserved during extraction.
- **Validated Fix:** Extract `src/app/foundation/[id]/edit/[docType]/page.tsx:123-164` into a named async function `streamChatResponse` declared inside the component (same pattern as `streamResponse` in the website builder). The function signature: `async function streamChatResponse(res: Response)` — it can close over `setMessages`, `setContent`, and `setPreviousContent` directly, since it remains in the component scope. After extraction, `handleSend` reduces to ~38 lines covering: validation (lines 98–99), optimistic state (101–106), message windowing (109), HTTP POST with error handling (111–121), call to `streamChatResponse(res)`, catch block (165–170), and finally (171–173). No custom hook. No prop drilling of state setters. No test changes needed (no tests exist for this page — a follow-up KB item for test coverage would be appropriate but is out of scope here).
- **Files Affected:** `src/app/foundation/[id]/edit/[docType]/page.tsx` only.
- **Estimated Scope:** Small — approximately 15–20 lines of reorganization within a single file, zero net new logic.
