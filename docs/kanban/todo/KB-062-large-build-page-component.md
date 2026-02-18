# KB-062: Large page component with streaming logic, polling, and rendering combined

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/website/[id]/build/page.tsx:22-661`
- **Observed:** The `WebsiteBuilderPage` component is 661 lines with streaming logic, polling, signal handling, state management, and rendering all in one function. The main component body contains ~300 lines of logic before the return statement.
- **Expected:** Extract streaming/chat logic into a custom hook (e.g., `useChatStream`) that encapsulates message state, streaming, polling, and signal handling. Current structure is functional — flagging for future awareness.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-17
