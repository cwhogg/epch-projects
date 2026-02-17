# KB-022: console.error calls missing module prefix in core lib files

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/serp-search.ts:79`, `src/lib/research-agent.ts:401`, `src/lib/painted-door-agent.ts:536`, `src/lib/content-agent.ts:103`
- **Observed:** Multiple core lib files call `console.error` without a `[module-name]` prefix (e.g., `console.error('SEO pipeline failed...')` instead of `console.error('[research-agent] SEO pipeline failed...')`). The framework-loader.ts uses the bracketed convention correctly, but serp-search.ts, research-agent.ts, painted-door-agent.ts, content-agent.ts, and seo-analysis.ts do not, making log triage harder in production.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** MEDIUM
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** CONFIRM
- **Evidence:**
  - `src/lib/serp-search.ts:79` — `console.error(\`SERP search failed for "${keyword}":\`, error)` — no prefix
  - `src/lib/research-agent.ts:401` — `console.error('SEO pipeline failed, falling back:', seoError)` — no prefix
  - `src/lib/painted-door-agent.ts:536` — `console.error('Painted door agent failed:', error)` — no prefix
  - `src/lib/painted-door-agent.ts:760` — `console.error('Website agent v2 failed:', error)` — no prefix (missed by KB item)
  - `src/lib/content-agent.ts:103` — `console.error('Failed to parse SEO data for content context')` — no prefix
  - `src/lib/content-agent.ts:316` — `console.error(\`Failed to generate ${piece.title}:\`, error)` — no prefix (missed by KB item)
  - `src/lib/seo-analysis.ts:238` — `console.error('Claude SEO: no tool_use block in response')` — no prefix
  - `src/lib/seo-analysis.ts:241` — `console.error('Claude SEO tool use failed:', error)` — no prefix
  - `src/lib/seo-analysis.ts:299` — `console.error('OpenAI SEO analysis failed:', error)` — no prefix
  - `src/lib/seo-analysis.ts:829` — `console.error('Failed to parse SEO JSON...')` — no prefix
  - The reference convention is confirmed: `src/lib/frameworks/framework-loader.ts:166-168` uses `[framework-loader]` prefix; `src/lib/analytics-agent.ts:336` uses `[analytics]`; `src/lib/github-publish.ts:123` uses `[commitToRepo]`
  - The split is systematic: `console.log`/`console.debug` in these files already use bracketed prefixes (e.g., `[research-v2]`, `[painted-door]`, `[content-agent]`), but `console.error` in catch blocks was never updated to match
  - Note: `src/lib/frameworks/framework-loader.ts` was cited in the KB item but the actual file lives at `src/lib/frameworks/framework-loader.ts`, not `src/lib/framework-loader.ts`
- **Root Cause:** The bracketed-prefix convention was adopted for `console.log` (the "happy path" progress logging) and propagated consistently there. `console.error` calls in catch blocks were written earlier or independently and never got the same treatment. This is accidental historical drift, not intentional design.
- **Risk Assessment:** Pure string-literal change in error log messages — no behavioral change, no API impact, no type changes. Zero risk. No tests reference these log strings. The only concern is scope creep: the KB item listed 4 call sites but there are actually 10 across 5 files (including the 4 seo-analysis.ts calls not mentioned in the original item).
- **Validated Fix:** Update each unprefixed `console.error` call to use its module's established bracket prefix. The correct prefixes to use, derived from the existing `console.log` calls in each file:
  - `serp-search.ts` → `[serp-search]`
  - `research-agent.ts` → `[research-agent]` (v1 catch) and `[research-v2]` (v2 catch, already prefixed at line 671)
  - `painted-door-agent.ts` → `[painted-door]` (v1 catch at line 536) and `[website-v2]` (v2 catch at line 760)
  - `content-agent.ts:103` → `[content-agent]` (inside `buildContentContext`)
  - `content-agent.ts:316` → `[content-agent]` (inside `generateContentPieces`)
  - `seo-analysis.ts` → `[seo-analysis]` (no existing console.log prefix established; use this as the new standard for this file)
- **Files Affected:** `src/lib/serp-search.ts`, `src/lib/research-agent.ts`, `src/lib/painted-door-agent.ts`, `src/lib/content-agent.ts`, `src/lib/seo-analysis.ts`
- **Estimated Scope:** Small — 10 single-line string edits across 5 files, no logic changes
