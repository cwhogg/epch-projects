# KB-013: Split research-agent.ts exceeding 778 lines

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/research-agent.ts:1-778`
- **Observed:** The research agent is 778 lines combining per-step prompt generation (a large switch statement), agent orchestration, progress tracking, and result-saving logic. The prompt builder and orchestrator are large enough to justify separate modules.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** REVISE
- **Evidence:**
  - `src/lib/research-agent.ts` is exactly 778 lines (confirmed via wc -l)
  - `createPrompt()` switch statement: lines 34-196 (~162 lines of domain-specific prompt text with zero orchestration dependencies)
  - `RESEARCH_SYSTEM_PROMPT` constant: lines 523-554 (~32 lines, no dependencies)
  - Parser functions (`parseScores`, `parseRecommendation`, `parseConfidence`, `parseRisks`, `parseSummary`): lines 198-337 (~140 lines, all take `string` and return typed results — no imports from this file's orchestration logic)
  - V1 orchestrator (`runResearchAgent`): lines 339-517
  - V2 agentic orchestrator (`runResearchAgentV2`): lines 556-720
  - Entry point (`runResearchAgentAuto`): lines 725-733
  - `buildSEOScoringContext`: lines 735-778 (only used by V1 orchestrator, tightly coupled to `SEOPipelineResult`)
  - External consumers: `src/app/api/analyze/[id]/route.ts` imports only `runResearchAgentAuto`; `src/lib/__tests__/research-agent-parsers.test.ts` imports the five parser functions

- **Root Cause:** The file grew by accretion. V1 orchestrator came first, parsers were added adjacent to it, SEO context builder was added when the SEO pipeline was integrated, then V2 was appended at the bottom. No intentional structure — each addition was small and localized. This is the only agent file that combines prompts + parsers + two orchestration strategies into one module. Other agents in the project (`analytics-agent.ts`, `content-agent.ts`, `foundation-agent.ts`) have separate prompt files. The test file name `research-agent-parsers.test.ts` already anticipates this split.

- **Risk Assessment:** Low. Parser extraction requires updating one import path in one test file. Prompt extraction has zero downstream callers outside this file. The entry-point `runResearchAgentAuto` and its import in `route.ts` are untouched.

- **What the KB item got wrong:** The item implies splitting "the prompt builder and orchestrator" as two modules. That is partially correct. However, splitting the V1 and V2 orchestrators from each other would add cross-file coupling: both share `ANALYSIS_STEPS`, `buildSEOScoringContext`, and the `stepIndex` pattern. The right split is prompts + parsers into new files, while keeping both orchestrators together in `research-agent.ts`.

- **Validated Fix:**
  1. Create `src/lib/research-agent-prompts.ts`: move `createPrompt()` (lines 34-196), `RESEARCH_SYSTEM_PROMPT` (lines 523-554). This file imports `ProductIdea` from `@/types` and `buildExpertiseContext` from `./expertise-profile`. Export both.
  2. Create `src/lib/research-agent-parsers.ts`: move `parseScores`, `parseRecommendation`, `parseConfidence`, `parseRisks`, `parseSummary` (lines 198-337). This file imports `Analysis`, `AnalysisScores` from `@/types`. Export all five functions.
  3. In `src/lib/research-agent.ts`: replace the moved code with imports from the two new files. Keep `runResearchAgent`, `runResearchAgentV2`, `runResearchAgentAuto`, `buildSEOScoringContext`, and the `ANALYSIS_STEPS` constant.
  4. Update `src/lib/__tests__/research-agent-parsers.test.ts`: change import from `'../research-agent'` to `'../research-agent-parsers'`.
  5. Do NOT split V1 and V2 orchestrators — they share constants and helpers; separating them would introduce cross-file coupling with no maintainability gain.
  6. Run `npm run build` and `npm run lint` to verify no broken imports.

- **Files Affected:**
  - `src/lib/research-agent.ts` (reduced to ~476 lines)
  - `src/lib/research-agent-prompts.ts` (new, ~194 lines)
  - `src/lib/research-agent-parsers.ts` (new, ~140 lines)
  - `src/lib/__tests__/research-agent-parsers.test.ts` (import path update only)

- **Estimated Scope:** Small — mechanical extraction of well-bounded code; no logic changes. ~2 new files, 1 import path update.
