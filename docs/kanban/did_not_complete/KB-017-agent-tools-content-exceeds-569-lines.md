# KB-017: Split agent-tools/content.ts exceeding 569 lines

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/agent-tools/content.ts:1-569`
- **Observed:** The content tools file is 569 lines containing all LLM tool definitions for the content generation agent. Tool definitions for content calendar creation, piece drafting, and SEO integration are distinct phases that could be split into separate tool modules.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Resolved:** 2026-02-16
- **Fix:** Closed during triage — the file's length reflects intentional cohesion, not disorder. The single exported function `createContentTools` wraps 9 tool closures that share two mutable closure variables: `cachedCtx` (loaded by `get_research_context`, consumed by all planning and writing tools) and `generatedPieces` (a Map written by `write_content_piece` and `revise_content`, read by `evaluate_content` and `save_piece`). This shared closure state is load-bearing — it is the execution model for an agent tool suite that runs as a single invocation. Splitting into separate modules would require threading or exporting that state, adding cross-module coupling that is harder to reason about than the current self-contained closure. The 569-line count is a code simplifier false positive on a file doing real, dense work. No split is warranted.
