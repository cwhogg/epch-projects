# KB-007: Extract website status styling logic

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/page.tsx:167-177`, `src/app/analyses/[id]/page.tsx:64-77`
- **Observed:** Website status badge styling logic appears inline in page.tsx and as functions in [id]/page.tsx. The inline version is harder to test and maintain.
- **Expected:** Use the extracted functions consistently across both pages.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** CONFIRM
- **Evidence:**
  - `src/app/page.tsx:163-178` — inline ternary chains set `background` and `color` directly in a `style={{}}` prop for the website status badge. Five status values are handled inline with hard-coded color tokens.
  - `src/app/analyses/[id]/page.tsx:64-73` — `getWebsiteStatusStyle(status)` is an extracted function returning `{ bg, color }` with an identical switch covering the same five status values.
  - `src/app/analyses/[id]/page.tsx:75-77` — `getWebsiteStatusLabel(status)` capitalizes the first character of the status string.
  - Both files also duplicate `getBadgeClass(rec)` identically (page.tsx:18-25, [id]/page.tsx:46-53). The KB item does not mention this but it is the same extraction opportunity in scope.
  - Grep confirms the pattern exists in exactly these two files — no broader codebase drift.
- **Root Cause:** Accidental inconsistency. The detail page (`[id]/page.tsx`) extracted the helpers explicitly; the home/list page (`page.tsx`) was written with inline styles. Both were likely written at different times without cross-referencing.
- **Risk Assessment:** Pure UI helper functions with no side effects, no async, no API surface changes. No existing tests for either page file. Only two files are affected. No auth or security logic. Risk is minimal.
- **Validated Fix:**
  1. Add `getWebsiteStatusStyle`, `getWebsiteStatusLabel`, and `getBadgeClass` to `src/lib/utils.ts` (which already holds shared helpers like `slugify`, `formatScoreName`, `buildLeaderboard`).
     - `getWebsiteStatusStyle` should return `{ background, color }` (using the CSS property name `background`, not `bg`) so both callers can spread it directly into a `style={{}}` prop.
     - `getWebsiteStatusLabel` stays as-is.
     - `getBadgeClass` stays as-is.
  2. In `src/app/page.tsx`: remove the inline ternary chains and replace with a call to `getWebsiteStatusStyle(project.websiteStatus)` spread into the `style={{}}` prop; use `getWebsiteStatusLabel` for the label; remove the local `getBadgeClass` and import from utils.
  3. In `src/app/analyses/[id]/page.tsx`: remove the three local function definitions and import them from `src/lib/utils.ts`; update callers to use `.background` instead of `.bg`.
  4. Add unit tests for all three functions to `src/lib/__tests__/utils.test.ts` (the test file already exists).
- **Files Affected:**
  - `src/lib/utils.ts` (add 3 functions)
  - `src/lib/__tests__/utils.test.ts` (add tests for the 3 new functions)
  - `src/app/page.tsx` (remove local `getBadgeClass`, import from utils, replace inline status styling)
  - `src/app/analyses/[id]/page.tsx` (remove 3 local functions, import from utils, update `.bg` to `.background`)
- **Estimated Scope:** Small — ~30-40 lines changed across 4 files.
