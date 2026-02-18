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

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:**
  - `docs/Agent Tools & Skills.md` line 337: says "13 advisors"; table at lines 339-350 lists only 10 advisors.
  - `src/lib/advisors/registry.ts` lines 12-203: actual registry has 14 entries — `oli-gardner` (line 133, critic), `julian-shapiro` (line 165, author), `seth-godin` (line 171, strategist), `joanna-wiebe` (line 187, critic) are all present in code but absent from the doc table.
  - `docs/Agent Tools & Skills.md` line 291: strategy row shows advisor as "Richard Rumelt".
  - `src/lib/agent-tools/foundation.ts` line 15: `DOC_ADVISOR_MAP` maps `'strategy'` to `'seth-godin'`. Richard Rumelt remains assigned to `design-principles` (line 18), not strategy.
- **Root Cause:** Accidental omission from iterative development. Four advisors were added to the registry after the doc was last updated (48 commits of drift). The strategy advisor assignment was changed from `richard-rumelt` to `seth-godin` in code without a corresponding doc update.
- **Risk Assessment:** Documentation-only fix. No code changes, no API surface affected, no test impact. Risk is negligible.
- **Validated Fix:**
  1. In `docs/Agent Tools & Skills.md` line 337: change "13 advisors" to "14 advisors".
  2. In the Advisors table (after the `rob-walling` row), add four rows:
     - `oli-gardner` | Oli Gardner | critic
     - `julian-shapiro` | Julian Shapiro | author
     - `seth-godin` | Seth Godin | strategist
     - `joanna-wiebe` | Joanna Wiebe | critic
  3. In the Document Types & Advisor Assignments table (line 291), change the `strategy` row advisor from "Richard Rumelt" to "Seth Godin".
- **Files Affected:** `docs/Agent Tools & Skills.md` only.
- **Estimated Scope:** Small — 5 line changes in one markdown file.
