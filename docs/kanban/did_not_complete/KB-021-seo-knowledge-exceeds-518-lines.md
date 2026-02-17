# KB-021: Split seo-knowledge.ts exceeding 518 lines

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/seo-knowledge.ts:1-518`
- **Observed:** The SEO knowledge file is 518 lines combining vertical detection logic, scoring guidelines, content gap type definitions, and knowledge context builders for both Claude and OpenAI. The context builders and the vertical/scoring constants are distinct concerns that would be more maintainable split apart.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Resolved:** 2026-02-16
- **Fix:** Closed during triage — single-domain knowledge registry flagged by line count; splitting would add complexity without improving maintainability.

**Evidence:** `src/lib/seo-knowledge.ts` is 519 lines. Approximately 399 lines (~77%) are static data constants (KEYWORD_PATTERNS, SERP_CRITERIA, CONTENT_GAP_TYPES, SCORING_WEIGHTS, INTENT_WEIGHTS, VOLUME_CLASSIFICATIONS, COMMUNITY_MAPPINGS). The remaining 120 lines are four short functions (detectVertical at line 391, buildClaudeKnowledgeContext at 422, buildOpenAIKnowledgeContext at 457, buildScoringGuidelines at 483) that select slices from those constants and format them into strings.

**Why CLOSE:** The file is a single-domain SEO knowledge registry. All data and all functions belong to the same domain. The proposed split — "context builders" vs "vertical/scoring constants" — would require the builders file to import from the constants file, trading one file for two plus an import chain. The builders are only intelligible in relation to the data they format; colocating them is a cohesion feature, not a smell. Internal section comments (`// ---------- Section ----------`) already provide navigation. Four of the five callers (seo-analysis.ts, painted-door-prompts.ts, agent-tools/website.ts, seo-knowledge.test.ts) import a mix of data exports and function exports from the same module — splitting would force all four to update their imports with no behavioral benefit. This is a data registry correctly flagged by a line-count heuristic.
