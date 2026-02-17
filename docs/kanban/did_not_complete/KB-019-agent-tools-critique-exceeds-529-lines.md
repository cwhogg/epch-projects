# KB-019: Split agent-tools/critique.ts exceeding 529 lines

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/agent-tools/critique.ts:1-529`
- **Observed:** The critique tools file is 529 lines containing all LLM tool definitions for the content critique pipeline. The tool definitions span multiple critique phases and could be organized into phase-specific modules.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Resolved:** 2026-02-16
- **Fix:** Closed during triage — false positive on line count. The file is a single cohesive pipeline factory (`createCritiqueTools`) whose 6 tools share mutable closure state (`selectedCritics`, `previousRoundCritiques`, `previousAvgScore`, `accumulatedFixedItems`, `accumulatedWellScored`). This state threads through the tool lifecycle (`generate_draft` → `run_critiques` → `editor_decision` → `revise_draft` → `summarize_round` → `save_content`) and is only coherent as a single closure. Splitting into phase-specific modules would require promoting this state to an explicit shared object, adding argument surface area, or serializing it back to Redis — all of which increase complexity. The file is 529 lines because the pipeline has 6 tools with real business logic (LLM calls, Redis operations), not due to poor organization. No split is warranted.
