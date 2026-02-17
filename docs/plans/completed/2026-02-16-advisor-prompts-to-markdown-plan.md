# Advisor Prompts to Markdown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Convert all 13 advisor prompt files from `.ts` to `.md` and rewrite `prompt-loader.ts` to use `readFileSync`, aligning EPCH with the `.md`-based pattern used by every other repo.

**Source Design Doc:** `docs/plans/2026-02-16-advisor-prompts-to-markdown-design.md`

**Architecture:** Advisor prompts are currently TypeScript files exporting template literal strings, loaded via barrel `index.ts` into a manual `promptMap` in `prompt-loader.ts`. This refactors to plain `.md` files read from disk using `readFileSync`, mirroring the existing `framework-loader.ts` pattern. The public API (`getAdvisorSystemPrompt`) is unchanged.

**Tech Stack:** Node.js `fs.readFileSync`, TypeScript, Vitest

---

### ✅ Task 1: Convert first 4 advisor prompts from .ts to .md

**Files:**
- Convert: `src/lib/advisors/prompts/richard-rumelt.ts` → `src/lib/advisors/prompts/richard-rumelt.md`
- Convert: `src/lib/advisors/prompts/april-dunford.ts` → `src/lib/advisors/prompts/april-dunford.md`
- Convert: `src/lib/advisors/prompts/copywriter.ts` → `src/lib/advisors/prompts/copywriter.md`
- Convert: `src/lib/advisors/prompts/seo-expert.ts` → `src/lib/advisors/prompts/seo-expert.md`

**Step 1: Convert each file**

For each `.ts` file: read the content, strip the `export const prompt = \`` prefix from line 1 and the `\`;` suffix from the last line, write as `.md`. The markdown content inside the template literal becomes the `.md` file content verbatim.

**Verified:** Grep for escaped backticks (`\\``) and template interpolation (`${`) across all 13 `.ts` files returned zero results. This is a pure prefix/suffix strip — no escaped characters need conversion. (The design doc flagged this as a risk; the risk has been checked and cleared.)

Example — `richard-rumelt.ts` starts with:
```
export const prompt = `You are Richard Rumelt, author of "Good Strategy Bad Strategy"...
```
The `.md` file should start with:
```
You are Richard Rumelt, author of "Good Strategy Bad Strategy"...
```

And the last line ending with `` `; `` should have that suffix removed.

**Step 2: Delete the original .ts files**

After creating all 4 `.md` files, delete the 4 `.ts` files:
```bash
rm src/lib/advisors/prompts/richard-rumelt.ts src/lib/advisors/prompts/april-dunford.ts src/lib/advisors/prompts/copywriter.ts src/lib/advisors/prompts/seo-expert.ts
```

**Step 3: Verify .md files look correct**

Read each `.md` file and confirm:
- First line starts with `You are` (for named advisors) or `You are a` (for role advisors)
- No `export const prompt` wrapper remains
- No trailing `` `; ``
- Content is otherwise identical to what was inside the template literal

Do NOT commit yet — the loader and barrel still reference these as TS imports, so the app is intentionally broken at this point.

---

### ✅ Task 2: Convert remaining 9 advisor prompts from .ts to .md

**Files:**
- Convert: `src/lib/advisors/prompts/shirin-oreizy.ts` → `src/lib/advisors/prompts/shirin-oreizy.md`
- Convert: `src/lib/advisors/prompts/joe-pulizzi.ts` → `src/lib/advisors/prompts/joe-pulizzi.md`
- Convert: `src/lib/advisors/prompts/robb-wolf.ts` → `src/lib/advisors/prompts/robb-wolf.md`
- Convert: `src/lib/advisors/prompts/robbie-kellman-baxter.ts` → `src/lib/advisors/prompts/robbie-kellman-baxter.md`
- Convert: `src/lib/advisors/prompts/rob-walling.ts` → `src/lib/advisors/prompts/rob-walling.md`
- Convert: `src/lib/advisors/prompts/patrick-campbell.ts` → `src/lib/advisors/prompts/patrick-campbell.md`
- Convert: `src/lib/advisors/prompts/oli-gardner.ts` → `src/lib/advisors/prompts/oli-gardner.md`
- Convert: `src/lib/advisors/prompts/julian-shapiro.ts` → `src/lib/advisors/prompts/julian-shapiro.md`
- Convert: `src/lib/advisors/prompts/joanna-wiebe.ts` → `src/lib/advisors/prompts/joanna-wiebe.md`

**Step 1: Convert each file**

Same process as Task 1: strip `export const prompt = \`` prefix and `` `; `` suffix.

**Step 2: Delete the original .ts files**

```bash
rm src/lib/advisors/prompts/shirin-oreizy.ts src/lib/advisors/prompts/joe-pulizzi.ts src/lib/advisors/prompts/robb-wolf.ts src/lib/advisors/prompts/robbie-kellman-baxter.ts src/lib/advisors/prompts/rob-walling.ts src/lib/advisors/prompts/patrick-campbell.ts src/lib/advisors/prompts/oli-gardner.ts src/lib/advisors/prompts/julian-shapiro.ts src/lib/advisors/prompts/joanna-wiebe.ts
```

**Step 3: Verify .md files look correct**

Same checks as Task 1.

Do NOT commit yet.

---

### ✅ Task 3: Rewrite prompt-loader.ts and delete prompts/index.ts

**Files:**
- Modify: `src/lib/advisors/prompt-loader.ts`
- Delete: `src/lib/advisors/prompts/index.ts`

**Step 1: Rewrite prompt-loader.ts**

Replace the entire content of `src/lib/advisors/prompt-loader.ts` with:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

const promptCache = new Map<string, string>();
const PROMPTS_PATH = join(process.cwd(), 'src/lib/advisors/prompts');

export function getAdvisorSystemPrompt(advisorId: string): string {
  if (promptCache.has(advisorId)) {
    return promptCache.get(advisorId)!;
  }

  const filePath = join(PROMPTS_PATH, `${advisorId}.md`);
  try {
    const content = readFileSync(filePath, 'utf-8');
    promptCache.set(advisorId, content);
    return content;
  } catch {
    throw new Error(`Unknown advisor: ${advisorId}`);
  }
}

export function clearAdvisorCache(): void {
  promptCache.clear();
}
```

Key points:
- `PROMPTS_PATH` uses `process.cwd()` — same pattern as `framework-loader.ts:8`
- Cache with `Map<string, string>` — same pattern as `framework-loader.ts:6`
- Error message `Unknown advisor: ${advisorId}` preserved — the existing test at `src/lib/__tests__/advisor-prompt-loader.test.ts:31` asserts this exact string
- New export `clearAdvisorCache()` for test isolation — mirrors `clearFrameworkCache()` in `framework-loader.ts:215-217`

**Step 2: Delete prompts/index.ts**

```bash
rm src/lib/advisors/prompts/index.ts
```

This file is only imported by the old `prompt-loader.ts` (via `import * as prompts from './prompts'`). No other file imports from it — verified by grep. The two consumers (`src/lib/agent-tools/critique.ts:13` and `src/lib/agent-tools/foundation.ts:8`) import `getAdvisorSystemPrompt` directly from `prompt-loader`.

**Step 3: Verify no remaining .ts files in prompts directory**

Run a glob for `src/lib/advisors/prompts/*.ts` — should return zero results. Only `.md` files should remain.

**Note:** The directory contains a pre-existing circular symlink at `src/lib/advisors/prompts/prompts` (untracked, points back to the prompts directory itself). Ignore it — it's not created by this refactor and doesn't affect the `.md` loader.

Do NOT commit yet — run tests first in the next task.

---

### ✅ Task 4: Update tests and verify

**Files:**
- Modify: `src/lib/__tests__/advisor-prompt-loader.test.ts`

**Step 1: Add beforeEach and test for clearAdvisorCache**

Update `src/lib/__tests__/advisor-prompt-loader.test.ts` with three changes:

1. Update the import line at `line 2` from:
```typescript
import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';
```
to:
```typescript
import { getAdvisorSystemPrompt, clearAdvisorCache } from '@/lib/advisors/prompt-loader';
```

2. Add a `beforeEach` inside the `describe` block (after line 5, before the first `it`):
```typescript
  beforeEach(() => {
    clearAdvisorCache();
  });
```
This ensures each test starts with a cold cache, so cache hits from earlier tests don't mask real loading behavior. Without this, the `clearAdvisorCache` test below could hit a warm cache on its first load and never exercise the disk read.

3. Add a new test after the existing tests (before the closing `});`):
```typescript
  it('clearAdvisorCache resets cached prompts', () => {
    const first = getAdvisorSystemPrompt('richard-rumelt');
    expect(first).toContain('Richard Rumelt');

    clearAdvisorCache();

    const second = getAdvisorSystemPrompt('richard-rumelt');
    expect(second).toContain('Richard Rumelt');
    expect(second).toBe(first);
  });
```

Note: This test is retroactive — the `clearAdvisorCache` implementation was written in Task 3. Verify it passes immediately; no red-green-refactor cycle.

This test verifies that:
- Loading works before clear (cold cache from `beforeEach`)
- `clearAdvisorCache()` doesn't throw
- Loading works after clear (re-reads from disk)
- Content is identical (consistency check)

**Important:** The existing `registry contains entries for all advisors with prompts` test at line 34 is the primary regression guard for all 13 advisors — it iterates every registry entry and calls `getAdvisorSystemPrompt`. The 4 individual spot-check tests (richard-rumelt, april-dunford, copywriter, seo-expert) cover a subset. If a conversion failed for one of the 9 other advisors, the registry test will catch it.

**Step 2: Run the tests**

```bash
npx vitest run src/lib/__tests__/advisor-prompt-loader.test.ts
```

Expected: All 8 tests pass (7 existing + 1 new).

If tests fail, diagnose and fix. Common failure modes:
- `ENOENT` on a `.md` file → a conversion was missed or filename is wrong
- `Unknown advisor` → an advisorId in the registry doesn't match an `.md` filename
- Content assertion failure → the prefix/suffix stripping left artifacts

**Step 3: Run the full test suite**

```bash
npx vitest run
```

Expected: All tests pass. No other test files import from `prompts/index.ts` or the individual `.ts` prompt files.

**Step 4: Run the build**

```bash
npm run build
```

Expected: Build succeeds. The deleted `.ts` files and `index.ts` barrel are no longer imported anywhere — the only consumer was the old `prompt-loader.ts`.

**Step 5: Run lint**

```bash
npm run lint
```

Expected: No new lint errors.

---

### ✅ Task 5: Commit

**Step 1: Stage all changes**

```bash
git add src/lib/advisors/prompt-loader.ts src/lib/advisors/prompts/ src/lib/__tests__/advisor-prompt-loader.test.ts
```

This stages:
- The rewritten `prompt-loader.ts`
- All 13 new `.md` files
- All 13 deleted `.ts` files + deleted `index.ts`
- The updated test file

**Step 2: Commit**

```bash
git commit -m "refactor: convert advisor prompts from .ts to .md with readFileSync loader

Converts 13 advisor prompt files from TypeScript template literals to plain
markdown files. Rewrites prompt-loader.ts to use readFileSync (mirroring
framework-loader.ts pattern). Deletes barrel export prompts/index.ts.
Adds clearAdvisorCache() for test isolation. Public API unchanged."
```

**Step 3: Verify commit**

Run `git status` — working tree should be clean (except unrelated untracked files).

**Step 4: Push to main**

```bash
git push
```

---

## Decision Log

### Summary
| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Error handling approach | `throw new Error` (matching existing behavior) | Return `null` (framework-loader pattern) |
| 2 | Cache strategy | In-memory `Map` with `clearAdvisorCache()` | No cache, LRU cache |
| 3 | Task granularity for conversion | 2 tasks (4 + 9 split) | 1 task (all 13), 13 tasks (one each) |

### Appendix: Decision Details

#### Decision 1: Error handling approach
**Chose:** `throw new Error(`Unknown advisor: ${advisorId}`)` on file-not-found
**Why:** The existing `prompt-loader.ts` throws this exact error, and the test at `advisor-prompt-loader.test.ts:31` asserts on the string `'Unknown advisor: nonexistent'`. Changing to `return null` (the `framework-loader.ts` pattern) would break this test and change the contract for the two consumers (`critique.ts` and `foundation.ts`), which both expect a string return and don't handle `null`. Keeping the throw maintains backward compatibility with zero consumer changes.
**Note:** The framework-loader logs errors via `console.error` before returning `null`. The advisor loader omits this because the throw propagates to the caller, and `critique.ts`/`foundation.ts` already have their own error handling context. The existing advisor loader also had no logging — behavior is preserved.
**Alternatives rejected:**
- Return `null` (framework-loader pattern): Would require updating the return type to `string | null`, updating both consumers to handle `null`, and rewriting the test. More churn for no benefit.

#### Decision 2: Cache strategy
**Chose:** In-memory `Map<string, string>` with `clearAdvisorCache()` export
**Why:** Mirrors `framework-loader.ts` exactly (lines 6, 215-217). Advisor prompts are static text files that don't change at runtime, so caching avoids repeated disk reads. The `clearAdvisorCache()` function enables test isolation (clearing between tests) without mocking `fs`.
**Alternatives rejected:**
- No cache: Would read from disk on every `getAdvisorSystemPrompt` call. In the critique pipeline, the same advisor prompt can be loaded multiple times per run. Unnecessary I/O.
- LRU cache: Over-engineering. There are only 13 advisors — the full cache is ~50KB of text. Memory is not a concern.

#### Decision 3: Task granularity for conversion
**Chose:** Split into 2 tasks (4 + 9 files) rather than 1 or 13
**Why:** Converting all 13 in one task is fine for a mechanical operation but risks a very long task. One per file is excessive busywork. Splitting 4 + 9 keeps each task manageable while the first batch (4 original advisors) serves as a validation run for the pattern.
**Alternatives rejected:**
- All 13 in one task: Acceptable but large. If something goes wrong mid-conversion, harder to identify which file caused the issue.
- One task per file: 13 nearly-identical tasks is excessive for a mechanical transformation.
