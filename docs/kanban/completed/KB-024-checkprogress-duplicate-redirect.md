# KB-024: checkProgress contains duplicate redirect logic across pipelineMode branches

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/analyses/[id]/content/generate/page.tsx:76-104`
- **Observed:** checkProgress branches on pipelineMode into two near-identical fetch-then-set-state blocks. Both branches end with the same setTimeout redirect (2000ms, same URL). The redirect is the only shared behavior but lives duplicated in both arms of the if/else.
- **Expected:** Extract the shared redirect logic after the if/else, or unify the two branches.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** `src/app/analyses/[id]/content/generate/page.tsx:84-88` (pipeline branch) and `:95-99` (step branch) each contain an identical `setTimeout(() => { router.push(\`/analyses/${analysisId}/content\`); }, 2000)` block. The two fetches and state setters are legitimately different; only the redirect is duplicated.
- **Root Cause:** Pipeline mode was added after the original step-based mode and the redirect was copied into the new branch rather than refactored out. Classic "copy and extend" accumulation.
- **Risk Assessment:** Low. `checkProgress` is a `useCallback` used only inside a `useEffect` `setInterval` in this file. No API shapes change. No external callers. No tests for this component to break. The only subtlety is the interval keeps firing after redirect fires — that is pre-existing behavior and not introduced by the fix.
- **Validated Fix:**
  1. Inside `checkProgress`, introduce a local `let isDone = false` before the if/else.
  2. In the pipeline branch (lines 84-88): remove the `setTimeout` call; instead set `isDone = true` when `data.status === 'complete' || data.status === 'max-rounds-reached'`.
  3. In the step branch (lines 95-99): remove the `setTimeout` call; instead set `isDone = true` when `data.status === 'complete'`.
  4. After the if/else (before the catch block), add: `if (isDone) { setTimeout(() => { router.push(\`/analyses/${analysisId}/content\`); }, 2000); }`
- **Files Affected:** `src/app/analyses/[id]/content/generate/page.tsx` only
- **Estimated Scope:** Small — ~6 lines changed, zero new files
