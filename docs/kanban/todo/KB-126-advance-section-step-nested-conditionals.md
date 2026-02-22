# KB-126: advanceSectionBasedStep uses deeply nested if blocks instead of early returns

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/app/api/painted-door/[id]/chat/route.ts:494-548`
- **Observed:** `advanceSectionBasedStep` has three major nesting levels with no early returns. The substep block (lines 508-538) alone contains 5 sequential nested conditionals — each checking `session.currentStep === 2` again despite being inside a guard that already confirmed it. The function mutates 4-5 fields on the session object per branch, making it hard to verify that every exit path leaves the session in a consistent state. Rewriting with guard clauses (`if (session.currentStep !== 2) return;` etc.) and removing redundant checks would flatten the structure and make each state transition independently readable.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** MEDIUM
- **Created:** 2026-02-22
