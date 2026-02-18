# KB-064: Unnecessary try/catch in consult_advisor when caller already handles errors

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/agent-tools/website-chat.ts:37-71`
- **Observed:** The `consult_advisor` tool's execute function wraps its entire body in a try/catch that converts errors to a string message. The agent loop in the chat route already wraps each tool execution in its own try/catch, so errors are caught and stringified twice.
- **Expected:** Remove the inner try/catch and let errors propagate to the agent loop's catch handler. If advisor context is needed in the error message, add it at the agent loop level.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-17
