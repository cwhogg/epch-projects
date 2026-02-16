# KB-003: Extract duplicated badge/confidence styling functions

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/analyses/[id]/analysis/page.tsx:18-34`, `src/app/analyses/[id]/page.tsx:46-62`, `src/app/page.tsx:18-25`
- **Observed:** getBadgeClass() and getConfidenceStyle() appear identically in 3 separate page files. This violates DRY and creates maintenance burden when styling rules change.
- **Expected:** Extract to a shared utility module (e.g., src/lib/style-utils.ts) and import in all three pages.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16
