# KB-046: Duplicated last-message update pattern in handleSend

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/foundation/[id]/edit/[docType]/page.tsx:140-163`
- **Observed:** The pattern of cloning prev, overwriting the last element, and returning the updated array is written out in full twice within the same function — once for streaming updates (lines 140-144) and once for finalization error appending (lines 158-163). Duplication here means a future change to how assistant messages are tracked requires two edits in close proximity.
- **Expected:** Extract a shared updateLastMessage helper
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** Both duplication sites are confirmed present and match the KB description exactly.
  - `src/app/foundation/[id]/edit/[docType]/page.tsx:140-144` — streaming update: clones `prev`, overwrites last element with `{ role: 'assistant', content: currentChatText }`, returns updated array.
  - `src/app/foundation/[id]/edit/[docType]/page.tsx:158-163` — finalization error path: identical structure with `finalChatText`.
  - The two blocks are structurally byte-for-byte equivalent apart from the text variable name.
- **Root Cause:** Accidental duplication from incremental growth. The streaming block was written first; the finalization error path was added later by copy-pasting the updater pattern rather than extracting it. No intentional design rationale for keeping them separate.
- **Risk Assessment:** Minimal. The fix is confined to internal React state logic inside `handleSend`. No API response shapes change. No other files import or depend on this pattern. No test file exists for this page component (client component with local state — typical). The helper is a local `const` inside `handleSend`, so no module boundary is crossed.
- **Validated Fix:**
  1. Inside `handleSend`, before the `try` block, define a local helper:
     ```ts
     const updateLastMessage = (text: string) => {
       setMessages((prev) => {
         const updated = [...prev];
         updated[updated.length - 1] = { role: 'assistant', content: text };
         return updated;
       });
     };
     ```
  2. Replace lines 140-144 with: `updateLastMessage(chatText);`
     (Note: `currentChatText` was only needed to capture the closure value for the updater — with the helper accepting a parameter directly, `chatText` can be passed directly since it's in scope.)
  3. Replace lines 158-163 with: `updateLastMessage(chatText);`
     (Similarly, `finalChatText` was just a captured alias for `chatText` — the same value can be passed directly.)
  4. Remove the now-unused `currentChatText` and `finalChatText` variable declarations.
- **Files Affected:** `src/app/foundation/[id]/edit/[docType]/page.tsx` only
- **Estimated Scope:** Small — ~8 lines replaced, ~4 lines added (net reduction ~2 lines), zero new imports, zero API changes.
