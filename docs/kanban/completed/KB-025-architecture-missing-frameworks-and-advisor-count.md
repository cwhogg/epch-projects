# KB-025: architecture.md is stale

- **Type:** doc-staleness
- **Discovered during:** doc-staleness-detector
- **Location:** `docs/architecture.md`
- **Observed:** Two specific sections are out of date:
  1. **Library Module Map, Advisors section** (line 239) says "4 advisors: Richard Rumelt, April Dunford, Brand Copywriter, SEO Expert" but the registry (`src/lib/advisors/registry.ts`) now has 13 advisors including Shirin Oreizy, Joe Pulizzi, Robb Wolf, Patrick Campbell, Robbie Kellman Baxter, Oli Gardner, Rob Walling, Julian Shapiro, and Joanna Wiebe.
  2. **Missing frameworks infrastructure.** Commit 776f191 added `src/lib/frameworks/` with `registry.ts`, `types.ts`, `framework-loader.ts`, and `prompts/` directory containing 3 framework prompt sets (content-inc-model, forever-promise, value-metric). This new module is not represented in the Module Dependency Map, Library Module Map, or Support Modules sections.
  3. **Core Library table** (line 720) says "4-advisor virtual board registry" for `advisors/registry.ts` -- should say 13.
- **Expected:** Add a Frameworks section to the Library Module Map (parallel to the Advisors section). Update advisor count from 4 to 13 in all references. Add `src/lib/frameworks/` to the Module Dependency Map under Support Modules.
- **Source commits:** 1 commit since doc was last updated (776f191 on Feb 16, same day)
- **Severity:** MEDIUM
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** CONFIRM
- **Evidence:**
  - `docs/architecture.md:239` — Advisors subgraph reads "4 advisors: Richard Rumelt, April Dunford, Brand Copywriter, SEO Expert". Verified against `src/lib/advisors/registry.ts` which contains 13 entries: richard-rumelt, copywriter, april-dunford, seo-expert, shirin-oreizy, joe-pulizzi, robb-wolf, patrick-campbell, robbie-kellman-baxter, oli-gardner, rob-walling, julian-shapiro, joanna-wiebe.
  - `docs/architecture.md:720` — Core Library table row for `advisors/registry.ts` reads "4-advisor virtual board registry". Same stale count.
  - `grep` for "frameworks" in `docs/architecture.md` returns zero matches. `src/lib/frameworks/` exists with `registry.ts`, `types.ts`, `framework-loader.ts`, `index.ts`, and `prompts/` containing subdirectories `content-inc-model`, `forever-promise`, `value-metric`. The KB item omitted `index.ts` — minor discrepancy, doesn't change verdict.
  - `grep` for `from.*frameworks` across `src/` returns zero matches. The frameworks module exists but has no callers yet.
- **Root Cause:** Rapid feature development. The advisor expansion happened across multiple commits and the frameworks module was added on the same day this KB item was created. No enforced "update architecture.md" step in the development workflow. Purely mechanical staleness.
- **Risk Assessment:** Doc-only change. Zero runtime risk. No API surface, no tests affected. The one nuance: since `src/lib/frameworks/` has no callers yet, dependency edges in the Module Dependency Map cannot be drawn — only the node entry under Support Modules should be added. Adding speculative edges would be inaccurate.
- **Validated Fix:**
  1. `docs/architecture.md:239` — In the Library Module Map `Advisors` subgraph, replace "4 advisors: Richard Rumelt, April Dunford,\nBrand Copywriter, SEO Expert" with "13 advisors including Rumelt, Dunford,\nPulizzi, Wolf, Campbell, Baxter, Gardner,\nWalling, Shapiro, Wiebe, Oreizy + 2 more".
  2. `docs/architecture.md:720` — In the Core Library table, change "4-advisor virtual board registry" to "13-advisor virtual board registry".
  3. `docs/architecture.md` Library Module Map — Add a new `Frameworks` subgraph block after the `Advisors` subgraph (before `Utilities`), documenting `frameworks/registry.ts`, `frameworks/types.ts`, `frameworks/framework-loader.ts`, `frameworks/index.ts`, and `frameworks/prompts/` with the 3 prompt sets.
  4. `docs/architecture.md` Module Dependency Map — Add `S_FRAMEWORKS["frameworks/registry,\nframeworks/prompt-loader"]` to the `Support` subgraph node list. Do NOT add any dependency edges — no callers exist yet.
  5. `docs/architecture.md` Core Library table — Add a row for `src/lib/frameworks/` describing the frameworks registry and loader.
- **Files Affected:** `docs/architecture.md` only.
- **Estimated Scope:** Small — 5 targeted edits to a single markdown file, no logic changes.
