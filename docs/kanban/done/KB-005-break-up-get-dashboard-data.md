# KB-005: Break up God function getDashboardData

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/analyses/[id]/page.tsx:79-175`
- **Observed:** getDashboardData() is 96 lines doing 7 distinct things: DB fetch coordination, SEO data parsing, signup count retrieval, GSC metrics calculation, foundation doc transformation, content piece filtering, and fallback handling. Hard for a new contributor to understand the full scope.
- **Expected:** Decompose into focused helper functions (e.g., fetchSeoMetrics, fetchFoundationSummary, etc.) called from a thinner orchestrator.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** REVISE
- **Evidence:** Function confirmed at `src/app/analyses/[id]/page.tsx:79-175` (96 lines). The KB's seven-concern inventory is accurate. However, closer inspection shows the concerns vary significantly in size and extractability: the `Promise.all` block (line 84) is 7 lines of fetch orchestration; the SEO parsing (lines 93-102) is a 9-line try/catch over already-fetched data; the GSC calculation (lines 108-120) is a 12-line async fetch + aggregation; and the foundation/content transforms (lines 122-129) are 3-4 line loops. The fallback branch (lines 153-174) is already clearly bounded.
- **Root Cause:** Incremental feature addition — each new dashboard card (GSC, painted door, content pipeline) added a small, reasonable block to an existing orchestrator. No single addition crossed a threshold; the accumulation did.
- **Risk Assessment:** `getDashboardData` has exactly one caller (`ProjectDashboard` at line 184) and is module-internal. No API contract is at risk. The GSC block has nested conditional logic that must be preserved exactly (`if (gscLink)` then `if (gscData?.timeSeries?.length)`). No test files reference this function directly. Risk is low.
- **Validated Fix:** Extract only the two blocks with genuine standalone value — do not extract all seven concerns as the KB suggests:
  1. Extract `parseSeoMetrics(seoData: string | undefined): { agreedKeywords: number; serpValidated: number }` — pure function, no async, wraps lines 93-102. Name accurately reflects what it does (it does not fetch).
  2. Extract `fetchGscMetrics(ideaId: string): Promise<{ gscImpressions: number | null; gscClicks: number | null; gscCTR: number | null }>` — async function, wraps lines 108-120 including the `getGSCAnalytics` call and last-7-days aggregation. Caller guards with `if (gscLink)` before calling.
  3. Optionally extract `getFallbackDashboardData(id: string): DashboardData | null` — wraps lines 153-174. Low value since it's already well-bounded by a comment, but it does remove the asymmetry between the two code paths.
  - Do NOT extract: `Promise.all` block (inseparable from the orchestration flow), foundation doc loop (4 lines), content piece filtering (3 lines).
- **Files Affected:** `src/app/analyses/[id]/page.tsx` only — all helpers are module-internal to this file.
- **Estimated Scope:** Small — ~25 lines moved into 2-3 new helper functions within the same file. No imports change, no types change, no callers outside this file.
