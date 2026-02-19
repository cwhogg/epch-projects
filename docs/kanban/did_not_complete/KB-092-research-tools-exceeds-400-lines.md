# KB-092: agent-tools/research.ts exceeds 400 lines

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/agent-tools/research.ts:1-408`
- **Observed:** The research tools module is 408 lines and defines tools for SERP search, full SEO pipeline, competitor analysis, WTP analysis, and scoring — all as closures inside a single `createResearchTools` factory. Each tool's `execute` function is substantial. The module shares mutable closure state (`competitorAnalysis`, `seoResult`, etc.) that couples tools together and makes them hard to test in isolation.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** MEDIUM
- **Created:** 2026-02-18

---

- **Resolved:** 2026-02-18
- **Fix:** Closed during triage — false positive from a line-count threshold that does not account for this module family's conventions. `research.ts` at 408 lines is the second-smallest substantive file in `src/lib/agent-tools/` (peer files range from 295 to 1032 lines). The closure-scoped shared state (`competitorAnalysis`, `seoResult`, etc.) is intentional architecture: it isolates per-agent-run accumulation cleanly within a single factory call. Splitting the file would require threading that accumulated state across module boundaries, increasing complexity without any functional benefit. The file is cohesive — one factory, one agent's toolset, one run's state context.
