# KB-061: Nested ternaries for step indicator colors across build pages

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/website/[id]/build/page.tsx:851-869` and `src/app/website/[id]/page.tsx:302-311`
- **Observed:** Step indicator colors (connector line background, indicator background, text color) use 3-4 level nested ternaries in JSX. The same status-to-color mapping is repeated across both the build page and the website detail page.
- **Expected:** Extract a `getStepColor(status)` helper function shared between both files, using if/else instead of nested ternaries.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-17
- **Resolved:** 2026-02-17
- **Fix:** Closed during triage — the two files use different status vocabularies (`active` in build/page.tsx vs `running` in page.tsx), so there is no genuine shared mapping to extract. A shared helper would require either a leaky abstraction accepting both synonyms or two separate per-file helpers — eliminating any sharing benefit. The nesting depth (2-3 levels, not 3-4 as described) is idiomatic in React JSX and readable at point-of-use. No real duplication exists beyond a conceptual pattern.
