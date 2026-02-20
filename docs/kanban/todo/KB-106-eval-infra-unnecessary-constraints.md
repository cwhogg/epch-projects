# KB-106: Audit eval infrastructure for unnecessary constraints

- **Type:** bug
- **Discovered during:** finishing-a-development-branch (eval triage)
- **Location:** `e2e/eval-helpers/judge.ts`, `e2e/eval-config.ts`, `e2e/dimensions/output-length.ts`
- **Observed:** Several hardcoded constraints in the eval infrastructure caused false failures: (1) `MAX_PROMPT_LEN = 3000` in judge.ts truncated system prompts so the judge couldn't see task instructions, only the advisor persona; (2) global output-length thresholds (500 words, 15 paragraphs) are too tight for complex surfaces like website-chat that narrate multi-stage processes; (3) The eval is not optimizing for cost — money is not the constraint. These limits seem like premature optimization artifacts.
- **Expected:** Review all numeric constraints in the eval infrastructure. For each one, ask: what is this optimizing for? If it's cost, remove or significantly relax it. Specific items: (1) `MAX_PROMPT_LEN` in judge.ts — should be generous enough that no surface's system prompt gets meaningfully truncated; (2) default output-length thresholds in eval-config — should be reasonable defaults that don't trip on legitimate complex outputs; (3) `JUDGE_CALLS = 3` — is 3 enough for stable scoring? Consider 5 for flaky scenarios.
- **Why out of scope:** Infrastructure review — broader than the website-builder-rebuild feature work
- **Severity:** MEDIUM
- **Created:** 2026-02-20
