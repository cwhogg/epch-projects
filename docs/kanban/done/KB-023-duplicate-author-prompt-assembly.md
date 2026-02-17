# KB-023: Duplicate author system prompt assembly in generate_draft and revise_draft

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/agent-tools/critique.ts:219-225 and 441-447`
- **Observed:** The identical 6-line block that builds the author system prompt — loading the advisor prompt, conditionally appending the framework — is copied verbatim in both the generate_draft tool and the revise_draft tool. Any change to how the author prompt is assembled must be made in two places.
- **Expected:** Extract a shared helper function (e.g., `buildAuthorSystemPrompt`) that both tools call.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** Both blocks at `src/lib/agent-tools/critique.ts:219-225` (generate_draft) and `441-447` (revise_draft) are verbatim identical — 7 lines each, same logic, same order, no per-site variation. Both call `getAdvisorSystemPrompt(recipe.authorAdvisor)` then conditionally append `getFrameworkPrompt(recipe.authorFramework)` with `'\n\n## FRAMEWORK\n'`.
- **Root Cause:** `revise_draft` was added after `generate_draft` and duplicated the prompt assembly block rather than factoring it out — both tools share the same author identity requirements (same `recipe.authorAdvisor`, same `recipe.authorFramework`).
- **Risk Assessment:** Low. The helper is pure and deterministic — it takes a `ContentRecipe` and returns a `string`. No API response shapes change. Existing tests mock `getAdvisorSystemPrompt` and `getFrameworkPrompt` at the module level, so they continue to exercise the same behavior through the tool calls without modification. The only risk is a copy error during extraction, which is easily verified by diffing the helper body against the original blocks.
- **Validated Fix:** Add a module-level (unexported) helper function before `createCritiqueTools`:
  ```typescript
  function buildAuthorSystemPrompt(recipe: ContentRecipe): string {
    let systemPrompt = getAdvisorSystemPrompt(recipe.authorAdvisor);
    if (recipe.authorFramework) {
      const frameworkPrompt = getFrameworkPrompt(recipe.authorFramework);
      if (frameworkPrompt) {
        systemPrompt += '\n\n## FRAMEWORK\n' + frameworkPrompt;
      }
    }
    return systemPrompt;
  }
  ```
  Replace lines 219-225 in `generate_draft` with: `const systemPrompt = buildAuthorSystemPrompt(recipe);`
  Replace lines 441-447 in `revise_draft` with: `const systemPrompt = buildAuthorSystemPrompt(recipe);`
  No prerequisite changes needed. No test changes needed.
- **Files Affected:** `src/lib/agent-tools/critique.ts` only
- **Estimated Scope:** Small — adds 9 lines (helper definition), removes 12 lines (two 6-line blocks replaced with 1-line calls each). Net: -3 lines.
