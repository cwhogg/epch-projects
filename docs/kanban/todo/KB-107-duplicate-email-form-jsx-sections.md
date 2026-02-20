# KB-107: Duplicate email form JSX in section renderers

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/painted-door-sections.ts:44-71 and 169-196`
- **Observed:** The email signup form block (input, submit button, success state, error display) is copy-pasted verbatim between renderHeroSection and renderFinalCtaSection. The two blocks are character-for-character identical except for surrounding wrapper elements. Any change to form behavior must be made in two places.
- **Expected:** Extract the email form into a shared helper function called by both renderers.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-20
