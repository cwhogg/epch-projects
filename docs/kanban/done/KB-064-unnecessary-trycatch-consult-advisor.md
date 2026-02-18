# KB-064: Unnecessary try/catch in consult_advisor when caller already handles errors

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/agent-tools/website-chat.ts:37-71`
- **Observed:** The `consult_advisor` tool's execute function wraps its entire body in a try/catch that converts errors to a string message. The agent loop in the chat route already wraps each tool execution in its own try/catch, so errors are caught and stringified twice.
- **Expected:** Remove the inner try/catch and let errors propagate to the agent loop's catch handler. If advisor context is needed in the error message, add it at the agent loop level.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:**
  - `src/lib/agent-tools/website-chat.ts:37-70`: The `execute` function wraps its entire body in a try/catch. On error it returns the string `Error consulting advisor "${advisorId}": ${message}` — a success-shaped result that does not propagate to the caller.
  - `src/app/api/painted-door/[id]/chat/route.ts:288-303`: The `runAgentStream` loop wraps each `tool.execute(toolCall.input)` in its own try/catch. On error it returns `{ type: 'tool_result', is_error: true, content: 'Error: ${message}' }`. Because the inner catch in `consult_advisor` prevents throwing, the outer catch never fires for advisor errors.
  - The two error paths produce different output formats: inner produces a plain string (no `is_error` flag), outer produces an `is_error: true` result. This means advisor failures are silently presented to the LLM as normal tool output, not as marked failures.
- **Root Cause:** The inner try/catch was written defensively during initial `consult_advisor` implementation, before the agent stream loop's unified error handling existed. The two were never reconciled. This is an isolated case — no other tool in the codebase uses this pattern.
- **Risk Assessment:** Removing the inner catch changes the model-facing error format from a plain string to an `is_error: true` tool result. The LLM may respond slightly differently to marked errors vs. unmarked error strings, but for a conversational chat context the risk is low — the model handles `is_error` results gracefully. The test file `src/lib/__tests__/consult-advisor.test.ts` currently tests the error return string format and will need updating to expect a thrown error instead. No external API shapes change.
- **Validated Fix:**
  1. In `src/lib/agent-tools/website-chat.ts`: Remove the `try { ... } catch (error) { ... }` wrapper from the `execute` function body (lines 37 and 67-70). The body runs unwrapped; errors propagate to the caller.
  2. In `src/lib/__tests__/consult-advisor.test.ts`: Update error-path tests to expect the function to throw (or the outer handler to produce `is_error: true`) rather than expecting the error string return value.
  3. No changes needed in `src/app/api/painted-door/[id]/chat/route.ts` — the outer catch already handles tool errors correctly.
- **Files Affected:**
  - `src/lib/agent-tools/website-chat.ts` (remove inner try/catch, ~4 lines)
  - `src/lib/__tests__/consult-advisor.test.ts` (update error-path test assertions)
- **Estimated Scope:** Small — fewer than 10 lines changed across 2 files.
