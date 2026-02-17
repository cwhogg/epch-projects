# KB-016: Split analyses/[id]/foundation/page.tsx exceeding 633 lines

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/app/analyses/[id]/foundation/page.tsx:1-633`
- **Observed:** The foundation page is 633 lines combining data fetching, multiple doc type views, generation controls, and display logic for expertise profiles, positioning, and ICP docs. Each foundation doc type is complex enough to be its own component.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** REVISE
- **Evidence:** File confirmed at `src/app/analyses/[id]/foundation/page.tsx:1-633`. Breakdown: lines 65–159 are 12 inline SVG icon functions (no logic, pure markup); lines 24–176 contain config, utilities, and state helpers; lines 234–633 are the page JSX with two rendering branches (expanded card: 340–447, collapsed card: 449–628) inside a single `.map()`.
- **Root Cause:** Iterative feature build without a component extraction pass. SVG icons were inlined as a common shortcut. The expanded/collapsed card branches grew in place and were never factored out. No intentional design choice — accumulated complexity.
- **Corrected Fix:** The KB item's framing ("each doc type is complex enough to be its own component") is inaccurate. The six doc types are data-driven and rendered by the same two card layouts. The actual extractable units are: (1) icon components, (2) `<ExpandedDocCard>`, (3) `<CollapsedDocCard>`. Extracting by doc type would create 6 near-identical components — wrong split.
- **Validated Fix:**
  1. Extract the 12 SVG icon components (lines 65–159) to `src/app/analyses/[id]/foundation/FoundationIcons.tsx` or a shared `src/components/icons/` if other pages use similar ad-hoc SVGs.
  2. Extract the expanded card JSX (lines 340–447) into `<ExpandedDocCard>` accepting props: `doc`, `label`, `advisor`, `type`, `generating`, `isRunning`, `onCollapse`, `onRegenerate`.
  3. Extract the collapsed card JSX (lines 449–628) into `<CollapsedDocCard>` accepting props: `type`, `label`, `advisor`, `requires`, `doc`, `state`, `generating`, `isRunning`, `onExpand`, `onGenerate`.
  4. Optionally move utilities (`canGenerate`, `getPreview`, `formatDate`, `getCardState`, `DOC_CONFIG`) to a sibling `foundation-utils.ts` if components are extracted to separate files.
  5. No changes to API calls, state management, or route structure.
- **Risk Assessment:** UI-only refactor. No API shape changes. No auth logic. No routing impact. Existing tests (`foundation-agent`, `foundation-db`, `foundation-tools`, `foundation-types`) are all backend tests — none will break. No component tests exist for `page.tsx` to update.
- **Files Affected:** `src/app/analyses/[id]/foundation/page.tsx` (primary); optionally new sibling files `FoundationIcons.tsx`, `ExpandedDocCard.tsx`, `CollapsedDocCard.tsx`, `foundation-utils.ts`.
- **Estimated Scope:** Medium — ~60–80 lines of prop interface declarations plus moving existing JSX into component functions. No new logic written. The page component itself should shrink to ~100–120 lines.
