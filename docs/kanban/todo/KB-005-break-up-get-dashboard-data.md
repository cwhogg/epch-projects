# KB-005: Break up God function getDashboardData

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/analyses/[id]/page.tsx:79-175`
- **Observed:** getDashboardData() is 96 lines doing 7 distinct things: DB fetch coordination, SEO data parsing, signup count retrieval, GSC metrics calculation, foundation doc transformation, content piece filtering, and fallback handling. Hard for a new contributor to understand the full scope.
- **Expected:** Decompose into focused helper functions (e.g., fetchSeoMetrics, fetchFoundationSummary, etc.) called from a thinner orchestrator.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-16
