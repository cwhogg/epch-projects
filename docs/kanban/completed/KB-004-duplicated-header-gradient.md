# KB-004: Extract duplicated header gradient function

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/analyses/[id]/analysis/page.tsx:66-73`, `src/app/analyses/[id]/page.tsx:192-199`
- **Observed:** getHeaderGradient() appears identically in both files. Same gradient logic duplicated across two files makes consistent styling updates difficult.
- **Expected:** Extract to a shared utility and import in both pages.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** CONFIRM
- **Evidence:** The function body is byte-for-byte identical in both files. `src/app/analyses/[id]/analysis/page.tsx:66-73` and `src/app/analyses/[id]/page.tsx:192-199` both define:
  ```ts
  const getHeaderGradient = () => {
    switch (analysis.recommendation) {
      case 'Tier 1': return 'radial-gradient(ellipse at top left, rgba(52, 211, 153, 0.1) 0%, transparent 50%)';
      case 'Tier 2': return 'radial-gradient(ellipse at top left, rgba(251, 191, 36, 0.08) 0%, transparent 50%)';
      case 'Tier 3': return 'radial-gradient(ellipse at top left, rgba(248, 113, 113, 0.08) 0%, transparent 50%)';
      default: return 'none';
    }
  };
  ```
  Both are inline closures that close over `analysis.recommendation`. No variation between sites. Confirmed only two files in the codebase contain this function.
- **Root Cause:** The analysis detail page (`/analysis`) was created after the project dashboard page (`/[id]`) and the gradient logic was copied without extracting it to a shared location. Both pages are co-located under `src/app/analyses/[id]/`, so no natural shared utility directory was close at hand.
- **Risk Assessment:** Low. The function is pure — it takes no arguments beyond the closed-over `analysis.recommendation` and returns a CSS string. There are no tests to break. Extracting it as a standalone function that accepts `recommendation: string` and returns `string` does not change any API or response shapes. The only call sites are the two `style={{ background: getHeaderGradient() }}` expressions — both will be mechanically updated to pass `analysis.recommendation` as a parameter. No callers outside these two files exist.
- **Validated Fix:**
  1. Create `src/app/analyses/[id]/utils.ts` (or `src/lib/analysisStyles.ts` if re-use outside `[id]/` is anticipated) and export:
     ```ts
     export function getHeaderGradient(recommendation: string): string {
       switch (recommendation) {
         case 'Tier 1': return 'radial-gradient(ellipse at top left, rgba(52, 211, 153, 0.1) 0%, transparent 50%)';
         case 'Tier 2': return 'radial-gradient(ellipse at top left, rgba(251, 191, 36, 0.08) 0%, transparent 50%)';
         case 'Tier 3': return 'radial-gradient(ellipse at top left, rgba(248, 113, 113, 0.08) 0%, transparent 50%)';
         default: return 'none';
       }
     }
     ```
  2. In `src/app/analyses/[id]/analysis/page.tsx`: remove lines 66-73, import `getHeaderGradient`, and update the call site to `getHeaderGradient(analysis.recommendation)`.
  3. In `src/app/analyses/[id]/page.tsx`: remove lines 192-199, import `getHeaderGradient`, and update the call site to `getHeaderGradient(analysis.recommendation)`.
  4. Note: `getBadgeClass` and `getConfidenceStyle` are also duplicated across both files — those are candidates for the same shared module but are out of scope for this item.
- **Files Affected:**
  - `src/app/analyses/[id]/analysis/page.tsx`
  - `src/app/analyses/[id]/page.tsx`
  - `src/app/analyses/[id]/utils.ts` (new file)
- **Estimated Scope:** Small — ~10 lines added (new utility), ~8 lines removed across two files, 2 import statements added.
