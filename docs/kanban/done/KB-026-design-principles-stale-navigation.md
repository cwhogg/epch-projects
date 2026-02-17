# KB-026: design-principles.md navigation section is stale

- **Type:** doc-staleness
- **Discovered during:** doc-staleness-detector
- **Location:** `docs/design/design-principles.md`
- **Observed:** The Navigation section (lines 226-234) describes a 6-link/6-tab navigation structure that no longer exists:
  - **Desktop (line 228):** Says "Logo left, 6 text nav links right." The actual `NavLinks.tsx` now has 3 links: Projects, Ideation, Analytics.
  - **Mobile (line 231):** Says "Icon + label for each of the 6 pipeline stages." The actual `MobileNav.tsx` now has 3 tabs: Projects, Ideation, Analytics.
  - The nav redesign (commits a1cb1a0, 0fce4fd, cd2f537, dd99346, d5525a8) rewrote the entire navigation to a project-centric 3-tab model where individual pipeline stages (Analysis, Content, Website, Testing, Optimization) are accessed through project detail pages at `/analyses/[id]/*`.
- **Expected:** Navigation section should describe the 3-tab model: "Logo left, 3 text nav links right (Projects, Ideation, Analytics)" for desktop and "3 tabs with icons: Projects, Ideation, Analytics" for mobile. Should note that pipeline stages are accessed through project detail views, not top-level navigation.
- **Source commits:** 35 commits since doc was last updated, Feb 16 (same day, earlier commits)
- **Severity:** MEDIUM
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** REVISE
- **Evidence:**
  - `docs/design/design-principles.md` line 229 (desktop): "Logo left, nav links right. Active link: coral text color." — does NOT contain the phrase "6 text nav links" as the KB item claims. The desktop description is generic and does not name the 3 links, but it is not actively wrong.
  - `docs/design/design-principles.md` line 232 (mobile): "Icon + label for each pipeline stage. Active tab: coral color." — this IS stale. The current MobileNav has 3 tabs (Projects, Ideation, Analytics), not pipeline stages.
  - `src/components/NavLinks.tsx` lines 7-11: navItems array contains exactly 3 entries — `{ href: '/', label: 'Projects' }`, `{ href: '/ideas/new', label: 'Ideation' }`, `{ href: '/analytics', label: 'Analytics' }`.
  - `src/components/MobileNav.tsx` lines 10-45: tabs array contains exactly 3 entries — Projects, Ideation, Analytics — with inline SVG icons. No pipeline stages present.
- **Root Cause:** The nav was redesigned (commits a1cb1a0–d5525a8) from a pipeline-stage-centric model to a project-centric 3-tab model. The design-principles.md Navigation section was not updated during that work. The mobile description retained "each pipeline stage" language that no longer reflects reality.
- **Revision to KB scope:** The KB item overstates the desktop problem. Line 229 does not say "6 text nav links" — it says "Logo left, nav links right." The desktop fix is an enhancement (name the 3 links explicitly), not a correction of wrong information. The mobile fix at line 232 is the genuine staleness issue.
- **Risk Assessment:** Documentation-only change. No code, tests, API contracts, or runtime behavior affected. Zero risk.
- **Validated Fix:**
  1. In `docs/design/design-principles.md`, update line 229 to name the 3 links explicitly: replace "Logo left, nav links right." with "Logo left, 3 text nav links right (Projects, Ideation, Analytics)."
  2. Update line 232 to replace "Icon + label for each pipeline stage." with "3 tabs with icon + label: Projects, Ideation, Analytics. Pipeline stages are accessed through project detail views, not top-level navigation."
  3. No other changes needed.
- **Files Affected:** `docs/design/design-principles.md`
- **Estimated Scope:** Small — 2 lines updated in one doc file.
