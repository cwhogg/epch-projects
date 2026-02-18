# KB-057: Duplicated foundation doc filtering and formatting logic

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/painted-door/[id]/chat/route.ts:34-46` and `src/lib/agent-tools/website-chat.ts:40-44`
- **Observed:** The pattern of fetching all foundation docs, filtering out nulls, and formatting them as markdown sections is duplicated almost identically in both files. Both call `getAllFoundationDocs` or `getFoundationDoc`, filter nulls with the same type guard, and format as `## type (updated timestamp)\ncontent`.
- **Expected:** Extract a shared helper like `formatFoundationDocs(ideaId: string): Promise<string>` into a shared module that both `assembleSystemPrompt` and `createConsultAdvisorTool` can call.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17
