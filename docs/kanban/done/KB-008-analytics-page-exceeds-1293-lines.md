# KB-008: Split analytics page exceeding 1293 lines

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/app/analyses/[id]/analytics/page.tsx:1-1293`
- **Observed:** The analytics page is 1293 lines long, combining data fetching, state management, chart rendering, comparison logic, checklist management, and multiple inline sub-components (SummaryCard, ChecklistItem, etc.) in a single file. A new contributor has no clear entry point.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** CONFIRM
- **Evidence:** File is exactly 1293 lines. It contains five inline component definitions that each have their own state, effects, and interaction logic: `SummaryCard` (lines 109-120), `ChecklistItem` (lines 122-180), `PropertySelectorWithHelper` (lines 182-426, includes its own `CopyButton` sub-component and clipboard fallback logic), `GSCSetupChecklist` (lines 428-603), and `WeeklySummaryCard` (lines 605-652). It also contains two pure logic functions unrelated to rendering: `buildComparisons` (lines 40-85) and `computeSummary` (lines 87-107). The main page component begins at line 654.
- **Root Cause:** Accidental accumulation. The GSC onboarding UI and checklist were added incrementally as the feature evolved. Each addition followed the path of least resistance — inline in the same file — rather than being extracted to `src/components/`.
- **Risk Assessment:** Low. All inline components communicate exclusively through props; none share closure state with the page. Extraction requires adding import statements and removing inline definitions. No API response shapes are affected. No page-level tests exist for this file (`src/lib/__tests__/analytics-agent.test.ts` tests the analytics agent lib, not the UI). The `GSCProperty` interface (currently inline at line 34) is a two-field type that will need to be co-located with the extracted component or moved to `@/types`.
- **Validated Fix:**
  1. Extract `ChecklistItem` to `src/components/ChecklistItem.tsx` — it is generic and has no page-specific dependencies.
  2. Extract `PropertySelectorWithHelper` to `src/components/PropertySelectorWithHelper.tsx` — move its internal `CopyButton` with it. Move or inline the `GSCProperty` interface.
  3. Extract `GSCSetupChecklist` to `src/components/GSCSetupChecklist.tsx` — it depends on `ChecklistItem`, so import from step 1.
  4. Extract `SummaryCard` to `src/components/SummaryCard.tsx` — stateless, trivial.
  5. Extract `WeeklySummaryCard` to `src/components/WeeklySummaryCard.tsx` — stateless, trivial.
  6. Optionally extract `buildComparisons` + `computeSummary` to `src/lib/gsc/analytics-utils.ts` — these are pure functions with no React dependencies.
  7. Update `src/app/analyses/[id]/analytics/page.tsx` to import all extracted components and remove the inline definitions.
- **Files Affected:** `src/app/analyses/[id]/analytics/page.tsx` (modified); `src/components/ChecklistItem.tsx` (new); `src/components/PropertySelectorWithHelper.tsx` (new); `src/components/GSCSetupChecklist.tsx` (new); `src/components/SummaryCard.tsx` (new); `src/components/WeeklySummaryCard.tsx` (new); optionally `src/lib/gsc/analytics-utils.ts` (new).
- **Estimated Scope:** Medium — ~480 lines of component code move to new files, ~50 lines of new import/export boilerplate. No logic changes. Page shrinks from 1293 to approximately 500 lines.
