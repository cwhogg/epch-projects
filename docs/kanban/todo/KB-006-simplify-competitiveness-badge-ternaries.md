# KB-006: Simplify nested ternaries in competitiveness badge

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/components/SEODeepDive.tsx:148-164`
- **Observed:** Lines 148-164 contain 3-level nested ternaries for badge background and color based on competitiveness level. The logic is duplicated (once for background, once for color) and hard to scan.
- **Expected:** Replace with a lookup function or object map for clearer, non-duplicated styling.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16
