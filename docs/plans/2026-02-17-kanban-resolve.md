# Kanban Board Resolution Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Resolve 31 Kanban board items (24 actionable, 7 skipped)
**Source Design Doc:** N/A
**Architecture:** Mechanical refactoring — no architectural changes
**Tech Stack:** Next.js 16 / React 19 / TypeScript / Tailwind CSS 4 / Upstash Redis / Anthropic SDK

---

## Skipped Items

| KB | Title | Reason |
|----|-------|--------|
| KB-051 | Duplicated date formatting logic | Two call sites across different architectural layers (client UI vs server prompts) with trivial one-liner logic. Standard extraction threshold is 3+ sites or non-trivial shared logic. |
| KB-052 | Unused getProgress mock in test | The mock entry is load-bearing — the production module imports `getProgress`, so `vi.mock` factory must include it even though no test directly asserts against it. |
| KB-057 | Duplicated foundation doc filtering | Two sites have similar fetch+filter+format patterns but genuinely different formatting (heading levels, separators, empty-state behavior). A shared helper would need 3+ parameters and be more complex than the duplication. |
| KB-059 | Redundant useCallback wrappers | The `useCallback` wrappers are correctness-preserving for interval-based polling. Removing them would introduce stale closure bugs under React Strict Mode. |
| KB-061 | Nested ternaries for step colors | Two files use different status vocabularies (`active` vs `running`) and different connector logic (gradient vs binary). Not actually duplicated — independent implementations of a similar visual concept. |
| KB-062 | Large build page component | Sub-components are already extracted. Remaining logic is tightly coupled (streaming→signal→polling cycle). A hook would move complexity across a file boundary without reducing it, with zero reuse case. |
| KB-063 | Env var checks consolidation | Non-uniform check types (helper function vs direct `process.env`), actionable error messages that degrade with generic loop, and only ~12 lines of savings. Explicit sequential guards are more readable. |

---

### ✅ Task 1: Update stale documentation

**KBs:** KB-037, KB-053

**Files:**
- Modify: `docs/Agent Tools & Skills.md`
- Modify: `docs/architecture.md`

**Step 1:** In `docs/Agent Tools & Skills.md`:
- Update advisor count from "13 advisors" to "14 advisors"
- Add 4 missing advisor rows to the Advisors table: `oli-gardner` (critic), `julian-shapiro` (author), `seth-godin` (strategist), `joanna-wiebe` (critic)
- In the Document Types & Advisor Assignments table, change the `strategy` row advisor from "Richard Rumelt" to "Seth Godin"

**Step 2:** In `docs/architecture.md`:
- Replace all `analyses/[id]` references with `project/[id]` (lines ~16, 98, 103, 683, 691)
- Replace `/api/analyses` references with `/api/project` (lines ~704-705)
- Update advisor count from "13 advisors" to "14 advisors" (line ~264)
- Update "13-advisor" to "14-advisor" (line ~771)

**Step 3:** Run `npm run build` to verify no doc-related imports broke
**Step 4:** Run `npm test` to verify no regressions
**Step 5:** Commit changes

---

### ✅ Task 2: Tiny code simplifications

**KBs:** KB-042, KB-049

**Files:**
- Modify: `src/app/content/[id]/page.tsx`
- Modify: `src/lib/research-agent-prompts.ts`

**Step 1:** In `src/app/content/[id]/page.tsx`: Hoist the `queuedPieces` declaration from inside the IIFE (lines ~238-260) to the pre-return derivation block after the `pendingCount` line (~118). Remove the IIFE wrapper, keeping the inner `mergedPieces.map(...)` JSX.

**Step 2:** In `src/lib/research-agent-prompts.ts`: Replace the 4-line sort body (lines ~19-22) with `.sort((a, b) => (a.type === 'strategy' ? -1 : 1))`. The filter already guarantees only `strategy` and `positioning` reach the sort.

**Step 3:** Run `npm run build` to verify compilation
**Step 4:** Run `npm test` to verify no regressions
**Step 5:** Commit changes

---

### ✅ Task 3: Remove dead code and redundant try-catch wrappers

**KBs:** KB-045, KB-048, KB-064

**Files:**
- Modify: `src/lib/agent-tools/foundation.ts`
- Modify: `src/lib/__tests__/foundation-tools.test.ts`
- Modify: `src/app/api/analyze/[id]/route.ts`
- Modify: `src/lib/agent-tools/website-chat.ts`
- Modify: `src/lib/__tests__/consult-advisor.test.ts`

**Step 1:** In `src/lib/agent-tools/foundation.ts`: Delete the `load_design_seed` tool object (lines ~304-315). No code path calls this tool.

**Step 2:** In `src/lib/__tests__/foundation-tools.test.ts`: Change `toHaveLength(3)` to `toHaveLength(2)`. Remove `'load_design_seed'` from the tool name array. Delete the `describe('load_design_seed', ...)` block.

**Step 3:** In `src/app/api/analyze/[id]/route.ts`: Remove the outer `try { ... } catch (error) { ... }` wrapper from `buildEnrichedContext`. The inner `.catch(() => null)` on each `getFoundationDoc` call already prevents `Promise.all` from rejecting. Un-indent the function body.

**Step 4:** In `src/lib/agent-tools/website-chat.ts`: Remove the `try { ... } catch (error) { ... }` wrapper from the `consult_advisor` tool's `execute` function (lines ~37, 67-70). Let errors propagate to the outer catch in `runAgentStream` which correctly returns `is_error: true`.

**Step 5:** In `src/lib/__tests__/consult-advisor.test.ts`: Update error-path test assertions to expect thrown errors rather than the error string return value.

**Step 6:** Run `npm run build` to verify compilation
**Step 7:** Run `npm test` to verify no regressions
**Step 8:** Commit changes

---

### ✅ Task 4: Eliminate duplicate function and intermediate type

**KBs:** KB-047, KB-060

**Files:**
- Modify: `src/lib/utils.ts`
- Modify: `src/components/ReanalyzeForm.tsx`
- Modify: `src/lib/research-agent-prompts.ts`
- Modify: `src/lib/critique-service.ts`

**Step 1:** Add `capitalize(s: string): string` to `src/lib/utils.ts`.

**Step 2:** In `src/components/ReanalyzeForm.tsx`: Remove the local `capitalize` definition (lines ~17-19). Add `import { capitalize } from '@/lib/utils'`.

**Step 3:** In `src/lib/research-agent-prompts.ts`: Remove the local `capitalize` definition (lines ~12-14). Add `capitalize` to the import from `@/lib/utils`.

**Step 4:** In `src/lib/critique-service.ts`: Delete the `CritiqueResult` interface (lines ~10-18). Change `CritiqueRoundResult.critiques` type from `CritiqueResult[]` to `AdvisorCritique[]`. Replace the `CritiqueResult[]` mapping block with direct `AdvisorCritique[]` mapping. Delete the `advisorCritiques` re-conversion block and pass `AdvisorCritique[]` directly to `applyEditorRubric`.

**Step 5:** Run `npm run build` to verify compilation
**Step 6:** Run `npm test` to verify no regressions
**Step 7:** Commit changes

---

### ✅ Task 5: Extract validation canvas helpers

**KBs:** KB-034, KB-056, KB-039

**Files:**
- Modify: `src/lib/validation-canvas.ts`
- Modify: `src/lib/research-agent.ts`
- Modify: `src/lib/agent-tools/research.ts`
- Modify: `src/app/api/validation/[ideaId]/route.ts`
- Modify: `src/app/project/[id]/page.tsx`
- Modify: `src/lib/__tests__/validation-canvas.test.ts`

**Step 1:** Add `tryGenerateCanvas(ideaId: string, logPrefix: string): Promise<void>` to `src/lib/validation-canvas.ts`. Wraps `generateAssumptions(ideaId)` in a try-catch that logs errors without re-throwing.

**Step 2:** In `src/lib/research-agent.ts`: Replace the canvas generation try-catch block (lines ~192-198) with `await tryGenerateCanvas(idea.id, 'research-agent')`.

**Step 3:** In `src/lib/agent-tools/research.ts`: Replace the canvas generation try-catch block (lines ~351-357) with `await tryGenerateCanvas(idea.id, 'research-tools')`.

**Step 4:** Add `buildPivotData(ideaId: string)` to `src/lib/validation-canvas.ts`. Returns `Promise<{ pivotSuggestions: Record<string, unknown[]>; pivotHistory: Record<string, unknown[]> }>`. Iterates `ASSUMPTION_TYPES`, fetches `getPivotSuggestions` and `getPivotHistory` with `.catch(() => [])`, filters empty arrays.

**Step 5:** In `src/app/api/validation/[ideaId]/route.ts`: Replace the inline pivot assembly (lines ~40-52) with `const { pivotSuggestions, pivotHistory: pivotHistoryMap } = await buildPivotData(ideaId)`.

**Step 6:** In `src/app/project/[id]/page.tsx`: Replace the inline pivot assembly and canvas assembly (lines ~97-116) with calls to `buildPivotData` and a new `buildValidationCanvasData` helper extracted to the same file or to `validation-canvas.ts`.

**Step 7:** Add tests to `src/lib/__tests__/validation-canvas.test.ts` for `tryGenerateCanvas` (success, error suppression, console.error called) and `buildPivotData` (all-empty, partial, per-fetch graceful degradation).

**Step 8:** Run `npm run build` to verify compilation
**Step 9:** Run `npm test` to verify no regressions
**Step 10:** Commit changes

---

### ✅ Task 6: Refactor foundation editor handleSend

**KBs:** KB-044, KB-046

**Files:**
- Modify: `src/app/foundation/[id]/edit/[docType]/page.tsx`

**Step 1:** Inside `handleSend`, define `updateLastMessage(text: string)` as a local helper that wraps the `setMessages` updater pattern. Replace both duplicate instances (streaming update at ~lines 140-144 and finalization at ~lines 158-163) with calls to `updateLastMessage(chatText)`.

**Step 2:** Extract lines ~123-164 (the streaming read loop) into a named async function `streamChatResponse(res: Response)` declared inside the component, closing over `setMessages`, `setContent`, and `setPreviousContent`. This function uses `updateLastMessage` from Step 1.

**Step 3:** In `handleSend`, replace the extracted streaming block with `await streamChatResponse(res)`.

**Step 4:** Run `npm run build` to verify compilation
**Step 5:** Run `npm test` to verify no regressions
**Step 6:** Commit changes

---

### ✅ Task 7: Clean up useContentCalendar hook

**KBs:** KB-040, KB-041

**Files:**
- Modify: `src/hooks/useContentCalendar.ts`

**Step 1:** Replace `const [autoGenerating, setAutoGenerating] = useState(false)` with `const autoGenerating = useRef(false)`. Update the guard to `!autoGenerating.current` and the setter to `autoGenerating.current = true`. Add `useRef` to the React import.

**Step 2:** Extract the 6-line published-keys fetch pattern (duplicated at lines ~46-51 and ~72-77) into a `refreshPublishedKeys` useCallback with `[]` dep array. Replace both inline blocks with `await refreshPublishedKeys()`. Add `refreshPublishedKeys` to `fetchCalendar`'s dep array.

**Step 3:** Run `npm run build` to verify compilation
**Step 4:** Run `npm test` to verify no regressions
**Step 5:** Commit changes

---

### ✅ Task 8: Refactor status timestamp logic

**KBs:** KB-035

**Files:**
- Modify: `src/app/api/validation/[ideaId]/status/route.ts`

**Step 1:** Create a pure helper function `getTimestampUpdate(status: AssumptionStatus, now: number)` using a switch statement that explicitly handles all 5 status values (`untested`, `testing`, `validated`, `invalidated`, `pivoted`), returning the appropriate `validatedAt`/`invalidatedAt` values.

**Step 2:** Replace the three conditional spread lines (lines ~51-53) with a single spread of the helper's return value.

**Step 3:** Add or update tests for all five status values, documenting the chosen timestamp behavior for `pivoted`.

**Step 4:** Run `npm run build` to verify compilation
**Step 5:** Run `npm test` to verify no regressions
**Step 6:** Commit changes

---

### ✅ Task 9: Add error handling to AssumptionActions

**KBs:** KB-036

**Files:**
- Modify: `src/components/AssumptionActions.tsx`

**Step 1:** Add `const [error, setError] = useState<string | null>(null)` state.

**Step 2:** In `updateStatus`: clear error at the start (`setError(null)`). Add an `else` branch after `if (res.ok)` to parse the response and call `setError(data.error ?? 'Failed to update status')`. Add a `catch` block for network errors: `setError('Network error — please try again')`.

**Step 3:** Render the error inline below the action buttons as a `<p>` element.

**Step 4:** Run `npm run build` to verify compilation
**Step 5:** Run `npm test` to verify no regressions
**Step 6:** Commit changes

---

### Task 10: Split checkProgress dual polling

**KBs:** KB-038

**Files:**
- Modify: `src/app/content/[id]/generate/page.tsx`

**Step 1:** Replace the single `checkProgress` useCallback with two focused functions: `pollGenerationProgress` (fetches `/api/content/${analysisId}/generate`, calls `setProgress`, redirects on `data.status === 'complete'`) and `pollCritiqueProgress` (fetches `/api/content-pipeline/${analysisId}`, calls `setCritiqueProgress`, redirects on `data.status === 'complete' || 'max-rounds-reached'`). Duplicate the redirect line inline in each.

**Step 2:** Update the `useEffect` at line ~119: change `checkProgress` to `pipelineMode ? pollCritiqueProgress : pollGenerationProgress` and update the dependency array.

**Step 3:** Run `npm run build` to verify compilation
**Step 4:** Run `npm test` to verify no regressions
**Step 5:** Commit changes

---

### Task 11: Create shared foundation dependency graph

**KBs:** KB-043

**Files:**
- Create: `src/lib/foundation-deps.ts`
- Create: `src/lib/__tests__/foundation-deps.test.ts`
- Modify: `src/lib/agent-tools/foundation.ts`
- Modify: `src/app/foundation/[id]/page.tsx`

**Step 1:** Create `src/lib/foundation-deps.ts` exporting `DOC_DEPENDENCIES: Record<FoundationDocType, FoundationDocType[]>` with the current values from `DOC_UPSTREAM`. This is isomorphic (no server-only imports).

**Step 2:** In `src/lib/agent-tools/foundation.ts`: Remove the local `DOC_UPSTREAM` const. Import and use `DOC_DEPENDENCIES` from `@/lib/foundation-deps`.

**Step 3:** In `src/app/foundation/[id]/page.tsx`: Delete the `canGenerate` function. Replace its call site with `DOC_DEPENDENCIES[type].every(dep => !!docs[dep])`.

**Step 4:** Create `src/lib/__tests__/foundation-deps.test.ts` asserting that `DOC_DEPENDENCIES` covers every value of `FoundationDocType`.

**Step 5:** Run `npm run build` to verify compilation
**Step 6:** Run `npm test` to verify no regressions
**Step 7:** Commit changes

---

### Task 12: Extract fetchFoundationDocs helper

**KBs:** KB-050

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/app/api/analyze/[id]/route.ts`
- Modify: `src/app/project/[id]/analysis/page.tsx`
- Modify: `src/app/api/analyze/[id]/__tests__/route.test.ts`

**Note:** This task depends on Task 3 completing first (KB-048 removes the outer try-catch from `buildEnrichedContext` in the same route file).

**Step 1:** Add `fetchFoundationDocs(ideaId: string): Promise<FoundationDocument[]>` to `src/lib/db.ts`. Wraps `Promise.all` over `getFoundationDoc(ideaId, 'strategy')` and `getFoundationDoc(ideaId, 'positioning')` with `.catch(() => null)`, filters nulls.

**Step 2:** In `src/app/api/analyze/[id]/route.ts` `buildEnrichedContext`: Replace the two `getFoundationDoc` calls with `const docs = await fetchFoundationDocs(ideaId)`.

**Step 3:** In `src/app/project/[id]/analysis/page.tsx` `getPageData`: Replace the foundation doc portion of the `Promise.all` with `fetchFoundationDocs(analysis.ideaId)`.

**Step 4:** Rewrite the `buildEnrichedContext` test suite in `src/app/api/analyze/[id]/__tests__/route.test.ts` to mock `fetchFoundationDocs` from `@/lib/db` instead of individual `getFoundationDoc` calls.

**Step 5:** Run `npm run build` to verify compilation
**Step 6:** Run `npm test` to verify no regressions
**Step 7:** Commit changes

---

### Task 13: Extract analytics page hooks

**KBs:** KB-054

**Files:**
- Create: `src/hooks/useGSCData.ts`
- Create: `src/hooks/useWeeklyReport.ts`
- Modify: `src/app/project/[id]/analytics/page.tsx`

**Step 1:** Create `src/hooks/useGSCData.ts`: Extract the GSC state cluster (loading, error, analysisInfo, linkedSiteUrl, analytics, properties, selectedProperty, linking, refreshing, gscConfigured) plus `init` useEffect, `handleLink`, `handleUnlink`, `handleRefresh`, and a single `handlePropertyRefresh` (replacing the duplicate inline lambdas). Accepts `ideaId: string`.

**Step 2:** Create `src/hooks/useWeeklyReport.ts`: Extract the weekly report state cluster (weeklyReport, availableWeeks, selectedWeek, reportLoading, runningReport) plus `fetchWeeklyReport`, `handleRunReport`, `handleWeekChange`, and the derived `ideaPieces`, `ideaAlerts`, `ideaSummary` values. Accepts `ideaId: string`.

**Step 3:** Update `src/app/project/[id]/analytics/page.tsx` to consume both hooks. Keep `buildComparisons`, `computeSummary`, and the cross-hook derivations (`comparisons`, `unexpectedWinners`, `overallSummary`) in the page file.

**Step 4:** Run `npm run build` to verify compilation
**Step 5:** Run `npm test` to verify no regressions
**Step 6:** Commit changes

---

### Task 14: Parallelize sequential Redis fetches

**KBs:** KB-055

**Files:**
- Modify: `src/lib/db.ts`

**Step 1:** `getAllFoundationDocs` (lines ~328-335): Replace the sequential for loop with `Promise.all(FOUNDATION_DOC_TYPES.map(...))`.

**Step 2:** `deleteAllFoundationDocs` (lines ~341-345): Replace with `Promise.all(FOUNDATION_DOC_TYPES.map(...))`.

**Step 3:** `getAllAssumptions` (lines ~381-388): Replace with `Promise.all(ASSUMPTION_TYPES.map(...))`.

**Step 4:** `deleteCanvasData` (lines ~416-424): Flatten to a single `Promise.all` including the canvas key and all assumption-related keys.

**Step 5:** Run `npm run build` to verify compilation
**Step 6:** Run `npm test` to verify no regressions
**Step 7:** Commit changes

---

### Task 15: Extract buildSession projection helper

**KBs:** KB-058

**Files:**
- Modify: `src/app/api/painted-door/[id]/route.ts`

**Step 1:** Add a `projectBuildSession(session: BuildSession)` helper returning `{ mode, currentStep, steps }`.

**Step 2:** In the `!progress` block: Hoist a single `const buildSession = await getBuildSession(id)` before the site-live check (replacing two separate calls at lines ~90 and ~108).

**Step 3:** Replace all three inline projection literals with `projectBuildSession(buildSession)`.

**Step 4:** Run `npm run build` to verify compilation
**Step 5:** Run `npm test` to verify no regressions
**Step 6:** Commit changes

---

## Decision Log

### Summary
| # | Decision | Choice Made | Alternatives Considered |
|---|----------|-------------|------------------------|
| 1 | Group doc updates | KB-037 + KB-053 into one task | Keep separate (rejected: same mechanical pattern, no file conflicts) |
| 2 | Group validation canvas | KB-034 + KB-056 + KB-039 into one task | Separate tasks (rejected: KB-056 and KB-039 both modify project/[id]/page.tsx, sequential dependency) |
| 3 | Group foundation editor | KB-044 + KB-046 into one task | Separate tasks (rejected: KB-046's helper is used inside KB-044's extraction, same file) |
| 4 | Group useContentCalendar | KB-040 + KB-041 into one task | Separate tasks (rejected: both modify the same hook file) |
| 5 | Group dead code removal | KB-045 + KB-048 + KB-064 into one task | Separate tasks (rejected: identical mechanical pattern — remove unnecessary wrapping) |
| 6 | Group deduplication | KB-047 + KB-060 into one task | Separate tasks (rejected: both eliminate redundant type/function definitions, same pattern) |
| 7 | Group tiny simplifications | KB-042 + KB-049 into one task | Include in larger batch (rejected: these are standalone files with no shared context) |
| 8 | Task ordering | Task 3 before Task 12 | Parallel (rejected: both touch analyze/[id]/route.ts buildEnrichedContext function) |
| 9 | Keep KB-054 standalone | Analytics extraction is the largest task | Group with smaller tasks (rejected: it creates 2 new hook files with substantial logic) |

### Appendix: Decision Details

**Validation canvas sequencing (Decision 2):** KB-056 adds `buildPivotData` to `validation-canvas.ts`. KB-039 extracts `buildValidationCanvasData` from `project/[id]/page.tsx`, which will use `buildPivotData`. KB-034 adds `tryGenerateCanvas` to `validation-canvas.ts`. All three modify `validation-canvas.ts`, and KB-056 + KB-039 both touch `project/[id]/page.tsx`. Executing as one task avoids merge conflicts.

**Task 3 → Task 12 dependency (Decision 8):** Task 3 removes the outer try-catch from `buildEnrichedContext`, un-indenting the function body. Task 12 then replaces the inner `getFoundationDoc` calls with `fetchFoundationDocs`. Both touch `src/app/api/analyze/[id]/route.ts`. Task 3 must complete first to avoid conflicting edits.
