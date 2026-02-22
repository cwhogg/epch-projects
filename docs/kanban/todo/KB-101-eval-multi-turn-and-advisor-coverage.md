# KB-101: Expand eval scenario coverage (multi-turn, remaining advisors/frameworks)

- **Type:** eval-gap
- **Discovered during:** eval-audit
- **Location:** `e2e/scenarios/`
- **Observed:** All 7 existing scenarios are single-turn. 10 of 14 advisor personas and 4 of 5 frameworks have zero eval scenarios. The `instruction-following` dimension heuristic always returns `n/a`. No scenario tests the foundation chat surface or SEO analysis surface.
- **Expected:** Prioritize: (1) multi-turn advisor-chat scenario (conversation with prior context), (2) foundation chat surface + scenario, (3) remaining high-value advisors (julian-shapiro, copywriter, oli-gardner). Lower priority: remaining frameworks, analytics agent, validation canvas.
- **Why out of scope:** Breadth expansion — separate from the autonomous-mode-specific gap in KB-099.
- **Severity:** MEDIUM
- **Created:** 2026-02-19
