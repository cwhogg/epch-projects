# KB-091: analysis/page.tsx duplicates getBadgeClass, getConfidenceStyle, and ScoreRing

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/app/analysis/page.tsx:29-111`
- **Observed:** `src/app/analysis/page.tsx` defines local copies of `getBadgeClass` (lines 29-40), `getConfidenceStyle` (lines 42-53), and a full `ScoreRing` component (lines 55-111) that are identical to what already exists in `src/lib/analysis-styles.ts` and `src/components/ScoreRing.tsx`. These utilities are imported from their canonical locations by `src/app/page.tsx`, `src/app/project/[id]/page.tsx`, `src/app/project/[id]/analysis/page.tsx`, and others — analysis/page.tsx is the only file that re-implements them locally.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** MEDIUM
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** REVISE
- **Evidence:**
  - `getBadgeClass` at `src/app/analysis/page.tsx:29-40` is character-for-character identical to the canonical export at `src/lib/analysis-styles.ts:3-9`.
  - `getConfidenceStyle` at `src/app/analysis/page.tsx:42-53` is character-for-character identical to the canonical export at `src/lib/analysis-styles.ts:12-18`.
  - `ScoreRing` at `src/app/analysis/page.tsx:55-111` shares the same core logic as `src/components/ScoreRing.tsx:1-60` but has meaningful visual differences: default `size` is 48 vs. 72, `strokeWidth` is 4 vs. 5, glow opacity is `40` vs. `50`, hover CSS differs (outer `hover:scale-110` vs. inner `group-hover:scale-105`), label span styling differs, and `fontSize` multiplier is `0.32` vs. `0.35`.
  - All four `ScoreRing` call sites in `analysis/page.tsx` (lines 329-332) pass no explicit `size` prop, relying on the local default of 48.
- **Root Cause:** Accidental drift. `analysis/page.tsx` was written before or in isolation from the canonical extractions. Every other page in the project already imports from the canonical locations.
- **Risk Assessment:**
  - `getBadgeClass` and `getConfidenceStyle`: zero risk. Drop-in replacements.
  - `ScoreRing`: switching to the canonical import without explicit `size={48}` will visually regress all four rings from 48px to 72px. Additionally, stroke width (4 vs 5), glow, hover, and font-size multiplier differences will produce minor but observable visual changes. These are acceptable given the maintainability gain, but must be called out so the executor can assess.
  - No test files cover `src/app/analysis/page.tsx` directly. `ScoreRing.test.tsx` tests the canonical component; no test risk.
- **Validated Fix:**
  1. Delete the local `getBadgeClass` function (lines 29-40).
  2. Delete the local `getConfidenceStyle` function (lines 42-53).
  3. Delete the local `ScoreRing` function (lines 55-111).
  4. Add import: `import { getBadgeClass, getConfidenceStyle } from '@/lib/analysis-styles';`
  5. Add import: `import ScoreRing from '@/components/ScoreRing';`
  6. At all four `ScoreRing` call sites (lines 329-332 in the original), add `size={48}` to preserve the current rendered size.
  7. Note: the executor should decide whether to also pass `strokeWidth={4}` or similar props if pixel-perfect fidelity is required — or accept the minor visual delta and leave the canonical defaults. Currently `ScoreRing.tsx` does not accept a `strokeWidth` prop, so full fidelity would require adding one.
- **Files Affected:**
  - `src/app/analysis/page.tsx` (deletions + import additions + 4x `size={48}` props)
  - `src/components/ScoreRing.tsx` (optional: add `strokeWidth` prop if exact fidelity is required)
- **Estimated Scope:** Small — ~80 lines deleted, 2 import lines added, 4 prop additions. Optional: +5 lines to `ScoreRing.tsx` if `strokeWidth` is parameterized.
