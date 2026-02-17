# KB-032: detectChanges constructs identical alert objects five times

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/analytics-agent.ts:248-335`
- **Observed:** Five alert conditions (first appearance, clicks up, clicks down, position improved, position dropped, traffic lost) each call alerts.push with the same six-field object shape: pieceSlug, pieceTitle, severity, message, metric, previousValue, currentValue. The repeated construction obscures the actual threshold logic and means adding a new alert field requires touching five sites.
- **Expected:** Extract a `createAlert()` helper that takes the varying fields and constructs the full object
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16
