# KB-109: Three listing page renderers duplicate the same post-list JSX pattern

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/painted-door-templates.ts:424-720`
- **Observed:** renderBlogListing, renderCompareListing, and renderFaqListing each produce structurally identical JSX: a page header, empty-state card, and a post card list. The only variation is the content type string, route prefix, and two label strings. Roughly 100 lines of template string are repeated three times.
- **Expected:** Extract a generic listing renderer parameterized by content type, route prefix, and labels.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-20
