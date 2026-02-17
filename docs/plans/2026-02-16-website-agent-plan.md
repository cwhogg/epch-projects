# Website Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Replace the procedural content critique pipeline with a goal-oriented orchestrator that supports framework injection, named critics, and agent-controlled critique selection.

**Source Design Doc:** `docs/plans/2026-02-16-website-agent-design.md`

**Architecture:** Modify `ContentRecipe` to add `authorFramework` and `namedCritics` fields. Update `createCritiqueTools()` to inject framework prompts into `generate_draft`/`revise_draft` and support `advisorIds` filtering on `run_critiques`. Replace the procedural system prompt in `content-critique-agent.ts` with a goal-oriented template. Update the website recipe to use `julian-shapiro` as author with named critics. Remove `PipelineStep` type and fixed `steps` array. Add `evaluationExpertise` to the `copywriter` registry entry. Update frontend progress UI from step-based to round-based.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Vitest / Upstash Redis / Anthropic SDK

---

## Prerequisites

> Complete these steps manually before starting Task 1.

- [ ] Ensure the `landing-page-assembly` framework exists at `src/lib/frameworks/prompts/landing-page-assembly/prompt.md` **AND** has a registry entry in `src/lib/frameworks/registry.ts`. Both are required — without the registry entry, `getFrameworkPrompt('landing-page-assembly')` returns `null` and logs an error on every draft/revision call. If the framework doesn't exist yet, create it via the `/add-framework` skill first.
- [ ] Verify Julian Shapiro, Oli Gardner, and Joanna Wiebe advisor prompt files exist: check that `src/lib/advisors/prompts/julian-shapiro.md`, `oli-gardner.md`, and `joanna-wiebe.md` exist on disk (the prompt loader reads `.md` files via `readFileSync`, not from a registry list). Also verify registry entries exist in `src/lib/advisors/registry.ts` (oli-gardner at line 120, julian-shapiro at line 152, joanna-wiebe at line 159).

---

### Task 1: Add `authorFramework` and `namedCritics` to ContentRecipe interface

**Files:**
- Modify: `src/lib/content-recipes.ts:8-16` (ContentRecipe interface)

**Step 1: Add the two new optional fields to the interface**

In `src/lib/content-recipes.ts`, add `authorFramework` and `namedCritics` to the `ContentRecipe` interface (after `authorAdvisor` on line 10):

```typescript
export interface ContentRecipe {
  contentType: string;
  authorAdvisor: string;
  authorFramework?: string;
  authorContextDocs: FoundationDocType[];
  namedCritics?: string[];
  evaluationNeeds: string;
  evaluationEmphasis?: string;
  minAggregateScore: number;
  maxRevisionRounds: number;
}
```

**Step 2: Verify existing tests still pass**

Run: `npx vitest run src/lib/__tests__/content-recipes.test.ts`
Expected: All 10 tests pass — new optional fields don't break existing recipe shapes.

**Step 3: Commit**

```
git add src/lib/content-recipes.ts
git commit -m "feat: add authorFramework and namedCritics to ContentRecipe interface"
```

---

### Task 2: Update website recipe with new author and named critics

**Files:**
- Modify: `src/lib/content-recipes.ts:18-33` (website recipe)

**Step 1: Write failing test — website recipe has new fields**

In `src/lib/__tests__/content-recipes.test.ts`, update the existing `'website recipe has correct structure'` test (line 147) and add new assertions:

```typescript
it('website recipe has correct structure', () => {
  const r = recipes.website;
  expect(r.contentType).toBe('website');
  expect(r.authorAdvisor).toBe('julian-shapiro');
  expect(r.authorFramework).toBe('landing-page-assembly');
  expect(r.authorContextDocs).toContain('positioning');
  expect(r.namedCritics).toEqual([
    'oli-gardner',
    'joanna-wiebe',
    'shirin-oreizy',
    'copywriter',
  ]);
  expect(r.evaluationNeeds).toContain('conversion-centered design');
  expect(r.evaluationEmphasis).toBeTruthy();
  expect(r.minAggregateScore).toBe(4);
  expect(r.maxRevisionRounds).toBe(3);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/content-recipes.test.ts`
Expected: Fails — `authorAdvisor` is still `'copywriter'`, no `authorFramework`, no `namedCritics`.

**Step 3: Update website recipe**

In `src/lib/content-recipes.ts`, update the website recipe (lines 19-33):

```typescript
website: {
  contentType: 'website',
  authorAdvisor: 'julian-shapiro',
  authorFramework: 'landing-page-assembly',
  authorContextDocs: ['positioning', 'brand-voice', 'seo-strategy'],
  namedCritics: ['oli-gardner', 'joanna-wiebe', 'shirin-oreizy', 'copywriter'],
  evaluationNeeds:
    'This is website landing page copy. Needs review for: conversion-centered design ' +
    '(attention ratio, page focus, directional cues), conversion copywriting quality ' +
    '(headline effectiveness, CTA clarity, voice-of-customer alignment), behavioral science ' +
    '(CTA friction, cognitive load, conversion psychology), and brand voice consistency.',
  evaluationEmphasis:
    'Focus especially on the hero section — does it communicate the "why now" ' +
    'and competitive differentiation within the first viewport? Are CTAs ' +
    'low-friction and high-clarity?',
  minAggregateScore: 4,
  maxRevisionRounds: 3,
},
```

**Step 4: Fix the selectCritics author-exclusion test**

The `selectCritics` author-exclusion test (line 61) uses `recipes.website` which now has `authorAdvisor: 'julian-shapiro'`. The `testRegistry` doesn't contain `julian-shapiro`, so the exclusion logic has nothing to exclude — the test becomes vacuous. Fix this by adding `julian-shapiro` to `testRegistry` with `evaluationExpertise` (so it would be a candidate if not excluded), then assert it's excluded:

Add to `testRegistry` (after the `shirin-oreizy` entry at line 38):
```typescript
{
  id: 'julian-shapiro',
  name: 'Julian Shapiro',
  role: 'author',
  evaluationExpertise: 'Evaluates landing page copy structure.',
},
```

Update the assertion at line 71:
```typescript
// julian-shapiro has evaluationExpertise but is the author — should be excluded
expect(userMessage).not.toContain('- julian-shapiro:');
// april-dunford should still be there as a candidate
expect(userMessage).toContain('- april-dunford:');
```

Run: `npx vitest run src/lib/__tests__/content-recipes.test.ts`
Expected: Some tests may fail until recipe update lands — continue to Step 5.

**Step 5: Run tests again**

Run: `npx vitest run src/lib/__tests__/content-recipes.test.ts`
Expected: All 10 tests pass.

**Step 6: Commit**

```
git add src/lib/content-recipes.ts src/lib/__tests__/content-recipes.test.ts
git commit -m "feat: update website recipe with julian-shapiro author, named critics, and framework"
```

---

> **Atomic deployment note:** Tasks 2 and 3 must land together. Between Task 2 (website recipe changes `authorAdvisor` to `julian-shapiro` and adds `copywriter` to `namedCritics`) and Task 3 (adds `evaluationExpertise` to `copywriter`), the system would have `copywriter` as a named critic without the `evaluationExpertise` field needed to function as one. Do not deploy to Vercel between these two commits.

### Task 3: Add `evaluationExpertise` to copywriter registry entry

**Files:**
- Modify: `src/lib/advisors/registry.ts:14` (copywriter entry)
- Modify: `src/lib/__tests__/content-recipes.test.ts` (test registry)

**Step 1: Write failing test — copywriter has evaluationExpertise**

Add a new test in `src/lib/__tests__/content-recipes.test.ts` in the `'recipes'` describe block:

```typescript
it('copywriter has evaluationExpertise for critic role', () => {
  const { advisorRegistry } = require('@/lib/advisors/registry');
  const copywriter = advisorRegistry.find(
    (a: { id: string }) => a.id === 'copywriter',
  );
  expect(copywriter).toBeDefined();
  expect(copywriter.evaluationExpertise).toBeTruthy();
  expect(copywriter.evaluationExpertise).toContain('brand voice');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/content-recipes.test.ts`
Expected: Fails — copywriter has no `evaluationExpertise`.

**Step 3: Add evaluationExpertise to copywriter entry**

In `src/lib/advisors/registry.ts`, replace the copywriter entry at line 14:

```typescript
{
  id: 'copywriter',
  name: 'Brand Copywriter',
  role: 'author',
  evaluationExpertise:
    'Evaluates brand voice consistency. Does the content match the defined voice ' +
    'attributes? Are tone, vocabulary, and sentence rhythm consistent with the brand ' +
    'voice document? Do counter-examples from the voice guide appear in the copy? ' +
    'Catches voice drift — copy that sounds generic, corporate, or inconsistent with ' +
    'the established brand character.',
  doesNotEvaluate:
    'Does not evaluate SEO strategy, conversion design, behavioral science, or page structure.',
  contextDocs: ['brand-voice'],
},
```

**Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/content-recipes.test.ts`
Expected: All tests pass.

**Step 5: Also update the testRegistry in `content-recipes.test.ts`**

The `testRegistry` at line 15-42 is a standalone test fixture. Add `evaluationExpertise` to the copywriter entry there too so future tests that use the test registry include copywriter as a critic candidate:

```typescript
{
  id: 'copywriter',
  name: 'Brand Copywriter',
  role: 'author',
  evaluationExpertise:
    'Evaluates brand voice consistency.',
  doesNotEvaluate:
    'Does not evaluate SEO strategy, conversion design, behavioral science, or page structure.',
  contextDocs: ['brand-voice'],
},
```

**Step 6: Run all content-recipes tests**

Run: `npx vitest run src/lib/__tests__/content-recipes.test.ts`
Expected: All pass. Note: `copywriter` now has `evaluationExpertise` and is no longer the `authorAdvisor` (that's `julian-shapiro`), so `copywriter` is now a candidate in critic selection. The author-exclusion test (from Task 2 Step 4) excludes `julian-shapiro` — `copywriter` correctly appears in the candidate list.

**Step 7: Commit**

```
git add src/lib/advisors/registry.ts src/lib/__tests__/content-recipes.test.ts
git commit -m "feat: add evaluationExpertise to copywriter for critic selection"
```

---

> **Ordering constraint:** Tasks 4, 5, and 6 all modify `src/lib/agent-tools/critique.ts`. Complete them in order: Task 4 → Task 5 → Task 6. Line references in later tasks assume prior tasks' edits are already committed.

### Task 4: Add framework injection to `generate_draft` tool

**Files:**
- Modify: `src/lib/agent-tools/critique.ts:204-248` (generate_draft execute function)

**Step 1: Write failing test — generate_draft concatenates framework prompt**

In `src/lib/__tests__/critique-tools.test.ts`, add a mock for framework-loader at the top (after existing mocks, around line 33):

```typescript
// Mock framework loader
vi.mock('@/lib/frameworks/framework-loader', () => ({
  getFrameworkPrompt: vi.fn().mockReturnValue(null),
}));
```

Then add a new test in the `generate_draft` describe block:

```typescript
it('concatenates framework prompt when recipe has authorFramework', async () => {
  const { getFrameworkPrompt } = await import(
    '@/lib/frameworks/framework-loader'
  );
  vi.mocked(getFrameworkPrompt).mockReturnValue('## Landing Page Assembly\nPhase 1: ...');

  const recipeCopy = {
    ...recipes.website,
    authorFramework: 'landing-page-assembly',
  };
  const frameworkTools = createCritiqueTools(
    'fw-run',
    ideaId,
    recipeCopy,
  );

  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: 'Draft with framework' }],
  });

  const tool = frameworkTools.find((t) => t.name === 'generate_draft')!;
  await tool.execute({ contentContext: 'Test context' });

  const systemArg = mockCreate.mock.calls[0][0].system;
  expect(systemArg).toContain('## FRAMEWORK');
  expect(systemArg).toContain('Landing Page Assembly');
});

it('proceeds without framework when getFrameworkPrompt returns null', async () => {
  const { getFrameworkPrompt } = await import(
    '@/lib/frameworks/framework-loader'
  );
  vi.mocked(getFrameworkPrompt).mockReturnValue(null);

  const recipeCopy = {
    ...recipes.website,
    authorFramework: 'nonexistent-framework',
  };
  const nullFwTools = createCritiqueTools(
    'null-fw-run',
    ideaId,
    recipeCopy,
  );

  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: 'Draft without framework' }],
  });

  const tool = nullFwTools.find((t) => t.name === 'generate_draft')!;
  const result = (await tool.execute({
    contentContext: 'Test context',
  })) as { success: boolean };

  expect(result.success).toBe(true);
  const systemArg = mockCreate.mock.calls[0][0].system;
  expect(systemArg).not.toContain('## FRAMEWORK');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/critique-tools.test.ts`
Expected: Fails — `generate_draft` doesn't import or use `getFrameworkPrompt`.

**Step 3: Add framework injection to generate_draft**

In `src/lib/agent-tools/critique.ts`:

1. Add import at the top (after line 16):
```typescript
import { getFrameworkPrompt } from '@/lib/frameworks/framework-loader';
```

2. Modify the `generate_draft` execute function (around line 218, where `systemPrompt` is built):

Replace:
```typescript
const systemPrompt = getAdvisorSystemPrompt(recipe.authorAdvisor);
```

With:
```typescript
let systemPrompt = getAdvisorSystemPrompt(recipe.authorAdvisor);
if (recipe.authorFramework) {
  const frameworkPrompt = getFrameworkPrompt(recipe.authorFramework);
  if (frameworkPrompt) {
    systemPrompt += '\n\n## FRAMEWORK\n' + frameworkPrompt;
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/critique-tools.test.ts`
Expected: All tests pass including the two new framework tests.

**Step 5: Commit**

```
git add src/lib/agent-tools/critique.ts src/lib/__tests__/critique-tools.test.ts
git commit -m "feat: add framework injection to generate_draft tool"
```

---

### Task 5: Add framework injection to `revise_draft` tool

**Files:**
- Modify: `src/lib/agent-tools/critique.ts:385` (revise_draft systemPrompt line)

**Step 1: Write failing test — revise_draft concatenates framework prompt**

Add a new test in `src/lib/__tests__/critique-tools.test.ts` in the `revise_draft` describe block:

```typescript
it('concatenates framework prompt during revision', async () => {
  const { getFrameworkPrompt } = await import(
    '@/lib/frameworks/framework-loader'
  );
  vi.mocked(getFrameworkPrompt).mockReturnValue('## Landing Page Assembly\nPhase 1: ...');

  const recipeCopy = {
    ...recipes.website,
    authorFramework: 'landing-page-assembly',
  };
  const fwTools = createCritiqueTools('fw-revise-run', ideaId, recipeCopy);

  mockRedis.get.mockResolvedValueOnce('Original draft');
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: 'Revised with framework' }],
  });

  const tool = fwTools.find((t) => t.name === 'revise_draft')!;
  await tool.execute({ brief: 'Fix hero section' });

  const systemArg = mockCreate.mock.calls[0][0].system;
  expect(systemArg).toContain('## FRAMEWORK');
  expect(systemArg).toContain('Landing Page Assembly');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/critique-tools.test.ts`
Expected: Fails — `revise_draft` doesn't inject framework.

**Step 3: Add framework injection to revise_draft**

In `src/lib/agent-tools/critique.ts`, modify the `revise_draft` execute function around line 385:

Replace:
```typescript
const systemPrompt = getAdvisorSystemPrompt(recipe.authorAdvisor);
```

With:
```typescript
let systemPrompt = getAdvisorSystemPrompt(recipe.authorAdvisor);
if (recipe.authorFramework) {
  const frameworkPrompt = getFrameworkPrompt(recipe.authorFramework);
  if (frameworkPrompt) {
    systemPrompt += '\n\n## FRAMEWORK\n' + frameworkPrompt;
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/critique-tools.test.ts`
Expected: All tests pass.

**Step 5: Commit**

```
git add src/lib/agent-tools/critique.ts src/lib/__tests__/critique-tools.test.ts
git commit -m "feat: add framework injection to revise_draft tool"
```

---

### Task 6: Add `advisorIds` parameter and named critic merging to `run_critiques`

**Files:**
- Modify: `src/lib/agent-tools/critique.ts:250-311` (run_critiques tool)

**Step 1: Write failing tests — advisorIds subset selection and named critic merging**

Add these tests in `src/lib/__tests__/critique-tools.test.ts` in the `run_critiques` describe block:

```typescript
it('runs only specified advisorIds when provided', async () => {
  const { selectCritics } = await import('@/lib/content-recipes');
  vi.mocked(selectCritics).mockResolvedValueOnce([
    {
      id: 'april-dunford',
      name: 'April Dunford',
      role: 'strategist',
      evaluationExpertise: 'test',
    },
    {
      id: 'seo-expert',
      name: 'SEO Expert',
      role: 'critic',
      evaluationExpertise: 'test',
    },
  ]);

  const freshTools = createCritiqueTools('subset-run', ideaId, recipes.website);

  mockRedis.get
    .mockResolvedValueOnce('Test draft')
    .mockResolvedValueOnce(null);

  // Mock two critic responses
  mockCreate
    .mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c1',
          name: 'submit_critique',
          input: { score: 8, pass: true, issues: [] },
        },
      ],
    });

  const tool = freshTools.find((t) => t.name === 'run_critiques')!;

  // First call populates all critics
  await tool.execute({});

  // Reset mocks for second call
  mockRedis.get.mockResolvedValueOnce('Test draft');
  mockCreate.mockResolvedValueOnce({
    content: [
      {
        type: 'tool_use',
        id: 'c2',
        name: 'submit_critique',
        input: { score: 7, pass: true, issues: [] },
      },
    ],
  });

  // Second call with advisorIds — should only run april-dunford
  const result = (await tool.execute({
    advisorIds: ['april-dunford'],
  })) as { critiques: Array<{ advisorId: string }> };

  expect(result.critiques).toHaveLength(1);
  expect(result.critiques[0].advisorId).toBe('april-dunford');
});

it('merges named critics with dynamically selected critics', async () => {
  const { selectCritics } = await import('@/lib/content-recipes');
  // Dynamic selection returns seo-expert only
  vi.mocked(selectCritics).mockResolvedValueOnce([
    {
      id: 'seo-expert',
      name: 'SEO Expert',
      role: 'critic',
      evaluationExpertise: 'test',
    },
  ]);

  // Use a recipe with namedCritics
  const recipeCopy = {
    ...recipes.website,
    namedCritics: ['shirin-oreizy'],
  };
  const freshTools = createCritiqueTools('merge-run', ideaId, recipeCopy);

  mockRedis.get
    .mockResolvedValueOnce('Test draft')
    .mockResolvedValueOnce(null);

  // Two critic calls (shirin-oreizy + seo-expert)
  mockCreate
    .mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c1',
          name: 'submit_critique',
          input: { score: 7, pass: true, issues: [] },
        },
      ],
    })
    .mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c2',
          name: 'submit_critique',
          input: { score: 8, pass: true, issues: [] },
        },
      ],
    });

  const tool = freshTools.find((t) => t.name === 'run_critiques')!;
  const result = (await tool.execute({})) as {
    critiques: Array<{ advisorId: string }>;
  };

  // Should have both named (shirin-oreizy) and dynamic (seo-expert)
  expect(result.critiques.length).toBeGreaterThanOrEqual(2);
  const ids = result.critiques.map((c) => c.advisorId);
  expect(ids).toContain('shirin-oreizy');
  expect(ids).toContain('seo-expert');
});

it('warns and skips named critic IDs not found in registry', async () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { selectCritics } = await import('@/lib/content-recipes');
  vi.mocked(selectCritics).mockResolvedValueOnce([]);

  const recipeCopy = {
    ...recipes.website,
    namedCritics: ['nonexistent-advisor', 'shirin-oreizy'],
  };
  const freshTools = createCritiqueTools('warn-run', ideaId, recipeCopy);

  mockRedis.get
    .mockResolvedValueOnce('Test draft')
    .mockResolvedValueOnce(null);

  mockCreate.mockResolvedValueOnce({
    content: [
      {
        type: 'tool_use',
        id: 'c1',
        name: 'submit_critique',
        input: { score: 7, pass: true, issues: [] },
      },
    ],
  });

  const tool = freshTools.find((t) => t.name === 'run_critiques')!;
  const result = (await tool.execute({})) as {
    critiques: Array<{ advisorId: string }>;
  };

  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining('nonexistent-advisor'),
  );
  // Only shirin-oreizy should run (nonexistent was skipped)
  expect(result.critiques).toHaveLength(1);
  expect(result.critiques[0].advisorId).toBe('shirin-oreizy');

  warnSpy.mockRestore();
});

it('falls back to named critics when selectCritics throws', async () => {
  const { selectCritics } = await import('@/lib/content-recipes');
  vi.mocked(selectCritics).mockRejectedValueOnce(
    new Error('LLM parse failed'),
  );

  const recipeCopy = {
    ...recipes.website,
    namedCritics: ['shirin-oreizy'],
  };
  const freshTools = createCritiqueTools('fallback-run', ideaId, recipeCopy);

  mockRedis.get
    .mockResolvedValueOnce('Test draft')
    .mockResolvedValueOnce(null);

  mockCreate.mockResolvedValueOnce({
    content: [
      {
        type: 'tool_use',
        id: 'c1',
        name: 'submit_critique',
        input: { score: 6, pass: true, issues: [] },
      },
    ],
  });

  const tool = freshTools.find((t) => t.name === 'run_critiques')!;
  const result = (await tool.execute({})) as {
    critiques: Array<{ advisorId: string }>;
  };

  // Should fall back to named critics only
  expect(result.critiques).toHaveLength(1);
  expect(result.critiques[0].advisorId).toBe('shirin-oreizy');
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/critique-tools.test.ts`
Expected: New tests fail — `run_critiques` doesn't accept `advisorIds`, doesn't resolve named critics, doesn't catch `selectCritics` failures.

**Step 3: Implement named critic merging and advisorIds support**

In `src/lib/agent-tools/critique.ts`, replace the `run_critiques` tool definition (lines 250-311). The key changes:

1. Add `advisorIds` to the input schema
2. On first call: resolve `namedCritics` from registry, call `selectCritics` wrapped in try/catch, merge and deduplicate
3. On subsequent calls with `advisorIds`: filter `selectedCritics` to the subset

```typescript
{
  name: 'run_critiques',
  description:
    'Run critique cycle with selected advisors. Optionally specify advisorIds to run a subset.',
  input_schema: {
    type: 'object',
    properties: {
      advisorIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional subset of critic IDs to run. Omit to run all assigned critics.',
      },
    },
    required: [],
  },
  execute: async (input) => {
    const advisorIds = input.advisorIds as string[] | undefined;

    // Read draft
    const draft = await getRedis().get<string>(`draft:${runId}`);
    if (!draft) return { error: 'No draft found — call generate_draft first' };

    // Select critics (first time only)
    if (selectedCritics.length === 0) {
      // Step 1: Resolve named critics from registry
      const namedCriticEntries: AdvisorEntry[] = [];
      for (const id of recipe.namedCritics ?? []) {
        const entry = advisorRegistry.find((a) => a.id === id);
        if (entry) {
          namedCriticEntries.push(entry);
        } else {
          console.warn(
            `[run_critiques] Named critic '${id}' not found in registry — skipping`,
          );
        }
      }

      // Step 2: Run selectCritics for dynamic additions, with fallback
      let dynamicCritics: AdvisorEntry[] = [];
      try {
        dynamicCritics = await selectCritics(recipe, advisorRegistry);
      } catch (error) {
        console.warn(
          '[run_critiques] selectCritics failed, falling back to named critics only:',
          error instanceof Error ? error.message : error,
        );
      }

      // Step 3: Deduplicate by advisor ID
      const seen = new Set<string>();
      selectedCritics = [];
      for (const critic of [...namedCriticEntries, ...dynamicCritics]) {
        if (!seen.has(critic.id)) {
          seen.add(critic.id);
          selectedCritics.push(critic);
        }
      }

      // Update progress with selected critics
      const progressKey = `pipeline_progress:${runId}`;
      const existing = await getRedis().get<PipelineProgress>(progressKey);
      if (existing) {
        existing.selectedCritics = selectedCritics.map((a) => ({
          advisorId: a.id,
          name: a.name,
        }));
        await getRedis().set(progressKey, JSON.stringify(existing), {
          ex: PROGRESS_TTL,
        });
      }
    }

    // Determine which critics to run this call
    let criticsToRun = selectedCritics;
    if (advisorIds && advisorIds.length > 0) {
      criticsToRun = selectedCritics.filter((c) =>
        advisorIds.includes(c.id),
      );
    }

    if (criticsToRun.length === 0) {
      return { critiques: [], message: 'No matching critics found' };
    }

    // Run critic calls with p-limit(2) concurrency
    const limit = pLimit(2);
    const results = await Promise.allSettled(
      criticsToRun.map((advisor) =>
        limit(() => runSingleCritic(advisor, draft, recipe, ideaId)),
      ),
    );

    const critiques: AdvisorCritique[] = results.map((result, idx) => {
      if (result.status === 'fulfilled') return result.value;
      return {
        advisorId: criticsToRun[idx].id,
        name: criticsToRun[idx].name,
        score: 0,
        pass: false,
        issues: [],
        error:
          result.reason instanceof Error
            ? result.reason.message
            : 'Critic call failed',
      };
    });

    return { critiques };
  },
},
```

**Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/critique-tools.test.ts`
Expected: All tests pass.

**Step 5: Commit**

```
git add src/lib/agent-tools/critique.ts src/lib/__tests__/critique-tools.test.ts
git commit -m "feat: add advisorIds param and named critic merging to run_critiques"
```

---

### Task 7: Replace procedural system prompt with goal-oriented template

**Files:**
- Modify: `src/lib/content-critique-agent.ts:20-48` (buildSystemPrompt function)

**Step 1: Create new test file for the system prompt**

Create `src/lib/__tests__/content-critique-agent.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock everything the module imports
vi.mock('@/lib/redis', () => ({
  getRedis: () => ({
    set: vi.fn(),
    get: vi.fn(),
  }),
  isRedisConfigured: () => true,
}));

vi.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({ messages: { create: vi.fn() } }),
}));

vi.mock('@/lib/config', () => ({
  CLAUDE_MODEL: 'claude-test-model',
}));

vi.mock('@/lib/db', () => ({
  getFoundationDoc: vi.fn(),
  getAllFoundationDocs: vi.fn(),
}));

vi.mock('@/lib/advisors/prompt-loader', () => ({
  getAdvisorSystemPrompt: vi.fn(),
}));

vi.mock('@/lib/agent-runtime', () => ({
  runAgent: vi.fn(),
  resumeAgent: vi.fn(),
  getAgentState: vi.fn().mockResolvedValue(null),
  deleteAgentState: vi.fn(),
  saveActiveRun: vi.fn(),
  getActiveRunId: vi.fn().mockResolvedValue(null),
  clearActiveRun: vi.fn(),
}));

vi.mock('@/lib/agent-tools/common', () => ({
  createPlanTools: vi.fn().mockReturnValue([]),
  createScratchpadTools: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/agent-tools/foundation', () => ({
  createFoundationTools: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/agent-tools/critique', () => ({
  createCritiqueTools: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/frameworks/framework-loader', () => ({
  getFrameworkPrompt: vi.fn(),
}));

// We need to access buildSystemPrompt — it's not exported.
// Instead, test the system prompt via the AgentConfig passed to runAgent.
import { runAgent } from '@/lib/agent-runtime';

describe('content-critique-agent system prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runAgent).mockResolvedValue({
      runId: 'test-run',
      agentId: 'content-critique',
      status: 'complete',
      messages: [],
      turnCount: 1,
      resumeCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    });
  });

  it('uses goal-oriented language, not procedural steps', async () => {
    const { runContentCritiquePipeline } = await import(
      '@/lib/content-critique-agent'
    );

    await runContentCritiquePipeline('idea-1', 'website', 'Test context');

    const config = vi.mocked(runAgent).mock.calls[0][0];
    const prompt = config.systemPrompt;

    // Goal-oriented markers
    expect(prompt).toContain('Your goal');
    expect(prompt).toContain('TOOLS AVAILABLE');
    expect(prompt).toContain('EDITOR RUBRIC');
    expect(prompt).toContain('CONSTRAINTS');
    expect(prompt).toContain('You decide the sequence');

    // Should NOT contain procedural markers
    expect(prompt).not.toContain('Procedure:');
    expect(prompt).not.toMatch(/^1\. Call generate_draft/m);
  });

  it('includes recipe values in system prompt', async () => {
    const { runContentCritiquePipeline } = await import(
      '@/lib/content-critique-agent'
    );

    await runContentCritiquePipeline('idea-1', 'website', 'Test context');

    const config = vi.mocked(runAgent).mock.calls[0][0];
    const prompt = config.systemPrompt;

    expect(prompt).toContain('website');
    expect(prompt).toContain('4'); // minAggregateScore
    expect(prompt).toContain('3'); // maxRevisionRounds
  });

  it('lists available critics with focus areas', async () => {
    // This test verifies the AVAILABLE CRITICS section is populated.
    // Since critics come from the registry and the recipe's namedCritics,
    // we need to verify the prompt builder reads from the registry.
    const { runContentCritiquePipeline } = await import(
      '@/lib/content-critique-agent'
    );

    await runContentCritiquePipeline('idea-1', 'website', 'Test context');

    const config = vi.mocked(runAgent).mock.calls[0][0];
    const prompt = config.systemPrompt;

    expect(prompt).toContain('AVAILABLE CRITICS');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/content-critique-agent.test.ts`
Expected: Fails — prompt still contains procedural language.

**Step 3: Replace buildSystemPrompt with goal-oriented template**

> **Behavior change:** The agent now has discretion over tool call ordering and can choose which critics to re-run after revision. The rubric rules are still enforced mechanically by `editor_decision`, but the agent decides when to call each tool. The old procedural prompt dictated exact sequencing; the new goal-oriented prompt provides constraints and lets the agent choose. Monitor first few production runs to verify the agent doesn't skip `summarize_round` or `editor_decision`.

In `src/lib/content-critique-agent.ts`, add import at top:

```typescript
import { advisorRegistry } from './advisors/registry';
```

Replace `buildSystemPrompt` function (lines 20-48):

```typescript
function buildSystemPrompt(recipe: ContentRecipe): string {
  // Build critic list from registry — all advisors with evaluationExpertise
  // (named + potential dynamic selections). The agent uses this for intelligent re-critique.
  const criticsList = advisorRegistry
    .filter((a) => a.evaluationExpertise && a.id !== recipe.authorAdvisor)
    .map((a) => `- ${a.id} (${a.name}): ${a.evaluationExpertise}`)
    .join('\n');

  return `You are a content pipeline orchestrator. Your goal: produce ${recipe.contentType} content that passes the editor quality rubric.

TOOLS AVAILABLE:
- generate_draft: Create initial content using the assigned author advisor
- run_critiques(advisorIds?): Get evaluations from critics (all, or a named subset)
- editor_decision(critiques): Apply mechanical rubric -> returns 'approve' or 'revise' with brief
- revise_draft(brief): Revise current draft addressing the editor's brief
- summarize_round(round, critiques, decision): Record round data, returns do-not-regress list
- save_content(quality): Persist final content
- load_foundation_docs(docTypes?): Load reference documents if needed

EDITOR RUBRIC (you do not override these rules):
- Any high-severity issue -> must revise
- No high issues + avg score >= ${recipe.minAggregateScore} -> approve
- No high issues + avg < ${recipe.minAggregateScore} -> revise
- Scores decreasing from previous round -> approve (oscillation guard)

CONSTRAINTS:
- Maximum ${recipe.maxRevisionRounds} revision rounds
- Always call summarize_round after each critique+decision cycle
- Always call editor_decision with critique results -- do not self-judge quality, even if all critics errored (pass the results as-is)
- After max rounds without approval: save_content(quality='max-rounds-reached')

AVAILABLE CRITICS:
${criticsList}

You decide the sequence. Typical approaches include drafting then running all critics, or targeted re-critique of specific dimensions after revision. Use your judgment about which critics to re-run based on what you changed.`;
}
```

**Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/content-critique-agent.test.ts`
Expected: All 3 tests pass.

**Step 5: Commit**

```
git add src/lib/content-critique-agent.ts src/lib/__tests__/content-critique-agent.test.ts
git commit -m "feat: replace procedural system prompt with goal-oriented template"
```

---

### Task 8: Remove `steps` from PipelineProgress and drop PipelineStep type

**Files:**
- Modify: `src/types/index.ts:404-420`
- Modify: `src/lib/content-critique-agent.ts:50-70` (makeInitialProgress)

**Step 1: Remove `steps` from PipelineProgress and delete PipelineStep**

In `src/types/index.ts`, update `PipelineProgress` (lines 404-414) to remove the `steps` field:

```typescript
export interface PipelineProgress {
  status: 'running' | 'complete' | 'error' | 'max-rounds-reached';
  contentType: string;
  currentStep: string;
  round: number;
  maxRounds: number;
  quality: 'approved' | 'max-rounds-reached' | null;
  selectedCritics: { advisorId: string; name: string }[];
  critiqueHistory: CritiqueRound[];
}
```

Delete the `PipelineStep` interface (lines 416-420):
```typescript
// DELETE these lines:
// export interface PipelineStep {
//   name: string;
//   status: 'pending' | 'running' | 'complete' | 'error';
//   detail?: string;
// }
```

**Step 2: Update makeInitialProgress to remove steps array**

In `src/lib/content-critique-agent.ts`, update `makeInitialProgress` (lines 50-70):

```typescript
function makeInitialProgress(
  contentType: string,
  maxRounds: number,
): PipelineProgress {
  return {
    status: 'running',
    contentType,
    currentStep: 'Starting content generation...',
    round: 0,
    maxRounds,
    quality: null,
    selectedCritics: [],
    critiqueHistory: [],
  };
}
```

**Step 3: Remove any imports of PipelineStep**

Search for `PipelineStep` imports across the codebase. The only runtime consumer of `PipelineStep` is `makeInitialProgress` in `content-critique-agent.ts`, which Task 8 Step 2 already replaces. No other file imports `PipelineStep` by name. Verify:

Run: `npx vitest run src/lib/__tests__/content-critique-agent.test.ts src/lib/__tests__/critique-tools.test.ts src/lib/__tests__/critique-pipeline.integration.test.ts`
Expected: All tests pass. None reference `PipelineStep` or `steps` on progress objects.

**Step 4: Run full build to catch type errors**

Run: `npm run build`
Expected: Build succeeds with no type errors from the `PipelineStep` removal or the `steps` field removal.

**Step 5: Commit**

```
git add src/types/index.ts src/lib/content-critique-agent.ts
git commit -m "feat: remove PipelineStep type and fixed steps array from progress"
```

---

### Task 9: Update frontend progress UI from step-based to round-based

**Files:**
- Modify: `src/app/analyses/[id]/content/generate/page.tsx`

**Important context:** This page currently serves the Phase 1 content generation flow, polling `/api/content/${analysisId}/generate`. The design doc specifies replacing the step-checklist progress display with a round-based display for the content critique pipeline. The Phase 1 `ContentGenerationProgress` interface uses `steps: ContentStep[]` for its own progress — this is a local interface, not `PipelineProgress`. The `PipelineProgress` type (with `steps` now removed) is served by `/api/content-pipeline/[ideaId]`.

Since the content critique pipeline needs a progress UI and the design doc explicitly lists this file, we'll update the page to handle both Phase 1 (step-based from `/api/content/${id}/generate`) and Phase 2 (round-based from `/api/content-pipeline/${id}`). The page will detect which mode to display based on a query parameter (`?pipeline=critique`).

**Step 1: Add round-based progress display alongside step-based display**

Update `src/app/analyses/[id]/content/generate/page.tsx`:

1. Add a `PipelineCritiqueProgress` interface for the content pipeline response:

```typescript
interface PipelineCritiqueProgress {
  status: 'running' | 'complete' | 'error' | 'max-rounds-reached' | 'not_started';
  contentType: string;
  currentStep: string;
  round: number;
  maxRounds: number;
  quality: 'approved' | 'max-rounds-reached' | null;
  selectedCritics: { advisorId: string; name: string }[];
}
```

2. Add `useSearchParams` import and detect mode. **Important:** `useSearchParams()` in Next.js App Router requires a `<Suspense>` boundary — wrap the component or the search params usage in `<Suspense>` to avoid build warnings or static rendering opt-out:

```typescript
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// Inside component:
const searchParams = useSearchParams();
const pipelineMode = searchParams.get('pipeline') === 'critique';
```

Wrap the default export:
```typescript
function ContentGeneratePageInner() {
  // ... existing component body with useSearchParams
}

export default function ContentGeneratePage() {
  return (
    <Suspense>
      <ContentGeneratePageInner />
    </Suspense>
  );
}
```

3. When `pipelineMode` is true, poll `/api/content-pipeline/${analysisId}` instead and render round-based progress:

```typescript
// Round-based progress display (inside the progress card, replacing the step list):
{pipelineMode && critiqueProgress && (
  <div className="space-y-4 mb-6 animate-slide-up stagger-3">
    {/* Round indicator */}
    <div
      className="p-4 rounded-lg text-center"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="text-2xl font-display mb-1" style={{ color: 'var(--text-primary)' }}>
        Round {critiqueProgress.round} of {critiqueProgress.maxRounds}
      </div>
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {critiqueProgress.currentStep}
      </div>
    </div>

    {/* Selected critics */}
    {critiqueProgress.selectedCritics.length > 0 && (
      <div className="flex flex-wrap gap-2">
        {critiqueProgress.selectedCritics.map((c) => (
          <span
            key={c.advisorId}
            className="px-2 py-1 rounded text-xs"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            {c.name}
          </span>
        ))}
      </div>
    )}
  </div>
)}
```

4. Adjust the progress bar for pipeline mode to use round-based progress:

```typescript
const progressPercent = pipelineMode
  ? critiqueProgress
    ? critiqueProgress.status === 'complete' || critiqueProgress.status === 'max-rounds-reached'
      ? 100
      : Math.max(10, (critiqueProgress.round / critiqueProgress.maxRounds) * 100)
    : 0
  : (completedCount / totalSteps) * 100;
```

This is a substantial UI change. The existing step-based rendering spans lines 203-275 (the full `{steps.map(...)}` block with status icons and styling). The full implementation should keep this Phase 1 step-based rendering for non-pipeline mode and add the round-based alternative for pipeline mode.

**Step 2: Verify build succeeds**

Run: `npm run build`
Expected: Build passes.

**Step 3: Commit**

```
git add src/app/analyses/[id]/content/generate/page.tsx
git commit -m "feat: add round-based progress display for content critique pipeline"
```

---

### Task 10: Run integration tests and full test suite

**Files:**
- No new files

**Step 1: Run critique pipeline integration tests**

Run: `npx vitest run src/lib/__tests__/critique-pipeline.integration.test.ts`
Expected: All 4 tests pass. The integration tests use `recipes.website` which now has `julian-shapiro` as author and `namedCritics`, but since `selectCritics` is mocked, the integration flow should be unaffected.

**Step 2: Run editor-decision tests (regression)**

Run: `npx vitest run src/lib/__tests__/editor-decision.test.ts`
Expected: All 8 tests pass — rubric logic is unchanged.

**Step 3: Run advisor-prompt-loader tests**

Run: `npx vitest run src/lib/__tests__/advisor-prompt-loader.test.ts`
Expected: All tests pass — prompt loader is unchanged.

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

**Step 5: Run build**

Run: `npm run build`
Expected: Build succeeds.

**Step 6: Run lint**

Run: `npm run lint`
Expected: No new lint errors.

---

### Task 11: Update architecture doc

**Files:**
- Modify: `docs/architecture.md`

**Step 1: Update the Virtual Board section**

In `docs/architecture.md`, the Virtual Board section (line 238-242) references "4 advisors" — update to "13 advisors" to match the current registry count. Also update the advisory listing.

**Step 2: Update the Content Critique Agent description**

The critique tools description at line 157 lists the tools. Update to note the `advisorIds` parameter on `run_critiques` and framework injection on `generate_draft`/`revise_draft`.

**Step 3: Commit**

```
git add docs/architecture.md
git commit -m "docs: update architecture doc for goal-oriented pipeline and named critics"
```

---

## Manual Steps (Post-Automation)

- [ ] Create the `landing-page-assembly` framework via `/add-framework` skill if not yet done. The website recipe references it, and while the pipeline gracefully degrades without it, drafts will lack structural framework guidance.
- [ ] Deploy to Vercel and verify the content pipeline API still works for existing `blog-post` and `social-post` recipes (no `authorFramework`, no `namedCritics` — should behave identically to before).
- [ ] Test the website recipe end-to-end by triggering `POST /api/content-pipeline/{ideaId}` with `{ "contentType": "website" }` on a real idea that has all three foundation docs (`positioning`, `brand-voice`, `seo-strategy`).

---

## Decision Log

### Summary
| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Frontend progress UI approach | Dual-mode page with query param detection | Separate page for pipeline, or single page replacing Phase 1 |
| 2 | Named critic deduplication order | Named first, then dynamic | Dynamic first then named, or alphabetical merge |
| 3 | Test approach for buildSystemPrompt | Test via runAgent mock capturing config | Export buildSystemPrompt for direct testing |
| 4 | selectCritics fallback placement | Inside run_critiques tool | Inside selectCritics function itself |

### Appendix: Decision Details

#### Decision 1: Frontend progress UI approach
**Chose:** Dual-mode page with `?pipeline=critique` query parameter
**Why:** The design doc specifies modifying `generate/page.tsx`, but this page serves the Phase 1 content generation flow with a completely different API endpoint (`/api/content/${id}/generate` vs `/api/content-pipeline/${id}`). Replacing the step-based display entirely would break Phase 1. A dual-mode approach preserves Phase 1 functionality while adding the round-based display for Phase 2. The query parameter detection is lightweight and avoids creating a new page.
**Alternatives rejected:**
- Separate page: Would require new route, URL navigation changes, and duplicates shared UI (error states, loading, redirect logic). More files for minimal benefit.
- Replace Phase 1 display: Would break the existing content generation flow that other content types use.

#### Decision 2: Named critic deduplication order
**Chose:** Named critics first in the merged array, then dynamic additions
**Why:** Named critics are the guaranteed minimum for a content type. Placing them first ensures they appear in progress displays and run first in the concurrency-limited queue. If a named critic appears in both lists, the first occurrence (from named) wins during deduplication.
**Alternatives rejected:**
- Dynamic first: Would deprioritize the guaranteed critics that the recipe designer explicitly chose.

#### Decision 3: Test approach for buildSystemPrompt
**Chose:** Test indirectly by mocking `runAgent` and inspecting the `config.systemPrompt` argument
**Why:** `buildSystemPrompt` is an unexported private function. Exporting it just for testing would leak implementation details. Testing via the public API (`runContentCritiquePipeline`) and capturing what gets passed to `runAgent` tests the actual behavior — the system prompt that the agent runtime receives.
**Alternatives rejected:**
- Export buildSystemPrompt: Leaks implementation detail. The function signature may change (e.g., accept critic list) without the plan needing a test update.

#### Decision 4: selectCritics fallback placement
**Chose:** Try/catch inside `run_critiques` tool execute function, falling back to named critics
**Why:** Design doc explicitly states: "the catch lives here in `run_critiques`, not in `selectCritics` itself." This keeps `selectCritics` as a clean function that throws on parse errors, making it testable in isolation. The fallback logic (use named critics) is specific to the pipeline tool, not to the selection function.
**Alternatives rejected:**
- Inside selectCritics: Would couple the fallback strategy to the utility function. Different callers might want different fallback behavior.
