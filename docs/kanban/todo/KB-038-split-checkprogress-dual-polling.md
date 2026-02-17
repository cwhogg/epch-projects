# KB-038: Split checkProgress into two mode-specific polling functions

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/content/[id]/generate/page.tsx:76-108`
- **Observed:** checkProgress branches on pipelineMode to call different endpoints, update different state slices (setProgress vs setCritiqueProgress), and evaluate different completion conditions. This is two functions with one name sharing a polling interval — a new contributor must trace two parallel execution paths through a single function to understand either one.
- **Expected:** Split into two named functions (e.g., pollGenerationProgress and pollCritiqueProgress), each owning its endpoint, state update, and done-condition. Share the polling interval setup.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-17
