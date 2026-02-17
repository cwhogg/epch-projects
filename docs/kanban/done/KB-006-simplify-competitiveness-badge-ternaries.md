# KB-006: Simplify nested ternaries in competitiveness badge

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/components/SEODeepDive.tsx:148-164`
- **Observed:** Lines 148-164 contain 3-level nested ternaries for badge background and color based on competitiveness level. The logic is duplicated (once for background, once for color) and hard to scan.
- **Expected:** Replace with a lookup function or object map for clearer, non-duplicated styling.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** CONFIRM
- **Evidence:** `src/components/SEODeepDive.tsx:148-164` — two parallel ternary chains (lines 149-154 for `background`, lines 155-160 for `color`) both evaluate `kw.estimatedCompetitiveness` across the same three branches (`'Low'`, `'Medium'`, fallthrough). The field is typed `string?` (`src/types/index.ts:145`). Pattern exists only in this one file — grep confirms no other component renders this badge.
- **Root Cause:** Inline style written once during first-pass JSX implementation and never extracted. Accidental accumulation, not intentional design.
- **Risk Assessment:** Low. The change is purely structural — identical DOM output, no API surface, no shared dependencies, no tests to break. The only risk is an off-by-one on the fallback value for unexpected strings, which is handled by nullish coalescing.
- **Validated Fix:**
  1. Add a `competitivenessStyles` lookup object just above the JSX return (or inline as a `const` above the `<span>`):
     ```ts
     const competitivenessStyles: Record<string, { background: string; color: string }> = {
       Low:    { background: 'rgba(52, 211, 153, 0.1)',  color: 'var(--accent-emerald)' },
       Medium: { background: 'rgba(251, 191, 36, 0.1)',  color: 'var(--accent-amber)' },
       High:   { background: 'rgba(248, 113, 113, 0.1)', color: 'var(--color-danger)' },
     };
     ```
  2. Replace the `style={{ background: ..., color: ... }}` ternary block (lines 148-161) with:
     ```tsx
     style={competitivenessStyles[kw.estimatedCompetitiveness ?? ''] ?? competitivenessStyles.High}
     ```
  3. No other files need changes. No imports needed.
- **Files Affected:** `src/components/SEODeepDive.tsx`
- **Estimated Scope:** Small — removes ~10 lines of ternary chains, adds ~6 lines of lookup object. Net line reduction.
