# KB-003: Extract duplicated badge/confidence styling functions

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/analyses/[id]/analysis/page.tsx:18-34`, `src/app/analyses/[id]/page.tsx:46-62`, `src/app/page.tsx:18-25`
- **Observed:** getBadgeClass() and getConfidenceStyle() appear identically in 3 separate page files. This violates DRY and creates maintenance burden when styling rules change.
- **Expected:** Extract to a shared utility module (e.g., src/lib/style-utils.ts) and import in all three pages.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** CONFIRM
- **Evidence:**
  - `getBadgeClass` is present and identical in all three files: `src/app/analyses/[id]/analysis/page.tsx:18-25`, `src/app/analyses/[id]/page.tsx:46-53`, `src/app/page.tsx:18-25`.
  - `getConfidenceStyle` is present and identical in two of the three files: `src/app/analyses/[id]/analysis/page.tsx:27-34`, `src/app/analyses/[id]/page.tsx:55-62`. It does NOT appear in `src/app/page.tsx` — the KB description overstated the duplication scope for this function.
  - All copies are character-for-character identical. No per-site variation.
- **Root Cause:** Copy-paste growth pattern as new pages were added. Each page needing `recommendation`/`confidence` rendering re-declared the functions locally rather than extracting a shared utility. Not intentional design.
- **Risk Assessment:** Low. These are pure functions with no module dependencies. No tests reference them. No other files import from these page files. No API shapes affected. Fix is smaller than the problem.
- **Validated Fix:**
  1. Create `src/lib/analysis-styles.ts` (preferred over the generic `style-utils.ts` — these functions are domain-specific to the `Analysis` type) and export both functions.
  2. In `src/app/analyses/[id]/analysis/page.tsx`: remove lines 18-34 (both function definitions), add `import { getBadgeClass, getConfidenceStyle } from '@/lib/analysis-styles';`.
  3. In `src/app/analyses/[id]/page.tsx`: remove lines 46-62 (both function definitions), add `import { getBadgeClass, getConfidenceStyle } from '@/lib/analysis-styles';`.
  4. In `src/app/page.tsx`: remove lines 18-25 (`getBadgeClass` definition only), add `import { getBadgeClass } from '@/lib/analysis-styles';`.
  5. Run `npm run build` to confirm no breakage.
- **Files Affected:**
  - `src/lib/analysis-styles.ts` (new file, ~20 lines)
  - `src/app/analyses/[id]/analysis/page.tsx` (remove 17 lines, add 1 import)
  - `src/app/analyses/[id]/page.tsx` (remove 17 lines, add 1 import)
  - `src/app/page.tsx` (remove 8 lines, add 1 import)
- **Estimated Scope:** Small — net reduction of ~40 lines across 3 files, 1 new file of ~20 lines.
