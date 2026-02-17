# KB-020: Split analyses/[id]/content/page.tsx exceeding 512 lines

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/app/analyses/[id]/content/page.tsx:1-512`
- **Observed:** The content page is 512 lines combining calendar display, piece management, append mode, target site selection, and rejection workflows in a single component. Each functional area (calendar header, piece list, append flow) is large enough to extract as a sub-component.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** REVISE
- **Evidence:** File confirmed at exactly 512 lines (`src/app/analyses/[id]/content/page.tsx:1-512`). Contains 15 state variables (lines 14–26, 153), 8 async/event handler functions (lines 28–261), and 3 distinct render paths. The KB description is accurate — append mode (lines 111–133, 406–439), rejection (lines 135–151), piece reordering (lines 221–261), and publish-next (lines 63–87) are all present.
- **Root Cause:** Feature accretion — each feature (append mode, rejection, reordering, publish-next) was added incrementally. The file grew to threshold without a periodic extraction pass.
- **Risk Assessment:** UI-only refactor. No API response shapes affected. No other files import this page. No tests exist for this file currently. No auth/security logic present. Risk is low.
- **Validated Fix:** The KB framing (sub-component extraction only) is insufficient. The highest-value fix is hook-first:
  1. Extract a `useContentCalendar(analysisId)` custom hook into `src/hooks/useContentCalendar.ts`. Move all state (lines 14–26, 153) and all handler functions (lines 28–261) into the hook. The hook returns the full state/handler surface. This alone drops the page file to roughly 250 lines.
  2. Extract `AppendFeedbackInput` component (lines 406–439) to `src/components/AppendFeedbackInput.tsx`. Props: `feedbackText`, `onChange`, `onAppend`, `onCancel`, `appending`. Pure UI, parent owns state.
  3. Optionally extract the generating/error empty state (lines 278–337) to `src/components/ContentGeneratingState.tsx`. Props: `generating`, `error`, `onRetry`. This removes another ~60 lines.
  - Do NOT split by "calendar header / piece list" as the KB suggests — those regions share too many state variables to extract cleanly as sub-components without either prop drilling or a context, adding more complexity than they remove.
- **Files Affected:**
  - `src/app/analyses/[id]/content/page.tsx` (shrinks from 512 to ~200 lines)
  - `src/hooks/useContentCalendar.ts` (new — ~200 lines)
  - `src/components/AppendFeedbackInput.tsx` (new — ~35 lines)
  - `src/components/ContentGeneratingState.tsx` (new, optional — ~60 lines)
- **Estimated Scope:** Medium — ~3–4 new/modified files, no logic changes, pure extraction. The hook extraction is the critical step; the component extractions are additive.
