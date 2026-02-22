# KB-099: Add eval scenarios for website builder autonomous mode

- **Type:** eval-gap
- **Discovered during:** eval-audit
- **Location:** `src/app/api/painted-door/[id]/chat/route.ts:60-95` (assembleSystemPrompt), `e2e/prompt-adapter.ts` (no website-chat surface)
- **Observed:** The website builder chat endpoint has zero eval coverage. The `assembleSystemPrompt` function (autonomous/interactive mode instructions, advisor roster, content quality rules) is not tracked in eval-config.ts and has no corresponding prompt-adapter surface or scenarios. The fix-autonomous-mode-chain branch changed the autonomous prompt but no eval validates the behavior.
- **Expected:** Add a `website-chat` surface to the prompt adapter and create scenarios that verify: (1) autonomous mode produces content scoped to the current stage only, (2) the LLM responds correctly to the continue message format ("Continue. Now work on stage N: Step Name."), (3) consult_advisor tool calls are generated when required.
- **Why out of scope:** First eval audit — identifying gaps, not implementing.
- **Severity:** HIGH
- **Created:** 2026-02-19
