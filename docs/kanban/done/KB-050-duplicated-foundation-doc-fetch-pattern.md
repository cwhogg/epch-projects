# KB-050: Duplicated foundation-doc fetching pattern across route and page

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/analyze/[id]/route.ts:12-17` and `src/app/project/[id]/analysis/page.tsx:31-36`
- **Observed:** The pattern `Promise.all([getFoundationDoc(id, 'strategy').catch(() => null), getFoundationDoc(id, 'positioning').catch(() => null)])` followed by `.filter(Boolean) as FoundationDocument[]` appears identically in both files.
- **Expected:** Extract a `fetchFoundationDocs(ideaId: string): Promise<FoundationDocument[]>` helper into a shared location. Both call sites can then use the single function.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** REVISE
- **Evidence:**
  - `src/app/api/analyze/[id]/route.ts:12-17` — The two `getFoundationDoc` calls live inside `buildEnrichedContext`, a standalone exported helper. The `Promise.all` is a 2-element destructure exclusively for the two doc types.
  - `src/app/project/[id]/analysis/page.tsx:31-35` — The two `getFoundationDoc` calls are embedded inside a 3-element `Promise.all([getAnalysisContent(id), getFoundationDoc(...strategy...), getFoundationDoc(...positioning...)])`. The pattern is structurally different: it is load-bearing concurrency, not an independent fetch.
  - The KB item describes the patterns as "identical." They are similar but not identical — the page embeds both calls inside a larger `Promise.all`.
- **Root Cause:** Both files need the same two foundation doc types. The route needs them inside an AI context builder; the page needs them alongside content data in a concurrent fetch. The sub-pattern recurs because the data requirement is identical, but the async context differs.
- **Risk Assessment:**
  - Extracting `fetchFoundationDocs` into `src/lib/db.ts` breaks the route test's mock boundary. `route.test.ts` lines 59-144 test `buildEnrichedContext` by asserting `getFoundationDoc` is called with specific arguments (lines 141-143). If the helper is introduced in `db.ts`, the route no longer calls `getFoundationDoc` directly — those assertions must be rewritten to mock at the `fetchFoundationDocs` boundary instead.
  - The page's `getPageData` is not exported and has no tests, so the page-side refactor carries no test-update cost.
  - The outer `Promise.all` in `page.tsx` collapses from 3 elements to 2 (content + fetchFoundationDocs), which is valid and maintains full concurrency — `fetchFoundationDocs` internally runs its own `Promise.all`.
  - No API response shape changes. No auth/security code touched.
- **Validated Fix:** The fix is valid but requires adjusting the approach and updating tests:
  1. Add `fetchFoundationDocs(ideaId: string): Promise<FoundationDocument[]>` to `src/lib/db.ts`. Implementation: `Promise.all([getFoundationDoc(ideaId, 'strategy').catch(() => null), getFoundationDoc(ideaId, 'positioning').catch(() => null)]).then(docs => docs.filter(Boolean) as FoundationDocument[])`.
  2. Update `src/app/api/analyze/[id]/route.ts`: inside `buildEnrichedContext`, replace lines 12-17 with `const docs = await fetchFoundationDocs(ideaId);`.
  3. Update `src/app/project/[id]/analysis/page.tsx`: replace lines 31-36 with `const [content, foundationDocs] = await Promise.all([getAnalysisContent(id), fetchFoundationDocs(analysis.ideaId)]);`.
  4. **Prerequisite — test refactor:** Update `src/app/api/analyze/[id]/__tests__/route.test.ts` to mock `fetchFoundationDocs` from `@/lib/db` instead of `getFoundationDoc`. All existing `buildEnrichedContext` test cases (lines 59-144) must be rewritten at the `fetchFoundationDocs` mock boundary.
  5. Add tests for `fetchFoundationDocs` in `src/lib/__tests__/foundation-db.test.ts` — success path (both docs), partial path (one null), error path (Redis throws).
- **Files Affected:**
  - `src/lib/db.ts` (add helper)
  - `src/app/api/analyze/[id]/route.ts` (simplify buildEnrichedContext)
  - `src/app/project/[id]/analysis/page.tsx` (simplify getPageData)
  - `src/app/api/analyze/[id]/__tests__/route.test.ts` (rewrite buildEnrichedContext tests)
  - `src/lib/__tests__/foundation-db.test.ts` (add fetchFoundationDocs tests)
- **Estimated Scope:** Medium — ~15-20 lines changed in source, ~30-40 lines of test rewrites. The test refactor is the majority of the work.
