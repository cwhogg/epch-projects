# KB-055: Sequential Redis fetches in getAllFoundationDocs and getAllAssumptions

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/db.ts:328-387`
- **Observed:** `getAllFoundationDocs` and `getAllAssumptions` both iterate over their type arrays with sequential `await` calls in a for loop — 6 round-trips for foundation docs and 5 round-trips for assumptions. Both could use `Promise.all` to fetch in parallel, which would cut latency by up to 5-6x on each call. The `deleteAllFoundationDocs` and `deleteCanvasData` functions have the same pattern.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** MEDIUM
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:**
  - `src/lib/db.ts:328-335` — `getAllFoundationDocs` uses sequential `await getFoundationDoc(...)` in a for loop over 6 types (`FOUNDATION_DOC_TYPES`: strategy, positioning, brand-voice, design-principles, seo-strategy, social-media-strategy). Each is an independent Redis GET.
  - `src/lib/db.ts:381-388` — `getAllAssumptions` uses sequential `await getAssumption(...)` in a for loop over 5 types (`ASSUMPTION_TYPES`: demand, reachability, engagement, wtp, differentiation). Each is an independent Redis GET.
  - `src/lib/db.ts:341-345` — `deleteAllFoundationDocs` sequentially `del`s 6 independent keys.
  - `src/lib/db.ts:416-424` — `deleteCanvasData` sequentially `del`s 16 keys (1 canvas + 3 per assumption type × 5 types) in a nested for loop.
  - No data dependency exists between any of these individual key reads or deletes within each function.
- **Root Cause:** Default sequential async pattern — first-pass implementation using `for...of` with `await`. Not intentional; no ordering constraint exists between the independent keys. The project does use `Promise.all` at higher call sites (e.g., `src/app/project/[id]/page.tsx:81`), but that does not eliminate the sequential fetches inside these functions.
- **Risk Assessment:**
  - No API response shape changes — all function signatures and return types are unchanged.
  - Upstash REST-based Redis handles concurrent calls as independent HTTP requests — no connection pool risk.
  - `Promise.all` rejects on first failure, same behavior as the current sequential `await` (which also throws and stops on first failure).
  - Existing mock-based tests do not assert call ordering, only call counts and return values — no test rewrites required. `src/lib/__tests__/validation-canvas-db.test.ts:214` (deleteCanvasData) should be spot-checked to confirm mock call count assertions still hold.
  - No auth or security logic touched.
- **Validated Fix:**
  1. Replace `getAllFoundationDocs` for loop with `Promise.all` over `FOUNDATION_DOC_TYPES.map(...)`, then build result object from settled results filtering nulls.
  2. Replace `getAllAssumptions` for loop with `Promise.all` over `ASSUMPTION_TYPES.map(...)`, same pattern.
  3. Replace `deleteAllFoundationDocs` for loop with `Promise.all(FOUNDATION_DOC_TYPES.map(docType => getRedis().del(...)))`.
  4. Replace `deleteCanvasData` nested sequential dels with a single `Promise.all` that includes the canvas key and all 15 assumption-related keys via `ASSUMPTION_TYPES.flatMap(...)`.
  - No prerequisite changes. No utility changes. No new dependencies.
- **Files Affected:**
  - `src/lib/db.ts` (lines 328-335, 341-345, 381-388, 416-424)
- **Estimated Scope:** Small — 4 function bodies changed, each a straightforward for-loop to Promise.all conversion. ~20 lines modified total.
