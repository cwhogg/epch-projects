# Kanban Board Resolution Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Resolve 10 Kanban board items (10 actionable, 0 skipped)
**Source Design Doc:** N/A
**Architecture:** Mechanical refactoring — no architectural changes
**Tech Stack:** Next.js 16 / React 19 / TypeScript / Tailwind CSS 4 / Upstash Redis

---

## Skipped Items

None — all 10 items are actionable.

---

### ✅ Task 1: Extract buildAuthorSystemPrompt helper (KB-023)

**KBs:** KB-023

**Files:**
- Modify: `src/lib/agent-tools/critique.ts`

**Step 1:** Add a module-level unexported helper `buildAuthorSystemPrompt(recipe: ContentRecipe): string` before `createCritiqueTools`. It calls `getAdvisorSystemPrompt(recipe.authorAdvisor)`, conditionally appends the framework prompt with `'\n\n## FRAMEWORK\n'` prefix.
**Step 2:** Replace the 7-line block at lines ~219-225 (generate_draft) with `const systemPrompt = buildAuthorSystemPrompt(recipe);`
**Step 3:** Replace the identical 7-line block at lines ~441-447 (revise_draft) with `const systemPrompt = buildAuthorSystemPrompt(recipe);`
**Step 4:** Run `npm run build` to verify compilation
**Step 5:** Run `npm test` to verify no regressions
**Step 6:** Commit changes

---

### ✅ Task 2: Deduplicate redirect in checkProgress (KB-024)

**KBs:** KB-024

**Files:**
- Modify: `src/app/analyses/[id]/content/generate/page.tsx`

**Step 1:** In `checkProgress`, introduce `let isDone = false` before the if/else on `pipelineMode`.
**Step 2:** In each branch, replace the `setTimeout(() => router.push(...), 2000)` call with `isDone = true`.
**Step 3:** After the if/else (before the catch), add a single `if (isDone) { setTimeout(() => { router.push(\`/analyses/${analysisId}/content\`); }, 2000); }`.
**Step 4:** Run `npm run build` to verify compilation
**Step 5:** Run `npm test` to verify no regressions
**Step 6:** Commit changes

---

### ✅ Task 3: Early-return guard in onProgress (KB-025)

**KBs:** KB-025

**Files:**
- Modify: `src/lib/content-critique-agent.ts`
- Modify: `src/lib/__tests__/content-critique-agent.test.ts`

**Step 1:** In the `onProgress` callback (~line 117), after the `console.log`, add: `if (step !== 'tool_call' && step !== 'complete' && step !== 'error') return;`
**Step 2:** Add a test in `content-critique-agent.test.ts` that extracts `onProgress` from the captured `runAgent` config, calls it with an unhandled step type (e.g. `'thinking'`), and asserts that `getRedis().get` was not called. Also add an error path test for what happens when `getRedis().get` returns null (already handled — but verify test exists).
**Step 3:** Run `npm run build` to verify compilation
**Step 4:** Run `npm test` to verify no regressions
**Step 5:** Commit changes

---

### ✅ Task 4: Extract runAnalytics helper in cron route (KB-026)

**KBs:** KB-026

**Files:**
- Modify: `src/app/api/cron/analytics/route.ts`

**Step 1:** Extract a `runAnalytics(source: string): Promise<NextResponse>` function containing: Redis guard, `runAnalyticsAgentAuto()` call, `evaluateAllCanvases()` call, AGENT_PAUSED handling, error logging with source prefix.
**Step 2:** Replace GET handler body (after auth check) with `return runAnalytics('Cron');`
**Step 3:** Replace POST handler body with `return runAnalytics('Manual');`
**Step 4:** Run `npm run build` to verify compilation
**Step 5:** Run `npm test` to verify no regressions
**Step 6:** Commit changes

---

### ✅ Task 5: Parallelize pivot data fetches (KB-027 + KB-028)

**KBs:** KB-027, KB-028

**Files:**
- Modify: `src/app/analyses/[id]/page.tsx`
- Modify: `src/app/api/validation/[ideaId]/route.ts`

**Step 1:** In `page.tsx` (~lines 97-111), replace the flattened `Promise.all` with index arithmetic with a nested `Promise.all` using `ASSUMPTION_TYPES.map(async (aType) => ({ type, suggestions, history }))`. Iterate the results with a for-of loop to populate `canvasPivotSuggestions` and `canvasPivotHistory`.
**Step 2:** In `route.ts` (~lines 43-48), replace the sequential for-loop with parallel `Promise.all` fetches: `Promise.all(ASSUMPTION_TYPES.map(type => getPivotSuggestions(...)))` and `Promise.all(ASSUMPTION_TYPES.map(type => getPivotHistory(...)))`. Reconstruct the maps with `ASSUMPTION_TYPES.forEach`.
**Step 3:** Run `npm run build` to verify compilation
**Step 4:** Run `npm test` to verify no regressions (existing route tests should still pass)
**Step 5:** Commit changes

---

### Task 6: Extract createAlert helper in detectChanges (KB-032)

**KBs:** KB-032

**Files:**
- Modify: `src/lib/analytics-agent.ts`

**Step 1:** Add a function-local or module-level helper `createAlert(current: PieceSnapshot, severity: AlertSeverity, message: string, metric: string, previousValue: number, currentValue: number): PerformanceAlert` that returns the full 7-field object.
**Step 2:** Replace all six `alerts.push({ pieceSlug: current.slug, pieceTitle: current.title, ... })` blocks in `detectChanges` (~lines 253-334) with `alerts.push(createAlert(current, ...))` calls.
**Step 3:** Run `npm run build` to verify compilation
**Step 4:** Run `npm test` to verify no regressions (existing detectChanges tests must pass)
**Step 5:** Commit changes

**Note:** This task modifies `analytics-agent.ts` lines 248-335. Task 8 (KB-029) modifies lines 504-563 in the same file. No overlap — execute in either order.

---

### ✅ Task 7: Cache compare_weeks outputs for save_report (KB-030)

**KBs:** KB-030

**Files:**
- Modify: `src/lib/agent-tools/analytics.ts`
- Create: `src/lib/agent-tools/__tests__/analytics-tools.test.ts`

**Step 1:** Add two closure-level cache variables near existing caches (~line 38): `let cachedPreviousSnapshots: PieceSnapshot[] | null = null;` and `let cachedAlerts: PerformanceAlert[] | null = null;`
**Step 2:** At the end of `compare_weeks.execute` (before return), populate: `cachedPreviousSnapshots = previousSnapshots; cachedAlerts = alerts;`
**Step 3:** In `save_report.execute`, replace the re-fetch of `previousSnapshots` and re-call of `detectChanges` with cache reads that fall back to fetching: `const previousSnapshots = cachedPreviousSnapshots ?? await getWeeklySnapshot(previousWeekId);` and `const alerts = cachedAlerts ?? detectChanges(cachedSnapshots, previousSnapshots);`. Leave `averagePosition` and `averageCtr` computations as-is (not duplicated).
**Step 4:** Create `src/lib/agent-tools/__tests__/analytics-tools.test.ts` with tests: (a) when compare_weeks runs before save_report, `getWeeklySnapshot` is called only once total; (b) when save_report runs without prior compare_weeks, it still fetches and works correctly (fallback path). Include error path tests for mock rejections.
**Step 5:** Run `npm run build` to verify compilation
**Step 6:** Run `npm test` to verify no regressions
**Step 7:** Commit changes

---

### Task 8: Extract runAgentLifecycle helper (KB-029)

**KBs:** KB-029

**Files:**
- Modify: `src/lib/agent-runtime.ts`
- Modify: `src/lib/analytics-agent.ts`
- Modify: `src/lib/research-agent.ts`
- Modify: `src/lib/content-agent-v2.ts`
- Create or modify: `src/lib/__tests__/agent-runtime.test.ts`

**Step 1:** Add `runAgentLifecycle` export to `agent-runtime.ts` with signature: `(agentId: string, entityId: string, makeConfig: (runId: string, isResume: boolean, pausedState: AgentState | null) => AgentConfig, makeInitialMessage: () => string) => Promise<AgentState>`. Implements: pause check via `getActiveRunId`/`getAgentState`, runId derivation, config factory call, run/resume dispatch, AGENT_PAUSED throw, cleanup via `clearActiveRun`/`deleteAgentState`, error rethrow.
**Step 2:** Refactor `runAnalyticsAgentV2` in `analytics-agent.ts` to call `runAgentLifecycle`, keeping only the `makeConfig` factory and the post-lifecycle `getWeeklyReport` fetch.
**Step 3:** Refactor `runResearchAgentV2` in `research-agent.ts` to call `runAgentLifecycle`, keeping the progress initialization inside `makeConfig` and the post-lifecycle `getAnalysisFromDb` fetch.
**Step 4:** Refactor `generateContentPiecesV2` in `content-agent-v2.ts` to call `runAgentLifecycle`, keeping `makeConfig` with the `currentPieceIdx` closure.
**Step 5:** Add tests in `agent-runtime.test.ts` for `runAgentLifecycle`: (a) fresh run path, (b) resume of paused run, (c) AGENT_PAUSED rethrow, (d) error rethrow, (e) cleanup calls. Include error path tests for mock rejections.
**Step 6:** Run `npm run build` to verify compilation
**Step 7:** Run `npm test` to verify no regressions
**Step 8:** Commit changes

---

### Task 9: Extract validation helpers from validate_code (KB-031)

**KBs:** KB-031

**Files:**
- Modify: `src/lib/agent-tools/website.ts`
- Create: `src/lib/__tests__/website-validators.test.ts`

**Step 1:** Extract 11 named exported helper functions at module scope, each with signature `(allFiles: Record<string, string>) => { issues: string[], suggestions: string[] }`: `checkLayoutMetadata`, `checkH1Count`, `checkSemanticHtml`, `checkTailwindImport`, `checkThemeColors`, `checkPostcssConfig`, `checkUseClientDirectives`, `checkRemovedNextJsApis`, `checkAsyncParams`, `checkPackageJson`, `checkBrokenLinks`.
**Step 2:** Replace the `validate_code` execute handler body with calls to each helper, spreading results into `issues` and `suggestions` arrays.
**Step 3:** Create `src/lib/__tests__/website-validators.test.ts` with unit tests for each of the 11 helpers — at minimum one passing and one failing fixture per check. Include edge cases for empty file sets.
**Step 4:** Run `npm run build` to verify compilation
**Step 5:** Run `npm test` to verify no regressions
**Step 6:** Commit changes

---

## Decision Log

### Summary
| # | Decision | Choice Made | Alternatives Considered |
|---|----------|-------------|------------------------|
| 1 | Group KB-027 + KB-028 | Same data access pattern (pivot fetches), triage for KB-027 already suggested fixing route.ts | Keep separate — lower coupling but two tiny tasks |
| 2 | Order KB-032 before KB-029 | Both touch analytics-agent.ts but different line ranges (248-335 vs 504-563); doing KB-032 first is simpler and reduces diff noise for KB-029 | Reverse order — no functional difference |
| 3 | Keep KB-030 separate from KB-032 | Different files (agent-tools/analytics.ts vs analytics-agent.ts), different fix patterns (caching vs extraction) | Group as "analytics cleanup" — rejected, mechanically different |

### Appendix: Decision Details

**Grouping KB-027 + KB-028:** Both items address the same architectural concern — how pivot data is fetched across assumption types. KB-027's triage explicitly recommended also fixing the route.ts serial loop. The page.tsx fix (replace index arithmetic with named fields) and route.ts fix (parallelize serial loop) are different code changes but share the same domain understanding and test verification.

**Task ordering for analytics-agent.ts:** KB-032 (createAlert helper, lines 248-335) and KB-029 (runAgentLifecycle, lines 504-563) both modify `analytics-agent.ts` but touch non-overlapping regions. KB-032 is a smaller, simpler change that should go first to reduce the diff surface when KB-029 makes its larger structural change. No blocking dependency — just recommended ordering.
