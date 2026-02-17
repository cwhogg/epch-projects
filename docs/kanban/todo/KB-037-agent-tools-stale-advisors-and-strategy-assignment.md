# KB-037: Agent Tools & Skills doc is stale

- **Type:** doc-staleness
- **Discovered during:** doc-staleness-detector
- **Location:** `docs/Agent Tools & Skills.md`
- **Observed:**
  1. **Advisor count and table (lines 337-352):** The doc header says "13 advisors" and lists 10 in the table. The actual registry (`src/lib/advisors/registry.ts`) has 14 advisors. Missing from doc: `oli-gardner` (critic), `julian-shapiro` (author), `seth-godin` (strategist), `joanna-wiebe` (critic).
  2. **Foundation Agent advisor table (line 291):** Strategy document lists advisor as "Richard Rumelt" but `src/lib/agent-tools/foundation.ts` line 15 now maps strategy to `seth-godin`.
- **Expected:**
  1. Advisor section should say "14 advisors" and include all 14 in the table: add oli-gardner, julian-shapiro, seth-godin, and joanna-wiebe with their correct roles.
  2. Foundation Agent Document Types table should show `seth-godin` as the advisor for `strategy`, not Richard Rumelt.
- **Source commits:** 48 commits since doc was last updated (Feb 16-17, 2026)
- **Severity:** MEDIUM
- **Created:** 2026-02-17
