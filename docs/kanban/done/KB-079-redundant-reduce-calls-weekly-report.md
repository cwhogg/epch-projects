# KB-079: Redundant reduce calls in useWeeklyReport ideaSummary

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/hooks/useWeeklyReport.ts:67-81`
- **Observed:** The ideaSummary object literal calls `reduce` for totalClicks and totalImpressions 2-3 times each (6 total iterations when 3 suffice). The averageCtr formula is hard to read as a deeply nested ternary.
- **Expected:** Extract `totalClicks`, `totalImpressions`, `totalPosition` as named locals, then reference them in the object literal.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** CONFIRM
- **Evidence:** `src/hooks/useWeeklyReport.ts:67-82` matches the KB description exactly. `ideaPieces` is iterated 6 times: once each for `totalClicks` (line 69), `totalImpressions` (line 70), and `totalPosition` (line 71); then `totalClicks` and `totalImpressions` are re-computed twice more inside the `averageCtr` ternary (lines 72-74). The `averageCtr` expression embeds three nested reduces inside a ternary — genuinely hard to verify at a glance.
- **Root Cause:** Object literal written field-by-field without pre-computing shared intermediates. Accidental, not intentional.
- **Risk Assessment:** No API response shape change — `ideaSummary`'s structure is unchanged. No external dependencies. `clicksChange` and `impressionsChange` fields (lines 75-80) each have non-duplicated reduces and are unaffected. Risk is minimal.
- **Validated Fix:** Before the `ideaSummary` ternary (line 67), extract three named constants: `const totalClicks = ideaPieces.reduce((sum, p) => sum + p.current.clicks, 0)`, `const totalImpressions = ideaPieces.reduce((sum, p) => sum + p.current.impressions, 0)`, and `const totalPosition = ideaPieces.reduce((sum, p) => sum + p.current.position, 0)`. Then update the object literal: `totalClicks` and `totalImpressions` reference the locals directly; `averagePosition` becomes `Math.round((totalPosition / ideaPieces.length) * 10) / 10`; `averageCtr` becomes `totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 10000 : 0`. The `clicksChange` and `impressionsChange` fields are left unchanged.
- **Files Affected:** `src/hooks/useWeeklyReport.ts` only
- **Estimated Scope:** Small — add 3 variable declarations, simplify 5 expression sites, net ~0 lines added
