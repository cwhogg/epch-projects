# KB-024: Agent Tools & Skills doc is stale

- **Type:** doc-staleness
- **Discovered during:** doc-staleness-detector
- **Location:** `docs/Agent Tools & Skills.md`
- **Observed:** Multiple sections are invalidated:
  1. **Overview table** says "4 specialized agents" with "44 tools" across "4 agents." The codebase now has 6 agents (Research, Content, Foundation, Website, Analytics, Content Critique) with 7 tool files (`agent-tools/common.ts`, `research.ts`, `analytics.ts`, `content.ts`, `foundation.ts`, `critique.ts`, `website.ts`).
  2. **Foundation Agent** is completely undocumented. Foundation tools (`agent-tools/foundation.ts`) are not listed anywhere in the doc.
  3. **Content Critique Agent** is completely undocumented. Critique tools (`agent-tools/critique.ts` with `generate_draft`, `run_critiques`, `editor_decision`, `revise_draft`, `summarize_round`, `save_content`) are not listed.
  4. **Advisor count** in the Data Flow section implicitly references 4 advisors. The registry now has 13 advisors: Richard Rumelt, April Dunford, Brand Copywriter, SEO Expert, Shirin Oreizy, Joe Pulizzi, Robb Wolf, Patrick Campbell, Robbie Kellman Baxter, Oli Gardner, Rob Walling, Julian Shapiro, Joanna Wiebe.
  5. **BrandIdentity interface** (lines 207-243) shows `landingPage` and `seoDescription` as required, but commit 15a492c made them optional.
- **Expected:** Doc should cover all 6 agents and their tools, update the overview table counts, add Foundation Agent and Content Critique Agent sections, and reflect the expanded 13-advisor registry.
- **Source commits:** 53 commits since doc was last updated, Feb 7 - Feb 16
- **Severity:** HIGH
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** CONFIRM
- **Evidence:**
  - `docs/Agent Tools & Skills.md` line 6: "44 tools across 4 specialized agents" — confirmed stale.
  - `docs/Agent Tools & Skills.md` lines 14-20: Overview table lists only Research, Analytics, Content, Website, and Common. Foundation and Content Critique are entirely absent.
  - `src/lib/agent-tools/foundation.ts`: Exports `createFoundationTools()` with 3 tools — `load_foundation_docs`, `generate_foundation_doc`, `load_design_seed`. Not documented anywhere in the doc.
  - `src/lib/agent-tools/critique.ts`: Exports `createCritiqueTools()` with 6 tools — `generate_draft`, `run_critiques`, `editor_decision`, `revise_draft`, `summarize_round`, `save_content`. Not documented anywhere in the doc.
  - `src/lib/advisors/registry.ts`: `advisorRegistry` array contains exactly 13 entries. The doc's Data Flow diagram references "4 advisors" implicitly (only the original 4 integrations are represented). Advisor section is entirely absent from the doc.
  - `src/types/index.ts` line 171: `seoDescription?: string` (optional). `src/types/index.ts` line 186: `landingPage?: {` (optional). Doc lines 210 and 233 show both as required (no `?`). Confirmed stale.
- **Root Cause:** The doc was last updated 2026-02-07. The Foundation Agent and Content Critique Agent were added during the content pipeline Phase 1 and Phase 2 work (53 commits, Feb 7-16). The doc was not kept in sync. The advisor registry expanded from 4 to 13 during advisor development work. The `BrandIdentity` interface was revised (commit 15a492c) to make `landingPage` and `seoDescription` optional but the doc was not updated.
- **Risk Assessment:** Doc-only update — no source code is modified. Zero risk of breaking changes. The only risk is editorial: incomplete sections if the author misses a tool. The KB item provides a complete list of missing content, so that risk is low.
- **Validated Fix:**
  1. Update doc header: change "44 tools" and "4 specialized agents" counts to reflect current state (6 agents + common; count actual tools: 4 common + 8 research + 7 analytics + 9 content + 3 foundation + 6 critique + 16 website = 53 tools across 6 agents).
  2. Add **Foundation Agent** section documenting `load_foundation_docs`, `generate_foundation_doc`, `load_design_seed` — including input/output columns, doc dependency map, and typical flow.
  3. Add **Content Critique Agent** section documenting `generate_draft`, `run_critiques`, `editor_decision`, `revise_draft`, `summarize_round`, `save_content` — including critique cycle flow and multi-round revision logic.
  4. Add an **Advisors** section listing all 13 advisors with their role (`author`, `critic`, `strategist`) and evaluation domain. Update the Data Flow diagram to include advisor involvement.
  5. Fix **BrandIdentity** interface block (doc lines 207-243): add `?` to `seoDescription` and `landingPage` to match `src/types/index.ts` lines 171 and 186.
  6. Update the File Locations tree at the bottom to include `foundation.ts` and `critique.ts`.
- **Files Affected:**
  - `docs/Agent Tools & Skills.md` (only file)
- **Estimated Scope:** Medium — doc-only changes, roughly 100-150 lines of new content added (two full agent sections + advisor table + interface fix + header counts).
