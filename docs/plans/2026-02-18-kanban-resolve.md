# Kanban Board Resolution Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Resolve 20 Kanban board items (15 actionable, 3 skipped, 1 already resolved, 0 failed)
**Source Design Doc:** N/A
**Architecture:** Mechanical refactoring — no architectural changes
**Tech Stack:** Next.js 16 / React 19 / TypeScript / Tailwind CSS 4 / Vitest

---

## Execution Strategy

14 tasks split into two Ralph loop sessions of 7 tasks each.

**Phase 1 — Tasks 1-7:** Small code fixes, eval changes, and architecture doc update. All tasks touch distinct files with no ordering dependencies.

**Phase 2 — Tasks 8-14:** Component extractions, doc updates, and bulk edits. **Ordering constraint:** Task 12 must complete before Task 14 — both modify `painted-door/[id]/chat/route.ts`.

---

## Skipped Items

| KB | Title | Reason |
|----|-------|--------|
| KB-090 | types/index.ts monolithic 567 lines | Pure type declarations with no logic; 101 consumers would require import churn; section comments already provide navigation; intentional centralized registry design |
| KB-092 | research-tools exceeds 400 lines | Closure-scoped state is the architectural mechanism for agent sequencing; peer files routinely exceed 400 lines; splitting adds indirection without removing complexity |
| KB-095 | evaluateAssumptions stub with dead setup | Intentional architectural stub with documented TODO; guard clauses are load-bearing for future implementation; tests correctly validate current stub behavior |

## Already Resolved

| KB | Title | Reason |
|----|-------|--------|
| KB-086 | redundant type guard in text extraction | The current inline narrowing pattern in `eval-runner.ts` is already the correct solution. A `TextBlock` type predicate cannot be used because the SDK's `TextBlock` type requires a `citations` field that breaks TS narrowing on the `ContentBlock` union (see `docs/lessons-learned/2026-02-18-build-catches-type-errors-tests-miss.md`). |

---

### Task 1: Fix sort comparator contract violation

**KBs:** KB-078

**Files:**
- Modify: `src/lib/research-agent-prompts.ts`

**Step 1:** In `src/lib/research-agent-prompts.ts` line 16, replace:
```ts
.sort((a, b) => (a.type === 'strategy' ? -1 : 1));
```
with:
```ts
.sort((a, b) => (a.type === 'strategy' ? -1 : b.type === 'strategy' ? 1 : 0));
```
**Step 2:** Run `npm run build` to verify compilation
**Step 3:** Run `npm test` to verify no regressions
**Step 4:** Commit changes

---

### Task 2: Fix redundant reduces and hoisted Set in useWeeklyReport

**KBs:** KB-079, KB-080

**Files:**
- Modify: `src/hooks/useWeeklyReport.ts`

**Step 1:** At line 61, hoist the `ideaSlugs` Set construction above the `.filter()` call:
```ts
const ideaSlugs = new Set(ideaPieces.map((p) => p.slug));
const ideaAlerts = weeklyReport?.alerts.filter((a) => ideaSlugs.has(a.pieceSlug)) ?? [];
```

**Step 2:** Before line 67 (the `ideaSummary` ternary), add three named constants:
```ts
const totalClicks = ideaPieces.reduce((sum, p) => sum + p.current.clicks, 0);
const totalImpressions = ideaPieces.reduce((sum, p) => sum + p.current.impressions, 0);
const totalPosition = ideaPieces.reduce((sum, p) => sum + p.current.position, 0);
```
Then rewrite the object literal to reference these locals instead of inline reduces for `totalClicks`, `totalImpressions`, `totalPosition`, and `averageCtr`.

**Step 3:** Run `npm run build` to verify compilation
**Step 4:** Run `npm test` to verify no regressions
**Step 5:** Commit changes

---

### Task 3: Merge duplicate switch cases in getTimestampUpdate

**KBs:** KB-081

**Files:**
- Modify: `src/app/api/validation/[ideaId]/status/route.ts`

**Step 1:** Replace the duplicate `invalidated`/`pivoted` cases (lines 16-19) with a fallthrough:
```ts
case 'invalidated':
case 'pivoted':
  return { invalidatedAt: now, validatedAt: undefined };
```
**Step 2:** Run `npm run build` to verify compilation
**Step 3:** Run `npm test` to verify no regressions
**Step 4:** Commit changes

---

### Task 4: Extract hexToLuminance and contrastRatio to module level

**KBs:** KB-082

**Files:**
- Modify: `src/lib/agent-tools/website.ts`
- Modify or create: `src/lib/__tests__/website-validators.test.ts`

**Step 1:** Move `hexToLuminance` and `contrastRatio` from inside the `evaluate_brand` execute callback (~lines 468-483) to module-level functions near the other validation helpers (after the `ValidationResult` type around line 25). Add the `export` keyword to both functions so they can be imported by tests.

**Step 2:** Verify the call site at ~line 486 still resolves correctly (same identifier name).

**Step 3:** Add tests to `src/lib/__tests__/website-validators.test.ts`:
- `hexToLuminance('#ffffff')` → approximately 1.0
- `hexToLuminance('#000000')` → approximately 0.0
- `contrastRatio` with white/black → 21.0
- `contrastRatio` with a WCAG AA pass pair (>= 4.5)
- `contrastRatio` with a fail pair (< 4.5)

**Step 4:** Run `npm run build` to verify compilation
**Step 5:** Run `npm test` to verify no regressions
**Step 6:** Commit changes

---

### Task 5: Rename inverted threshold field names in eval config

**KBs:** KB-083

**Files:**
- Modify: `e2e/eval-config.ts`
- Modify: `e2e/dimensions/output-length.ts`
- Modify: `e2e/dimensions/__tests__/output-length.test.ts`

**Step 1:** In `e2e/dimensions/output-length.ts`, update the `Thresholds` interface: rename `max` → `warnAt`, `warn` → `failAt`.

**Step 2:** In `e2e/dimensions/output-length.ts` lines 19-22, update all references: `limits.max` → `limits.warnAt`, `limits.warn` → `limits.failAt`. Fix the detail strings to use correct labels ("warn threshold" for `warnAt`, "fail threshold" for `failAt`).

**Step 3:** In `e2e/eval-config.ts` lines 13-16, rename all `max` keys to `warnAt` and all `warn` keys to `failAt`.

**Step 4:** In `e2e/dimensions/__tests__/output-length.test.ts` line 29, update the inline override from `{ words: { max: 10, warn: 20 } }` to `{ words: { warnAt: 10, failAt: 20 } }` (note the nested `words` key).

**Step 5:** Run `npm run build` to verify compilation
**Step 6:** Run `npm test` to verify no regressions
**Step 7:** Commit changes

---

### Task 6: Clean up eval-runner ternaries and compressed statements

**KBs:** KB-084, KB-085 (KB-086 already resolved — see "Already Resolved" section above)

**Files:**
- Modify: `e2e/eval-runner.ts`

**Step 1 (KB-085):** Split the four compressed multi-statement lines (around lines 33, 36, 39, 43) into separate lines — one assignment per line.

**Step 2 (KB-084):** Replace the three nested ternaries:
- Line ~64: status label → record lookup `({ pass: 'PASS', warn: 'WARN', fail: 'FAIL' } as const)[result.result]`
- Lines ~136-137: overall result → if/else chain
- Line ~145: judge score bucketing → if/else chain

**Step 3:** Run `npm run build` to verify compilation
**Step 4:** Run `npm test` to verify no regressions
**Step 5:** Commit changes

---

### Task 7: Update architecture.md with missing framework and module

**KBs:** KB-087

**Files:**
- Modify: `docs/architecture.md`

**Step 1:** At line ~273 in the Mermaid diagram, update framework count from 4 to 5 and add `smallest-viable-audience` to the list.

**Step 2:** At line ~773 in the Core Library table, update from "4 prompt sets" to "5 prompt sets" and add `smallest-viable-audience`.

**Step 3:** At line ~158 in the Support Modules subgraph, add a new node for `parse-advisor-segments`.

**Step 4:** In the Core Library table (after ~line 786), add a row for `src/lib/parse-advisor-segments.ts`.

**Step 5:** Run `npm run build` to verify compilation
**Step 6:** Run `npm test` to verify no regressions
**Step 7:** Commit changes

---

### Task 8: Extract shared ProgressStepList component

**KBs:** KB-088

**Files:**
- Create: `src/components/ProgressStepList.tsx`
- Create: `src/components/__tests__/ProgressStepList.test.tsx`
- Modify: `src/app/ideas/[id]/analyze/page.tsx`
- Modify: `src/app/content/[id]/generate/page.tsx`

**Step 1:** Create `src/components/ProgressStepList.tsx` with props:
- `steps: { name: string; status: 'pending' | 'running' | 'complete' | 'error'; detail?: string }[]`
- `showSubStepIndent?: boolean` (defaults false)
Use the generate page's error styling (red bg/border) as canonical. Support the `showSubStepIndent` prop for analyze's SEO sub-step behavior.

> **Behavior change:** The analyze page step list gains error-state background/border styling (`rgba(248, 113, 113, 0.1)` bg, `rgba(248, 113, 113, 0.3)` border) it does not currently have. This is intentional — the generate page's full error state is treated as canonical.

**Step 2:** Create `src/components/__tests__/ProgressStepList.test.tsx` covering: pending/running/complete/error icon rendering, sub-step indent behavior, detail text display, empty list.

**Step 3:** In `src/app/ideas/[id]/analyze/page.tsx`, replace lines ~231-303 with `<ProgressStepList steps={steps} showSubStepIndent />`.

**Step 4:** In `src/app/content/[id]/generate/page.tsx`, replace lines ~302-375 with `<ProgressStepList steps={steps} />`. **Important:** Preserve the existing `{!pipelineMode && (...)}` conditional wrapper — the step list only renders outside pipeline mode.

**Step 5:** Run `npm run build` to verify compilation
**Step 6:** Run `npm test` to verify no regressions
**Step 7:** Commit changes

---

### Task 9: Extract analytics utilities and PagePerformanceTable

**KBs:** KB-089

**Files:**
- Create: `src/lib/analytics-utils.ts`
- Create: `src/lib/__tests__/analytics-utils.test.ts`
- Create: `src/components/PagePerformanceTable.tsx`
- Modify: `src/app/project/[id]/analytics/page.tsx`

**Step 1:** Create `src/lib/analytics-utils.ts` with `buildComparisons` and `computeSummary` moved verbatim from the page (lines ~25-92).

**Step 2:** Create `src/lib/__tests__/analytics-utils.test.ts` covering:
- `buildComparisons`: matched keywords, unmatched keywords, unexpectedWinners sorting
- `computeSummary`: totalClicks, averageCtr, weighted averagePosition, topQuery

**Step 3:** Create `src/components/PagePerformanceTable.tsx`. Extract the `pageData` table block (lines ~341-425) into a component accepting `pageData: GSCQueryRow[]`.

**Step 4:** Update `src/app/project/[id]/analytics/page.tsx`: replace inline functions and table block with imports.

**Step 5:** Run `npm run build` to verify compilation
**Step 6:** Run `npm test` to verify no regressions
**Step 7:** Commit changes

---

### Task 10: Replace duplicated utilities in analysis page with canonical imports

**KBs:** KB-091

**Files:**
- Modify: `src/app/analysis/page.tsx`
- Optionally modify: `src/components/ScoreRing.tsx`

**Step 1:** Delete local `getBadgeClass` (lines ~29-40) and `getConfidenceStyle` (lines ~42-53) from the analysis page.

**Step 2:** Add imports: `import { getBadgeClass, getConfidenceStyle } from '@/lib/analysis-styles';`

**Step 3:** Delete local `ScoreRing` component (lines ~55-111).

**Step 4:** Add import: `import ScoreRing from '@/components/ScoreRing';`

**Step 5:** At all four `ScoreRing` call sites (originally ~lines 329-332), add `size={48}` to preserve current rendered size. The canonical component defaults to `size={72}`.

> **Cosmetic delta:** The canonical ScoreRing uses `strokeWidth=5` and `fontSize=size*0.35` vs. the local `strokeWidth=4` and `fontSize=size*0.32`. At `size={48}` the ring will be proportionally slightly heavier and the text slightly larger. This is an acceptable trade-off for using the canonical component.

**Step 6:** Run `npm run build` to verify compilation
**Step 7:** Run `npm test` to verify no regressions
**Step 8:** Commit changes

---

### Task 11: Update brand-identity-spec.md to match light-mode reality

**KBs:** KB-093

**Files:**
- Modify: `docs/design/brand-identity-spec.md`

**Step 1:** Read `src/app/globals.css` and `docs/design/design-principles.md` for current correct values.

**Step 2:** Update Design Philosophy section (~line 75-81): Remove dark-first framing, replace with warm white / light-only.

**Step 3:** Update Color blocks (~lines 83-129): Replace `:root` values with actual `globals.css` tokens. Remove the `@media (prefers-color-scheme: light)` override block entirely.

**Step 4:** Fix specific token values:
- `--accent-coral-soft`: `0.15` → `0.12`
- `--color-danger`: `#f87171` → `#ef4444`

**Step 5:** Update Nav glassmorphism (~line 409): Replace the dark-mode `:root` nav value `rgba(13, 13, 15, 0.85)` with the light-only value `rgba(250, 249, 247, 0.92)`. Then delete the entire `@media (prefers-color-scheme: light)` override block (~lines 415-418) — it is no longer needed in a light-only design.

**Step 6:** Remove or replace Texture section (~lines 469-483) with "No texture overlay."

**Step 7:** Update Anti-patterns (~line 490): prohibit cool foundation colors, not warm.

**Step 8:** Rewrite Claude Code Recreation Prompt (~lines 514-556): Replace dark-mode color values, remove noise texture, correct all token values.

**Step 9:** Run `npm run build` to verify compilation
**Step 10:** Run `npm test` to verify no regressions
**Step 11:** Commit changes

---

### Task 12: Decompose assembleSystemPrompt and parallelize fetches

**KBs:** KB-094

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/route.ts`

**Step 1:** Extract five private helper functions from `assembleSystemPrompt` (lines ~23-110):
- `fetchFoundationSection(ideaId: string): Promise<string>` — wraps `getAllFoundationDocs` + formatting (lines ~34-46)
- `fetchIdeaSection(ideaId: string): Promise<string>` — wraps `getIdeaFromDb` + `buildContentContext` + formatting (lines ~49-59)
- `fetchSiteSection(ideaId: string): Promise<string>` — wraps `getPaintedDoorSite` + conditional (lines ~62-66), returns empty string when no live site
- `buildModeInstruction(mode: BuildMode): string` — pure function, returns mode instruction block (lines ~69-75)
- `buildAdvisorRoster(): string` — pure function, returns advisor roster markdown (lines ~78-81)

**Step 2:** Rewrite `assembleSystemPrompt` to call `fetchFoundationSection`, `fetchIdeaSection`, and `fetchSiteSection` in parallel via `Promise.all`, then assemble the template string. Function shrinks from ~88 lines to ~30.

**Step 3:** Keep all five helpers unexported (module-private). No test changes needed — existing tests mock sub-dependencies and test as a black box.

**Step 4:** Run `npm run build` to verify compilation
**Step 5:** Run `npm test` to verify no regressions
**Step 6:** Commit changes

---

### Task 13: Replace raw Redis key with getActiveRunId abstraction

**KBs:** KB-096

**Files:**
- Modify: `src/app/api/content-pipeline/[ideaId]/route.ts`

**Step 1:** Add `getActiveRunId` to the import from `@/lib/agent-runtime` at the top of the file.

**Step 2:** Replace the raw Redis key lookup (lines ~121-123):
```ts
// Before
const runId = await redis.get<string>(
  `active_run:content-critique:${ideaId}`,
);

// After
const runId = await getActiveRunId('content-critique', ideaId);
```

**Step 3:** Keep the `import { getRedis } from '@/lib/redis'` at the top of the file — it is still needed for the `const redis = getRedis()` call inside the GET handler body that fetches `pipeline_progress:${runId}`.

**Step 4:** Run `npm run build` to verify compilation
**Step 5:** Run `npm test` to verify no regressions
**Step 6:** Commit changes

---

### Task 14: Add module prefix to console.error calls in API routes

**KBs:** KB-097

**Files:**
- Modify: ~27 route files in `src/app/api/` (~52 total `console.error` occurrences)

**Step 1:** For each route file, derive the correct `[module]` prefix from existing `console.log` calls in the same file (or from the URL path segment if no `console.log` exists).

**Step 2:** Update every unprefixed `console.error` to prepend the prefix as a separate first string argument. Match the KB-022 convention used in lib files. Note: `painted-door/[id]/chat` and `validation/backfill` are already fully prefixed. `cron/analytics` has one prefixed call (line ~15) but one unprefixed call (line ~21, `` `${source} analytics failed:` ``) — include it in scope.

Priority order by call count:
1. `src/app/api/ideas/route.ts` (4 calls) — prefix `[ideas]`
2. `src/app/api/painted-door/[id]/route.ts` (4 calls) — prefix `[painted-door]`
3. `src/app/api/analyze/[id]/route.ts` (3 calls) — prefix `[analyze]`
4. `src/app/api/content/[ideaId]/route.ts` (3 calls) — prefix `[content]`
5. `src/app/api/content/[ideaId]/generate/route.ts` (3 calls) — prefix `[content]`
6. `src/app/api/content/[ideaId]/pieces/[pieceId]/route.ts` (3 calls) — prefix `[content/pieces]`
7. `src/app/api/foundation/[ideaId]/route.ts` (3 calls) — prefix `[foundation]`
8. Remaining ~17 files with 1-2 calls each

**Step 3:** Run `npm run build` to verify compilation
**Step 4:** Run `npm test` to verify no regressions
**Step 5:** Commit changes

---

## Decision Log

### Summary
| # | Decision | Choice Made | Alternatives Considered |
|---|----------|-------------|------------------------|
| 1 | Group KB-079 + KB-080 | Combined into Task 2 — both modify `useWeeklyReport.ts` | Keep separate (unnecessary — same file, no ordering dependency) |
| 2 | Group KB-084 + KB-085 | Combined into Task 6 — both modify `e2e/eval-runner.ts`. KB-086 removed (already resolved — see lessons-learned) | Keep separate (unnecessary — same file, changes are independent) |
| 3 | Keep KB-087 and KB-093 separate | Different files, different content types (architecture diagram vs design spec) | Group as "doc staleness" (rejected — changes are structurally different) |
| 4 | Task ordering | Tasks 1-6 (code fixes) before Tasks 7-11 (UI/doc changes), then Tasks 12-14 (late additions) | Interleave by KB number (rejected — grouping by change type is more efficient) |
| 5 | KB-094 kept separate | Unique decomposition of a god function — no other item shares this fix pattern | Group with code fixes (rejected — structurally different from small fixes) |
| 6 | KB-097 kept separate | Bulk string edits across ~27 files — mechanical but wide scope | Split into multiple tasks (rejected — identical fix pattern, efficient as single pass) |
| 7 | Two-phase execution | Split 14 tasks into Phase 1 (1-7) and Phase 2 (8-14) for two Ralph loop sessions | Single session (rejected — 14 tasks exceeds 10-task context window limit; two sessions of 7 prevent quality drift) |
| 8 | KB-086 removed from scope | Current inline narrowing is already the correct solution; TextBlock type predicate approach breaks the build | Keep in plan (rejected — lessons-learned documents this exact failure pattern) |

### Appendix: Decision Details

**Grouping rationale:** KB-079 and KB-080 both fix performance issues in `useWeeklyReport.ts` — the changes are adjacent lines in the same function. KB-084 and KB-085 both clean up `eval-runner.ts` — two independent improvements to the same file that can be applied in a single editing pass. KB-086 was removed from Task 6 after critique revealed that the proposed TextBlock type predicate approach would break the build (documented in lessons-learned).

**File overlap note:** Task 2 (KB-079+KB-080) modifies `useWeeklyReport.ts`. No other task touches this file. Task 6 (KB-084+KB-085) modifies `eval-runner.ts`. No other task touches this file. Task 12 (KB-094) modifies `painted-door/[id]/chat/route.ts`; Task 14 (KB-097) also touches this file for console.error prefixes — Task 12 must run before Task 14 to avoid merge conflicts. Both are in Phase 2, and the ordering is enforced by sequential task numbering.

**Phase split rationale:** 14 tasks exceeds the 10-task recommended limit for single-session execution. Tasks 1-7 are all small, independent code fixes (no ordering dependencies). Tasks 8-14 include component extractions, doc updates, and the bulk console.error pass — with one ordering constraint (12→14). Two sessions of 7 tasks each keeps context fresh and prevents quality drift.

**Late additions:** KB-094, KB-096, KB-097 were discovered by the code-simplifier-full scan during this session. KB-095 was triaged CLOSE (intentional stub). KB-086 was removed during plan critique (already resolved by existing inline narrowing).
