# KB-097: console.error calls in API routes missing module prefix

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/app/api/ideas/route.ts:17`, `src/app/api/content/[ideaId]/route.ts:52`, `src/app/api/foundation/[ideaId]/route.ts:69`
- **Observed:** Over 40 `console.error` calls across 20+ API route files lack a `[module-name]` prefix (e.g., `console.error('Error getting ideas:', error)` instead of `console.error('[ideas]', 'Error getting ideas:', error)`). KB-022 addressed this in lib files, but the convention was never applied to route files. In Vercel production logs, unprefixed errors from route handlers are indistinguishable from each other.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** MEDIUM
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** CONFIRM
- **Evidence:**
  - `src/app/api/ideas/route.ts:17` — `console.error('Error getting ideas:', error)` — no prefix
  - `src/app/api/ideas/route.ts:57` — `console.error('Error saving idea:', error)` — no prefix
  - `src/app/api/ideas/route.ts:92` — `console.error('Error updating idea:', error)` — no prefix
  - `src/app/api/ideas/route.ts:119` — `console.error('Error deleting idea:', error)` — no prefix
  - `src/app/api/content/[ideaId]/route.ts:52` — `console.error('Content calendar generation failed:', error)` — no prefix
  - `src/app/api/content/[ideaId]/route.ts:83` — `console.error('Failed to get content calendar:', error)` — no prefix
  - `src/app/api/content/[ideaId]/route.ts:128` — `console.error('Failed to update calendar target:', error)` — no prefix
  - `src/app/api/foundation/[ideaId]/route.ts:69` — `console.error('Foundation generation failed:', error)` — no prefix
  - `src/app/api/foundation/[ideaId]/route.ts:101` — `console.error('Error getting foundation data:', error)` — no prefix
  - `src/app/api/foundation/[ideaId]/route.ts:142` — `console.error('Error saving foundation doc:', error)` — no prefix
  - `src/app/api/content-pipeline/[ideaId]/route.ts:89` — `console.error('Content critique pipeline failed:', error)` — no prefix
  - Full grep confirms: 52 total `console.error` calls across 27 route files. Only 3 already use the `[prefix]` convention: `cron/analytics/route.ts:15`, `validation/backfill/route.ts:46`, `painted-door/[id]/chat/route.ts:223`
  - The existing `console.log` calls in route files that have any logging ALL use bracketed prefixes: `[foundation]` (foundation route lines 42, 66), `[analyze]` (analyze route line 73), `[content]` (content generate route line 49), `[content-pipeline]` (content-pipeline route line 85). Zero unprefixed `console.log` calls exist in routes.
  - This is the same split as KB-022: happy-path `console.log` got the prefix treatment; catch-block `console.error` was never updated.
- **Root Cause:** Identical to KB-022. The `[module]` prefix convention was applied to `console.log` progress calls when routes were written or last touched, but `console.error` in catch blocks was either written earlier or never revisited. The 3 files that do have prefixed errors (`cron/analytics`, `validation/backfill`, `painted-door/chat`) are newer/more recently edited routes — confirming this is accidental historical drift, not intentional inconsistency.
- **Risk Assessment:** Pure string-literal change to log messages. No behavioral change, no API response shape change, no type changes. No test files assert on these log strings. The only risk is getting the prefix wrong for a given module — mitigated by deriving each prefix from the existing `console.log` calls in the same file. Zero test or build risk.
- **Validated Fix:** For each route file, derive the correct `[module]` prefix from the existing `console.log` calls in that file (or from the URL segment if no `console.log` exists). Then update every unprefixed `console.error` in a catch block to prepend that prefix as the first argument. The KB item's example format `console.error('[ideas]', 'Error getting ideas:', error)` is correct — pass the prefix as a separate string argument (matching how the lib files do it after KB-022).

  Priority order — files with the most calls first:
  1. `src/app/api/ideas/route.ts` (4 calls) → prefix `[ideas]`
  2. `src/app/api/painted-door/[id]/route.ts` (4 calls) → prefix `[painted-door]`
  3. `src/app/api/analyze/[id]/route.ts` (3 calls) → prefix `[analyze]`
  4. `src/app/api/content/[ideaId]/route.ts` (3 calls) → prefix `[content]`
  5. `src/app/api/content/[ideaId]/generate/route.ts` (3 calls) → prefix `[content]`
  6. `src/app/api/content/[ideaId]/pieces/[pieceId]/route.ts` (3 calls) → prefix `[content/pieces]`
  7. `src/app/api/foundation/[ideaId]/route.ts` (3 calls) → prefix `[foundation]`
  8. `src/app/api/foundation/[ideaId]/chat/route.ts` (2 calls) → prefix `[foundation/chat]`
  9. `src/app/api/gsc/[ideaId]/route.ts` (2 calls) → prefix `[gsc]`
  10. `src/app/api/gsc/[ideaId]/link/route.ts` (2 calls) → prefix `[gsc/link]`
  11. `src/app/api/project/[id]/route.ts` (2 calls) → prefix `[project]`
  12. `src/app/api/publish-targets/route.ts` (2 calls) → prefix `[publish-targets]`
  13. `src/app/api/validation/[ideaId]/status/route.ts` (2 calls) → prefix `[validation/status]`
  14. `src/app/api/cron/publish/route.ts` (2 calls) → prefix `[cron/publish]`
  15. `src/app/api/content-pipeline/[ideaId]/route.ts` (2 calls) → prefix `[content-pipeline]`
  16. Remaining 12 files with 1 call each → derive prefix from URL segment

  Note: The KB item count of "40+ calls across 20+ files" is accurate — verified as 52 calls across 27 files (some of which are test files with 0 calls; the 52 are across the production route files).
- **Files Affected:** All 27 `src/app/api/**/route.ts` files containing `console.error` (excluding the 3 already prefixed). Approximately 24 files, ~49 single-line string edits.
- **Estimated Scope:** Small-to-medium — 49 single-line string edits across 24 files, no logic changes. Mechanical work; can be done file-by-file.
