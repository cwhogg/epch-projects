# KB-007: Extract website status styling logic

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/page.tsx:167-177`, `src/app/analyses/[id]/page.tsx:64-77`
- **Observed:** Website status badge styling logic appears inline in page.tsx and as functions in [id]/page.tsx. The inline version is harder to test and maintain.
- **Expected:** Use the extracted functions consistently across both pages.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16
