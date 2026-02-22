# KB-124: runAgentStream is a god function in the website chat route

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/app/api/painted-door/[id]/chat/route.ts:262-444`
- **Observed:** `runAgentStream` is 182 lines handling five distinct concerns in a single function: tool execution (parallel dispatch + result collection), advisor marker injection, session step/substep advancement, conversation history management, and stream end signaling. The advisor enforcement retry loop also mutates `history` and `currentMessages` in place while controlling the agent loop iteration, making the control flow difficult to follow. A new contributor must understand all five concerns simultaneously to reason about any one of them.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-22
