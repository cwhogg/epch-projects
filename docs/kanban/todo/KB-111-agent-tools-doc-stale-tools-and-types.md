# KB-111: Agent Tools & Skills doc is stale

- **Type:** doc-staleness
- **Discovered during:** doc-staleness-detector
- **Location:** `docs/Agent Tools & Skills.md`
- **Observed:**
  1. **Header says "Total Tools: 53"** (line 7) but actual count is 54. Foundation lost `load_design_seed` (-1), Website lost `design_brand` (-1), Website gained `lock_section_copy` (+1) and `lock_page_meta` (+1), Website Chat gained `consult_advisor` (+1).
  2. **Foundation Agent section says "3 tools"** (line 276) but source (`src/lib/agent-tools/foundation.ts`) has only 2: `load_foundation_docs` and `generate_foundation_doc`. The `load_design_seed` tool was removed in commit `d22d42e`.
  3. **Foundation Agent section says "6 strategic foundation documents"** (line 277) but source (`src/types/index.ts` lines 352-359) shows 7: `visual-identity` was added in commit `f016bf6`.
  4. **Foundation doc types table** (lines 289-296) lists `design-principles` advisor as "Richard Rumelt" but source (`src/lib/agent-tools/foundation.ts` line 19) shows `oli-gardner`. Also missing the `visual-identity` row entirely.
  5. **Website Agent tools table** (lines 187-204) lists `design_brand` which was removed in commit `be73016`. Missing `lock_section_copy` (locks per-section copy into PageSpec accumulator) and `lock_page_meta` (locks page-level meta like site name, tagline) which were added in commit `cde1c59`.
  6. **Website Agent section** does not document the `consult_advisor` tool from `src/lib/agent-tools/website-chat.ts`, which is a mandatory advisor consultation tool used at every copy-producing stage.
  7. **BrandIdentity interface** (lines 209-245) is completely stale. Source (`src/types/index.ts` lines 168-189) shows: `voice` object removed, `targetDemographic` removed, `landingPage` object removed, `seoDescription` removed, `colors.textPrimary` renamed to `colors.text`, `typography` renamed to `fonts` with sub-fields `heading`/`body`/`mono` (not `headingFont`/`bodyFont`/`monoFont`), `siteUrl` added, `theme` field added.
  8. **File Locations section** (lines 392-401) is missing `website-chat.ts`.
  9. **Last Updated date** says "2026-02-16" (line 6).
- **Expected:** Update total tool count to 54, fix Foundation to 2 tools and 7 doc types, correct design-principles advisor to Oli Gardner, add visual-identity row, remove design_brand from Website, add lock_section_copy/lock_page_meta/consult_advisor, rewrite BrandIdentity interface to match source, add website-chat.ts to file locations, update last-updated date.
- **Source commits:** 77 commits since doc was last updated (Feb 18 to Feb 20)
- **Severity:** HIGH
- **Created:** 2026-02-21
