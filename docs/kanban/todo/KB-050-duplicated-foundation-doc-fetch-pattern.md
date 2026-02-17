# KB-050: Duplicated foundation-doc fetching pattern across route and page

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/analyze/[id]/route.ts:12-17` and `src/app/project/[id]/analysis/page.tsx:31-36`
- **Observed:** The pattern `Promise.all([getFoundationDoc(id, 'strategy').catch(() => null), getFoundationDoc(id, 'positioning').catch(() => null)])` followed by `.filter(Boolean) as FoundationDocument[]` appears identically in both files.
- **Expected:** Extract a `fetchFoundationDocs(ideaId: string): Promise<FoundationDocument[]>` helper into a shared location. Both call sites can then use the single function.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17
