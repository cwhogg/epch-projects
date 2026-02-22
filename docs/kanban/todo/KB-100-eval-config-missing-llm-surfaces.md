# KB-100: Register uncovered LLM surface files in eval-config.ts

- **Type:** eval-gap
- **Discovered during:** eval-audit
- **Location:** `e2e/eval-config.ts:17-28`
- **Observed:** 11 files make direct Anthropic/OpenAI API calls with inline prompts but aren't tracked in `llmSurfacePatterns`. Most significant: `src/app/api/painted-door/[id]/chat/route.ts` (website builder), `src/app/api/foundation/[ideaId]/chat/route.ts` (foundation chat), `src/lib/seo-analysis.ts`, `src/lib/content-agent-v2.ts`, `src/lib/foundation-agent.ts`, `src/lib/content-critique-agent.ts`.
- **Expected:** Add glob patterns (or explicit paths) for each uncovered file to `llmSurfacePatterns` so future eval audits detect changes to these surfaces.
- **Why out of scope:** Config-only change but needs scenario work (KB-099 and future) to be meaningful.
- **Severity:** MEDIUM
- **Created:** 2026-02-19
