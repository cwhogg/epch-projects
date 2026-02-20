# KB-105: april-dunford-multi-turn eval scenario borderline judge scores

- **Type:** bug
- **Discovered during:** finishing-a-development-branch (eval triage)
- **Location:** `e2e/scenarios/april-dunford-multi-turn.json`
- **Observed:** Scenario gets WARN on main and FAIL on feature branches due to model variance. Judge scores hover at 2-3 (threshold is 3 for warn). All three dimensions (voice, instruction-following, output-length) fail consistently with score 2 across 3-judge panel. Single-turn version (april-dunford-foundation-chat) passes reliably.
- **Expected:** Multi-turn scenario should have stable pass/warn results. Either tighten the rubric to better evaluate multi-turn conversations (first turn is a question, second is an edit request — different expectations per turn), or add turn-aware judge context.
- **Why out of scope:** Not caused by website-builder-rebuild changes. Pre-existing borderline scenario.
- **Severity:** MEDIUM
- **Created:** 2026-02-20
