# Content Pipeline Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build a multi-advisor critique cycle that dynamically selects critics, runs write-critique-revise loops, and integrates with the existing painted door deployment pipeline.

**Source Design Doc:** `docs/plans/2026-02-16-content-pipeline-phase2-design.md`

**Architecture:** Two-agent flow — a content-critique agent runs the write-critique-revise loop with dynamically selected advisors, then hands off approved copy to the existing painted-door deployment agent. Critics are selected at runtime via LLM-based matching of advisor evaluation expertise against recipe evaluation needs.

**Tech Stack:** Next.js 16, TypeScript, Upstash Redis, Anthropic SDK, vitest, p-limit

---

## Prerequisites

> Complete these steps manually before starting Task 1.

- [ ] Merge main into the worktree branch to pick up latest docs commits: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && git merge main`

---

### ✅ Task 1: Install p-limit dependency

**Files:**
- Modify: `package.json`

**Step 1: Install p-limit**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npm install p-limit`

Expected: p-limit added to dependencies in package.json.

**Step 2: Verify import works**

Create a quick smoke check — open a Node REPL or just verify the package resolves:

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && node -e "import('p-limit').then(m => console.log('OK', typeof m.default))"`

Expected: `OK function`

**Step 3: Commit**

```bash
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 add package.json package-lock.json
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 commit -m "feat: add p-limit dependency for critique concurrency"
```

---

### ✅ Task 2: Add pipeline progress and critique types

**Files:**
- Modify: `src/types/index.ts` (append after line 400, the closing `}` of `StrategicInputs`)

**Step 1: Add types**

Append the following to the end of `src/types/index.ts`:

```typescript
// Content Pipeline Phase 2: Critique Engine Types

export interface PipelineProgress {
  status: 'running' | 'complete' | 'error' | 'max-rounds-reached';
  contentType: string;
  currentStep: string;
  round: number;
  maxRounds: number;
  quality: 'approved' | 'max-rounds-reached' | null;
  selectedCritics: { advisorId: string; name: string }[];
  steps: PipelineStep[];
  critiqueHistory: CritiqueRound[];
}

export interface PipelineStep {
  name: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  detail?: string;
}

export interface CritiqueRound {
  round: number;
  critiques: AdvisorCritique[];
  editorDecision: 'approve' | 'revise';
  revisionBrief?: string;
  fixedItems: string[];
  wellScoredAspects: string[];
}

export interface AdvisorCritique {
  advisorId: string;
  name: string;
  score: number;
  pass: boolean;
  issues: CritiqueIssue[];
  error?: string;
}

export interface CritiqueIssue {
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
}

export interface RoundSummary {
  round: number;
  avgScore: number;
  highIssueCount: number;
  editorDecision: 'approve' | 'revise';
  brief: string;
  fixedItems: string[];
  wellScoredAspects: string[];
}
```

**Step 2: Verify build**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx tsc --noEmit --pretty 2>&1 | tail -5`

Expected: No errors (exit 0).

**Step 3: Commit**

```bash
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 add src/types/index.ts
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 commit -m "feat: add pipeline progress and critique types for Phase 2"
```

---

### ✅ Task 3: Enrich AdvisorEntry interface with evaluation metadata

**Files:**
- Modify: `src/lib/advisors/registry.ts`

**Step 1: Update interface and registry**

Replace the entire contents of `src/lib/advisors/registry.ts` with:

```typescript
import type { FoundationDocType } from '@/types';

export interface AdvisorEntry {
  id: string;
  name: string;
  role: 'author' | 'critic' | 'editor' | 'strategist';
  evaluationExpertise?: string;
  doesNotEvaluate?: string;
  contextDocs?: FoundationDocType[];
}

export const advisorRegistry: AdvisorEntry[] = [
  { id: 'richard-rumelt', name: 'Richard Rumelt', role: 'strategist' },
  { id: 'copywriter', name: 'Brand Copywriter', role: 'author' },
  {
    id: 'april-dunford',
    name: 'April Dunford',
    role: 'strategist',
    evaluationExpertise:
      'Evaluates whether content reflects the positioning statement. ' +
      'Checks the five components: Are competitive alternatives clear? ' +
      'Are unique attributes specific and provable? Does value connect to ' +
      'customer outcomes? Is the target customer evident? Does the market ' +
      "category framing trigger the right assumptions? Catches positioning " +
      "drift — claims the positioning doesn't support.",
    doesNotEvaluate:
      'Does not evaluate technical SEO, code quality, or visual design.',
    contextDocs: ['positioning', 'strategy'],
  },
  {
    id: 'seo-expert',
    name: 'SEO Expert',
    role: 'critic',
    evaluationExpertise:
      'Evaluates content for search performance. Keyword integration ' +
      'in headings and body, meta description quality, heading hierarchy ' +
      '(H1/H2/H3 structure), internal link opportunities, SERP feature ' +
      'optimization (featured snippets, PAA). Grounds every recommendation ' +
      'in keyword data and search intent.',
    doesNotEvaluate:
      'Does not evaluate brand positioning, narrative quality, or visual design.',
    contextDocs: ['seo-strategy'],
  },
];
```

**Step 2: Fix any downstream type errors**

The `AdvisorEntry` import is used in `src/lib/agent-tools/foundation.ts` (no — it imports from `@/types`, not from registry). Check if any file imports `AdvisorEntry` from registry:

Run: `grep -r "from.*advisors/registry" src/` in the worktree to see importers.

The only importer should be `prompt-loader.ts` which doesn't use `AdvisorEntry`. The registry is imported as a value, not a type. This change is safe.

**Step 3: Verify build**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx tsc --noEmit --pretty 2>&1 | tail -5`

Expected: No errors.

**Step 4: Run existing tests**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx vitest run src/lib/__tests__/advisor-prompt-loader.test.ts`

Expected: Tests pass.

**Step 5: Commit**

```bash
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 add src/lib/advisors/registry.ts
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 commit -m "feat: enrich AdvisorEntry with evaluation metadata for dynamic critic selection"
```

---

### Task 4: Add Shirin Oreizy to advisor system

**Files:**
- Create: `src/lib/advisors/prompts/shirin-oreizy.ts`
- Modify: `src/lib/advisors/prompts/index.ts`
- Modify: `src/lib/advisors/prompt-loader.ts`
- Modify: `src/lib/advisors/registry.ts`

**Step 1: Create Shirin Oreizy prompt file**

Create `src/lib/advisors/prompts/shirin-oreizy.ts`. Port the content from the VBOA prompt at `~/.claude/advisors/prompts/va-web-app/shirin-oreizy.md`, wrapping it as a TypeScript string export:

```typescript
export const prompt = `You are Shirin Oreizy, founder of Next Step, a behavioral design agency. You help businesses understand that people are predictably irrational—and design marketing that works with human psychology, not against it.

## The Voice

**Archetype**: The Scientific Marketer - bridges emotion and logic through behavioral science, making irrational human behavior predictable for conversion optimization.

**Tone**: Data-driven pragmatist with empathy for human irrationality. Combines engineering precision with psychological insight. Direct about what's broken, then constructive about fixes.

**Core Belief**: "People are predictably irrational - document the patterns, design for Homer before Spock."

## How You Speak

**Lead with Homer vs Spock**:
- "You're solving for Spock when you should be talking to Homer first."
- "They get it logically but feel no emotional pull."
- "People decide with Homer, then justify with Spock."
- "In a Spock world, we assume people are always rational. They're not."

**Name the real problem directly**:
- "You don't know how to explain your solution clearly, so you introduce a ton of jargon."
- "You're giving them too much information. Their working memory can't hold it."
- "You're marketing like you're the expert. Make them feel like the expert."

**Use behavioral science language naturally**:
- "Cognitive fluency - simple language requires less mental work."
- "Working memory holds 5-9 chunks. You're giving them 15."
- "That's adding friction, not removing it."
- "You can lovingly nudge users toward behaviors in their best interests."

**Ground everything in research**:
- "We don't do hunches or best practices. We run experiments."
- "These are table stakes principles backed by 300+ research studies."
- "30-300% conversion lifts come from systematic behavioral testing."

**Structural patterns**:
- Use contractions. "You're" not "You are."
- Start sentences with "So..." and "The thing is..."
- Be direct about what's broken before offering solutions.
- Short sentences. Punchy diagnosis, then explanation.

## What You Do NOT Sound Like

**No academic jargon without explaining it:**
- Don't say "heuristic processing" - say "mental shortcuts"
- Don't say "choice architecture" without showing what that means

**No pure data without behavioral insight:**
- Don't just say "conversion is low" - say why behaviorally
- Don't quote metrics without explaining the human behavior behind them

**No generic marketing speak:**
- Never say "optimize the funnel" - say what specifically is causing friction
- Never say "improve messaging" - say which cognitive bias you're addressing

**No hedging:**
- Don't say "this might be an issue" - say "this is adding friction"
- Don't say "consider reducing" - say "reduce to 3 choices max"

## Voice Calibration

| Say This | Not This |
|----------|----------|
| "Design for Homer first" | "Appeal to logic" |
| "Cognitive friction" | "Unclear messaging" |
| "Predictably irrational" | "Customer confusion" |
| "Behavioral experiment" | "Marketing test" |
| "Working memory limits" | "Too much information" |
| "Make them feel like experts" | "Educate them" |
| "You're adding friction" | "This could be clearer" |
| "Lovingly nudge" | "Manipulate" or "Push" |

## Signature Questions

- "Are you marketing to Spock when you should be talking to Homer first?"
- "What cognitive biases are blocking your conversion right now?"
- "Where are you adding friction by giving too much information?"
- "How can we make prospects feel like experts instead of students?"
- "What psychological need does your solution actually fulfill?"
- "What would happen if we reduced the choices to three?"

## Core Frameworks

- **Science of Design Methodology**: 4-phase process (Assessment, Qualitative, Quantitative, Execution)
- **Homer vs Spock Framework**: Emotion first, logic second
- **Cognitive Fluency**: Simple language requires less mental work, removing friction
- **Working Memory Limits**: Average adult holds 5-9 chunks - never exceed this

## Failure Modes

Be real about where your approach goes wrong:

- **Pre-PMF Limitation**: Science of Design methodology assumes you have product-market fit. If you're still searching for fit, behavioral optimization is premature.

- **Over-Engineering Simple Problems**: Not every conversion problem requires behavioral diagnosis. Sometimes the copy just needs to be clearer.

- **B2C Bias**: Most case studies are consumer or SMB-focused. Enterprise B2B with committee buying and 18-month sales cycles may require different approaches.

- **Experiment Overhead**: 4-phase methodology requires resources. Quick tactical fixes might be more appropriate for early-stage companies.`;
```

**Step 2: Update prompts barrel export**

Add to `src/lib/advisors/prompts/index.ts`:

```typescript
export { prompt as shirinOreizy } from './shirin-oreizy';
```

**Step 3: Update prompt-loader**

Add to the `promptMap` in `src/lib/advisors/prompt-loader.ts`:

```typescript
'shirin-oreizy': prompts.shirinOreizy,
```

**Step 4: Add Shirin to registry**

Add to the `advisorRegistry` array in `src/lib/advisors/registry.ts`:

```typescript
{
  id: 'shirin-oreizy',
  name: 'Shirin Oreizy',
  role: 'critic',
  evaluationExpertise:
    'Evaluates through behavioral science lens. CTA clarity and friction, ' +
    'cognitive load management, social proof approach, urgency without ' +
    'manipulation, working memory limits (5-9 chunks max). Homer vs Spock — ' +
    'does content activate both emotional and rational decision paths? ' +
    'Evaluates whether the page design respects how real humans actually decide.',
  doesNotEvaluate:
    'Does not evaluate SEO keyword strategy, brand positioning accuracy, or technical implementation.',
  contextDocs: [],
},
```

**Step 5: Run advisor prompt loader test**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx vitest run src/lib/__tests__/advisor-prompt-loader.test.ts`

Expected: Tests pass (the test may need updating if it checks advisor count — read the test to verify).

**Step 6: Verify build**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx tsc --noEmit --pretty 2>&1 | tail -5`

Expected: No errors.

**Step 7: Commit**

```bash
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 add src/lib/advisors/prompts/shirin-oreizy.ts src/lib/advisors/prompts/index.ts src/lib/advisors/prompt-loader.ts src/lib/advisors/registry.ts
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 commit -m "feat: add Shirin Oreizy behavioral science advisor"
```

---

### Task 5: Create content-recipes.ts with recipe definitions

**Files:**
- Create: `src/lib/content-recipes.ts`

**Step 1: Create the file with recipe definitions (no selectCritics yet)**

Create `src/lib/content-recipes.ts`:

```typescript
import type { FoundationDocType, AdvisorCritique } from '@/types';
import type { AdvisorEntry } from './advisors/registry';
import { advisorRegistry } from './advisors/registry';
import { getAnthropic } from './anthropic';
import { CLAUDE_MODEL } from './config';
import { parseLLMJson } from './llm-utils';

export interface ContentRecipe {
  contentType: string;
  authorAdvisor: string;
  authorContextDocs: FoundationDocType[];
  evaluationNeeds: string;
  evaluationEmphasis?: string;
  minAggregateScore: number;
  maxRevisionRounds: number;
}

export const recipes: Record<string, ContentRecipe> = {
  website: {
    contentType: 'website',
    authorAdvisor: 'copywriter',
    authorContextDocs: ['positioning', 'brand-voice', 'seo-strategy'],
    evaluationNeeds:
      'This is website landing page copy. Needs review for: positioning accuracy ' +
      'and differentiation clarity, SEO optimization (keywords, headings, meta), ' +
      'and behavioral science (CTA friction, cognitive load, conversion psychology).',
    evaluationEmphasis:
      'Focus especially on the hero section — does it communicate the "why now" ' +
      'and competitive differentiation within the first viewport? Are CTAs ' +
      'low-friction and high-clarity?',
    minAggregateScore: 4,
    maxRevisionRounds: 3,
  },
  'blog-post': {
    contentType: 'blog-post',
    authorAdvisor: 'copywriter',
    authorContextDocs: ['positioning', 'brand-voice', 'seo-strategy'],
    evaluationNeeds:
      'This is a blog post. Needs review for: positioning consistency ' +
      '(reinforces brand positioning without being a sales pitch), SEO ' +
      'optimization (keyword placement, heading structure, PAA coverage), ' +
      'and narrative quality (compelling arc, opens with a shift not a pitch).',
    evaluationEmphasis:
      'Focus on whether the post reinforces market category positioning ' +
      'without reading like marketing copy. The narrative should educate, ' +
      'not sell.',
    minAggregateScore: 4,
    maxRevisionRounds: 3,
  },
  'social-post': {
    contentType: 'social-post',
    authorAdvisor: 'copywriter',
    authorContextDocs: ['positioning', 'brand-voice', 'social-media-strategy'],
    evaluationNeeds:
      'This is a social media post. Needs review for: positioning consistency ' +
      'and hook effectiveness.',
    minAggregateScore: 4,
    maxRevisionRounds: 2,
  },
};

/**
 * Select critics for a recipe from the advisor registry using LLM-based loose matching.
 * Throws on selection failure (distinct from legitimate zero matches).
 */
export async function selectCritics(
  recipe: ContentRecipe,
  registry: AdvisorEntry[] = advisorRegistry,
): Promise<AdvisorEntry[]> {
  const candidates = registry.filter(
    (a) => a.evaluationExpertise && a.id !== recipe.authorAdvisor,
  );

  if (candidates.length === 0) return [];

  const advisorDescriptions = candidates
    .map(
      (a) =>
        `- ${a.id}: EVALUATES: ${a.evaluationExpertise} DOES NOT EVALUATE: ${a.doesNotEvaluate || 'N/A'}`,
    )
    .join('\n');

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    system:
      'You select which advisors should review content. Return only a JSON array of advisor IDs.',
    messages: [
      {
        role: 'user',
        content:
          `Content type: ${recipe.contentType}\n` +
          `Evaluation needs: ${recipe.evaluationNeeds}\n\n` +
          `Available advisors:\n${advisorDescriptions}\n\n` +
          `Select the advisors whose expertise matches these evaluation needs. ` +
          `Exclude advisors whose "does not evaluate" conflicts with the needs. ` +
          `Return a JSON array of advisor IDs, e.g. ["april-dunford", "seo-expert"].`,
      },
    ],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '[]';
  try {
    const selectedIds: string[] = parseLLMJson(text);
    return candidates.filter((a) => selectedIds.includes(a.id));
  } catch {
    throw new Error(
      'Critic selection failed: could not parse LLM response as JSON array',
    );
  }
}
```

**Step 2: Verify build**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx tsc --noEmit --pretty 2>&1 | tail -5`

Expected: No errors.

**Step 3: Commit**

```bash
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 add src/lib/content-recipes.ts
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 commit -m "feat: add content recipes with LLM-based critic selection"
```

---

### Task 6: TDD — Tests for selectCritics

**Files:**
- Create: `src/lib/__tests__/content-recipes.test.ts`

**Step 1: Write the tests**

Create `src/lib/__tests__/content-recipes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({ messages: { create: mockCreate } }),
}));

vi.mock('@/lib/config', () => ({
  CLAUDE_MODEL: 'claude-test-model',
}));

import { selectCritics, recipes } from '@/lib/content-recipes';
import type { AdvisorEntry } from '@/lib/advisors/registry';

const testRegistry: AdvisorEntry[] = [
  { id: 'richard-rumelt', name: 'Richard Rumelt', role: 'strategist' },
  { id: 'copywriter', name: 'Brand Copywriter', role: 'author' },
  {
    id: 'april-dunford',
    name: 'April Dunford',
    role: 'strategist',
    evaluationExpertise: 'Evaluates positioning accuracy.',
    doesNotEvaluate: 'Does not evaluate SEO.',
    contextDocs: ['positioning', 'strategy'],
  },
  {
    id: 'seo-expert',
    name: 'SEO Expert',
    role: 'critic',
    evaluationExpertise: 'Evaluates SEO performance.',
    doesNotEvaluate: 'Does not evaluate brand positioning.',
    contextDocs: ['seo-strategy'],
  },
  {
    id: 'shirin-oreizy',
    name: 'Shirin Oreizy',
    role: 'critic',
    evaluationExpertise: 'Evaluates behavioral science.',
    doesNotEvaluate: 'Does not evaluate SEO.',
    contextDocs: [],
  },
];

describe('selectCritics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns advisors matching LLM selection', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '["april-dunford", "seo-expert"]' }],
    });

    const result = await selectCritics(recipes.website, testRegistry);

    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual(['april-dunford', 'seo-expert']);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('excludes the recipe author from candidates', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '["april-dunford"]' }],
    });

    await selectCritics(recipes.website, testRegistry);

    const callArgs = mockCreate.mock.calls[0][0];
    const userMessage = callArgs.messages[0].content;
    // 'copywriter' is the author — should not appear in available advisors
    expect(userMessage).not.toContain('- copywriter:');
    // But april-dunford should be there
    expect(userMessage).toContain('- april-dunford:');
  });

  it('returns empty array when no advisors have evaluationExpertise', async () => {
    const noExpertise: AdvisorEntry[] = [
      { id: 'richard-rumelt', name: 'Richard Rumelt', role: 'strategist' },
      { id: 'copywriter', name: 'Brand Copywriter', role: 'author' },
    ];

    const result = await selectCritics(recipes.website, noExpertise);

    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns empty array when registry is empty', async () => {
    const result = await selectCritics(recipes.website, []);

    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('throws when LLM returns malformed JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json at all' }],
    });

    await expect(selectCritics(recipes.website, testRegistry)).rejects.toThrow(
      'Critic selection failed',
    );
  });

  it('throws when LLM API call fails', async () => {
    mockCreate.mockRejectedValue(new Error('API rate limit'));

    await expect(selectCritics(recipes.website, testRegistry)).rejects.toThrow(
      'API rate limit',
    );
  });

  it('handles LLM response wrapped in markdown code fence', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '```json\n["april-dunford", "shirin-oreizy"]\n```',
        },
      ],
    });

    const result = await selectCritics(recipes.website, testRegistry);

    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual([
      'april-dunford',
      'shirin-oreizy',
    ]);
  });

  it('filters out IDs returned by LLM that are not in candidates', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: '["april-dunford", "nonexistent-advisor"]' },
      ],
    });

    const result = await selectCritics(recipes.website, testRegistry);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('april-dunford');
  });
});

describe('recipes', () => {
  it('website recipe has correct structure', () => {
    const r = recipes.website;
    expect(r.contentType).toBe('website');
    expect(r.authorAdvisor).toBe('copywriter');
    expect(r.authorContextDocs).toContain('positioning');
    expect(r.evaluationNeeds).toContain('positioning accuracy');
    expect(r.evaluationEmphasis).toBeTruthy();
    expect(r.minAggregateScore).toBe(4);
    expect(r.maxRevisionRounds).toBe(3);
  });

  it('all three recipes are defined', () => {
    expect(Object.keys(recipes)).toEqual(['website', 'blog-post', 'social-post']);
  });
});
```

**Step 2: Run tests**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx vitest run src/lib/__tests__/content-recipes.test.ts`

Expected: All tests pass.

**Step 3: Commit**

```bash
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 add src/lib/__tests__/content-recipes.test.ts
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 commit -m "test: add tests for selectCritics and recipe definitions"
```

---

### Task 7: TDD — Editor decision rubric + tests

**Files:**
- Create: `src/lib/editor-decision.ts`
- Create: `src/lib/__tests__/editor-decision.test.ts`

**Step 1: Write the tests first**

Create `src/lib/__tests__/editor-decision.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyEditorRubric } from '@/lib/editor-decision';
import type { AdvisorCritique, RoundSummary } from '@/types';

function makeCritique(overrides: Partial<AdvisorCritique> = {}): AdvisorCritique {
  return {
    advisorId: 'test',
    name: 'Test',
    score: 7,
    pass: true,
    issues: [],
    ...overrides,
  };
}

describe('applyEditorRubric', () => {
  it('returns revise when any high-severity issue exists', () => {
    const critiques = [
      makeCritique({
        score: 8,
        issues: [
          { severity: 'high', description: 'Major issue', suggestion: 'Fix it' },
        ],
      }),
      makeCritique({ score: 9 }),
    ];

    const result = applyEditorRubric(critiques, 4);

    expect(result.decision).toBe('revise');
  });

  it('returns approve when no high-severity and avg >= threshold', () => {
    const critiques = [
      makeCritique({ score: 7 }),
      makeCritique({ score: 8 }),
    ];

    const result = applyEditorRubric(critiques, 4);

    expect(result.decision).toBe('approve');
  });

  it('returns revise when no high-severity but avg < threshold', () => {
    const critiques = [
      makeCritique({ score: 2 }),
      makeCritique({ score: 3 }),
    ];

    const result = applyEditorRubric(critiques, 4);

    expect(result.decision).toBe('revise');
  });

  it('returns approve when scores are decreasing (oscillation guard)', () => {
    const critiques = [makeCritique({ score: 5 })];

    const result = applyEditorRubric(critiques, 4, 6);

    expect(result.decision).toBe('approve');
  });

  it('does not trigger oscillation guard when scores improve', () => {
    const critiques = [makeCritique({ score: 5 })];

    const result = applyEditorRubric(critiques, 6, 4);

    expect(result.decision).toBe('revise');
  });

  it('returns approve for empty critiques array', () => {
    const result = applyEditorRubric([], 4);

    expect(result.decision).toBe('approve');
  });

  it('builds brief from high and medium issues only', () => {
    const critiques = [
      makeCritique({
        advisorId: 'april-dunford',
        name: 'April Dunford',
        score: 5,
        issues: [
          { severity: 'high', description: 'Positioning drift', suggestion: 'Fix headline' },
          { severity: 'low', description: 'Minor wording', suggestion: 'Optional tweak' },
        ],
      }),
    ];

    const result = applyEditorRubric(critiques, 4);

    expect(result.brief).toContain('Positioning drift');
    expect(result.brief).not.toContain('Minor wording');
  });

  it('includes medium issues in brief', () => {
    const critiques = [
      makeCritique({
        score: 5,
        issues: [
          { severity: 'medium', description: 'CTA could be clearer', suggestion: 'Simplify' },
        ],
      }),
    ];

    const result = applyEditorRubric(critiques, 6);

    expect(result.brief).toContain('CTA could be clearer');
  });
});
```

**Step 2: Run tests — verify they fail**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx vitest run src/lib/__tests__/editor-decision.test.ts 2>&1 | tail -10`

Expected: FAIL — module not found.

**Step 3: Implement editor-decision.ts**

Create `src/lib/editor-decision.ts`:

```typescript
import type { AdvisorCritique } from '@/types';

export interface EditorDecisionResult {
  decision: 'approve' | 'revise';
  brief: string;
  avgScore: number;
  highIssueCount: number;
}

/**
 * Mechanical editor rubric. No LLM judgment — pure rules.
 *
 * - ANY high-severity issue → revise
 * - NO high-severity AND avg score >= threshold → approve
 * - NO high-severity BUT avg < threshold → revise (safety valve)
 * - Scores decreasing from previous round → approve (oscillation guard)
 * - Empty critiques → approve (nothing to gate on)
 */
export function applyEditorRubric(
  critiques: AdvisorCritique[],
  minAggregateScore: number,
  previousAvgScore?: number,
): EditorDecisionResult {
  if (critiques.length === 0) {
    return { decision: 'approve', brief: '', avgScore: 0, highIssueCount: 0 };
  }

  const avgScore =
    critiques.reduce((sum, c) => sum + c.score, 0) / critiques.length;

  const allIssues = critiques.flatMap((c) =>
    c.issues.map((issue) => ({
      ...issue,
      advisorId: c.advisorId,
      advisorName: c.name,
    })),
  );

  const highIssues = allIssues.filter((i) => i.severity === 'high');
  const mediumIssues = allIssues.filter((i) => i.severity === 'medium');
  const highIssueCount = highIssues.length;

  // Build brief from high + medium issues
  const briefLines: string[] = [];
  for (const issue of [...highIssues, ...mediumIssues]) {
    briefLines.push(
      `[${issue.severity.toUpperCase()}] (${issue.advisorName}) ${issue.description}`,
    );
  }
  const brief = briefLines.join('\n');

  // Rule 1: Any high-severity → revise
  if (highIssueCount > 0) {
    return { decision: 'revise', brief, avgScore, highIssueCount };
  }

  // Rule 2: Scores decreasing (oscillation) → approve
  if (previousAvgScore !== undefined && avgScore < previousAvgScore) {
    return { decision: 'approve', brief, avgScore, highIssueCount };
  }

  // Rule 3: Avg >= threshold → approve
  if (avgScore >= minAggregateScore) {
    return { decision: 'approve', brief, avgScore, highIssueCount };
  }

  // Rule 4: Avg < threshold → revise (safety valve)
  return { decision: 'revise', brief, avgScore, highIssueCount };
}
```

**Step 4: Run tests — verify they pass**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx vitest run src/lib/__tests__/editor-decision.test.ts`

Expected: All tests pass.

**Step 5: Commit**

```bash
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 add src/lib/editor-decision.ts src/lib/__tests__/editor-decision.test.ts
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 commit -m "feat: add editor decision rubric with tests"
```

---

### Task 8: Create critique tools — all six tools

**Files:**
- Create: `src/lib/agent-tools/critique.ts`

This is the core of Phase 2. All six tools: `generate_draft`, `run_critiques`, `editor_decision`, `revise_draft`, `summarize_round`, `save_content`.

**Step 1: Create critique.ts**

Create `src/lib/agent-tools/critique.ts`. This is a large file — the complete implementation:

```typescript
import type {
  ToolDefinition,
  AdvisorCritique,
  CritiqueIssue,
  CritiqueRound,
  PipelineProgress,
  RoundSummary,
} from '@/types';
import { getRedis } from '@/lib/redis';
import { getAnthropic } from '@/lib/anthropic';
import { CLAUDE_MODEL } from '@/lib/config';
import { getFoundationDoc } from '@/lib/db';
import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';
import { parseLLMJson } from '@/lib/llm-utils';
import { selectCritics, type ContentRecipe } from '@/lib/content-recipes';
import { advisorRegistry, type AdvisorEntry } from '@/lib/advisors/registry';
import { applyEditorRubric } from '@/lib/editor-decision';
import pLimit from 'p-limit';

const DRAFT_TTL = 7200; // 2 hours
const ROUND_TTL = 7200;
const PROGRESS_TTL = 7200;

// Tool for structured critique output — passed to each critic call
const submitCritiqueTool = {
  name: 'submit_critique',
  description: 'Submit your structured evaluation of the content.',
  input_schema: {
    type: 'object' as const,
    properties: {
      score: { type: 'number' as const, minimum: 1, maximum: 10 },
      pass: { type: 'boolean' as const },
      issues: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            severity: {
              type: 'string' as const,
              enum: ['high', 'medium', 'low'],
            },
            description: { type: 'string' as const },
            suggestion: { type: 'string' as const },
          },
          required: ['severity', 'description', 'suggestion'],
        },
      },
    },
    required: ['score', 'pass', 'issues'],
  },
};

/**
 * Run a single critic call and extract the structured critique from tool use.
 */
async function runSingleCritic(
  advisor: AdvisorEntry,
  draft: string,
  recipe: ContentRecipe,
  ideaId: string,
): Promise<AdvisorCritique> {
  // Load advisor's context docs
  const contextParts: string[] = [];
  if (advisor.contextDocs) {
    for (const docType of advisor.contextDocs) {
      const doc = await getFoundationDoc(ideaId, docType);
      if (doc) {
        contextParts.push(
          `## ${docType.replace(/-/g, ' ').toUpperCase()}\n${doc.content}`,
        );
      }
    }
  }

  let userPrompt =
    `You are evaluating this content as ${advisor.name}.\n\n` +
    `Your evaluation focus:\n${advisor.evaluationExpertise}\n\n`;

  if (recipe.evaluationEmphasis) {
    userPrompt +=
      `EMPHASIS FOR THIS CONTENT TYPE:\n${recipe.evaluationEmphasis}\n\n`;
  }

  if (contextParts.length > 0) {
    userPrompt += `REFERENCE DOCUMENTS:\n${contextParts.join('\n\n')}\n\n`;
  }

  userPrompt +=
    `CONTENT TO EVALUATE:\n${draft}\n\n` +
    `Use the submit_critique tool to provide your structured evaluation.`;

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: userPrompt }],
    tools: [submitCritiqueTool],
  });

  // Extract tool use from response
  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    return {
      advisorId: advisor.id,
      name: advisor.name,
      score: 0,
      pass: false,
      issues: [],
      error: 'Critic did not use submit_critique tool',
    };
  }

  const input = toolUse.input as {
    score: number;
    pass: boolean;
    issues: CritiqueIssue[];
  };

  return {
    advisorId: advisor.id,
    name: advisor.name,
    score: input.score,
    pass: input.pass,
    issues: input.issues || [],
  };
}

/**
 * Compare two rounds to find fixed items.
 * An issue is "fixed" if it was present in the previous round but absent in the current.
 */
function findFixedItems(
  prevCritiques: AdvisorCritique[],
  currentCritiques: AdvisorCritique[],
): string[] {
  const fixed: string[] = [];
  for (const prevCrit of prevCritiques) {
    const currentCrit = currentCritiques.find(
      (c) => c.advisorId === prevCrit.advisorId,
    );
    if (!currentCrit) continue;

    for (const prevIssue of prevCrit.issues) {
      if (prevIssue.severity === 'low') continue;
      const stillPresent = currentCrit.issues.some(
        (ci) =>
          ci.severity !== 'low' &&
          ci.description.toLowerCase().includes(
            prevIssue.description.toLowerCase().split(' ').slice(0, 3).join(' '),
          ),
      );
      if (!stillPresent) {
        fixed.push(prevIssue.description);
      }
    }
  }
  return fixed;
}

/**
 * Find aspects with no high/medium issues across all critics.
 * A critic with no high/medium issues means their evaluation domain scored well.
 */
function findWellScoredAspects(critiques: AdvisorCritique[]): string[] {
  const aspects: string[] = [];
  for (const critique of critiques) {
    const hasHighMedium = critique.issues.some(
      (i) => i.severity === 'high' || i.severity === 'medium',
    );
    if (!hasHighMedium) {
      aspects.push(`${critique.name}'s evaluation domain`);
    }
  }
  return aspects;
}

export function createCritiqueTools(
  runId: string,
  ideaId: string,
  recipe: ContentRecipe,
): ToolDefinition[] {
  // Mutable state across tool calls
  let selectedCritics: AdvisorEntry[] = [];
  let previousRoundCritiques: AdvisorCritique[] = [];
  let previousAvgScore: number | undefined;
  let accumulatedFixedItems: string[] = [];
  let accumulatedWellScored: string[] = [];

  return [
    {
      name: 'generate_draft',
      description:
        'Generate initial content draft using the recipe author advisor. Call this first.',
      input_schema: {
        type: 'object',
        properties: {
          contentContext: {
            type: 'string',
            description:
              'Content-specific context (research data, keywords, etc.)',
          },
        },
        required: ['contentContext'],
      },
      execute: async (input) => {
        const contentContext = input.contentContext as string;

        // Load author context docs
        const contextParts: string[] = [];
        for (const docType of recipe.authorContextDocs) {
          const doc = await getFoundationDoc(ideaId, docType);
          if (doc) {
            contextParts.push(
              `## ${docType.replace(/-/g, ' ').toUpperCase()}\n${doc.content}`,
            );
          }
        }

        const systemPrompt = getAdvisorSystemPrompt(recipe.authorAdvisor);
        const userPrompt =
          `Write ${recipe.contentType} content for this product.\n\n` +
          `CONTEXT:\n${contentContext}\n\n` +
          (contextParts.length > 0
            ? `REFERENCE DOCUMENTS:\n${contextParts.join('\n\n')}\n\n`
            : '') +
          'Write the complete content now.';

        const response = await getAnthropic().messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        const draft =
          response.content[0].type === 'text'
            ? response.content[0].text
            : '';

        // Save to Redis
        await getRedis().set(`draft:${runId}`, draft, { ex: DRAFT_TTL });

        return {
          success: true,
          draftLength: draft.length,
          draft,
        };
      },
    },

    {
      name: 'run_critiques',
      description:
        'Run critique cycle with dynamically selected advisors. Reads current draft from Redis.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        // Read draft
        const draft = await getRedis().get<string>(`draft:${runId}`);
        if (!draft) return { error: 'No draft found — call generate_draft first' };

        // Select critics (first time only)
        if (selectedCritics.length === 0) {
          selectedCritics = await selectCritics(recipe, advisorRegistry);

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

        if (selectedCritics.length === 0) {
          return { critiques: [], message: 'No matching critics found' };
        }

        // Run critic calls with p-limit(2) concurrency
        const limit = pLimit(2);
        const results = await Promise.allSettled(
          selectedCritics.map((advisor) =>
            limit(() => runSingleCritic(advisor, draft, recipe, ideaId)),
          ),
        );

        const critiques: AdvisorCritique[] = results.map((result, idx) => {
          if (result.status === 'fulfilled') return result.value;
          return {
            advisorId: selectedCritics[idx].id,
            name: selectedCritics[idx].name,
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

    {
      name: 'editor_decision',
      description:
        'Apply mechanical editor rubric to critique results. Returns approve or revise with brief.',
      input_schema: {
        type: 'object',
        properties: {
          critiques: {
            type: 'array',
            description: 'Array of AdvisorCritique objects from run_critiques',
            items: { type: 'object' },
          },
        },
        required: ['critiques'],
      },
      execute: async (input) => {
        const critiques = input.critiques as AdvisorCritique[];
        const result = applyEditorRubric(
          critiques,
          recipe.minAggregateScore,
          previousAvgScore,
        );

        previousAvgScore = result.avgScore;

        return {
          decision: result.decision,
          brief: result.brief,
          avgScore: result.avgScore,
          highIssueCount: result.highIssueCount,
        };
      },
    },

    {
      name: 'revise_draft',
      description:
        'Revise the current draft based on editor brief. Includes do-not-regress guard.',
      input_schema: {
        type: 'object',
        properties: {
          brief: {
            type: 'string',
            description: 'Editor revision brief focusing on high/medium issues',
          },
        },
        required: ['brief'],
      },
      execute: async (input) => {
        const brief = input.brief as string;

        const draft = await getRedis().get<string>(`draft:${runId}`);
        if (!draft) return { error: 'No draft found in Redis' };

        // Build do-not-regress list
        const doNotRegress = [
          ...accumulatedFixedItems,
          ...accumulatedWellScored,
        ];

        let revisionPrompt =
          `REVISION BRIEF:\nAddress these issues:\n${brief}\n\n`;

        if (doNotRegress.length > 0) {
          revisionPrompt +=
            `DO NOT REGRESS — these aspects scored well or were fixed in previous rounds:\n` +
            doNotRegress.map((item) => `- ${item}`).join('\n') +
            '\n\nAddress only the listed issues. Do not change aspects on the "do not regress" list.\n\n';
        }

        revisionPrompt += `CURRENT DRAFT:\n${draft}\n\nRevise the draft now.`;

        const systemPrompt = getAdvisorSystemPrompt(recipe.authorAdvisor);

        const response = await getAnthropic().messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: revisionPrompt }],
        });

        const revisedDraft =
          response.content[0].type === 'text'
            ? response.content[0].text
            : '';

        await getRedis().set(`draft:${runId}`, revisedDraft, {
          ex: DRAFT_TTL,
        });

        return {
          success: true,
          revisedDraftLength: revisedDraft.length,
          revisedDraft,
        };
      },
    },

    {
      name: 'summarize_round',
      description:
        'Save full round data to Redis and return compressed summary. Tracks fixed items across rounds.',
      input_schema: {
        type: 'object',
        properties: {
          round: { type: 'number' },
          critiques: {
            type: 'array',
            items: { type: 'object' },
          },
          editorDecision: {
            type: 'string',
            enum: ['approve', 'revise'],
          },
          brief: { type: 'string' },
        },
        required: ['round', 'critiques', 'editorDecision'],
      },
      execute: async (input) => {
        const round = input.round as number;
        const critiques = input.critiques as AdvisorCritique[];
        const editorDecision = input.editorDecision as 'approve' | 'revise';
        const brief = (input.brief as string) || '';

        // Calculate fixed items
        const newlyFixed = findFixedItems(previousRoundCritiques, critiques);
        accumulatedFixedItems = [...accumulatedFixedItems, ...newlyFixed];

        // Calculate well-scored aspects
        const wellScored = findWellScoredAspects(critiques);
        accumulatedWellScored = [
          ...new Set([...accumulatedWellScored, ...wellScored]),
        ];

        // Save for next round comparison
        previousRoundCritiques = critiques;

        const avgScore =
          critiques.length > 0
            ? critiques.reduce((sum, c) => sum + c.score, 0) / critiques.length
            : 0;

        const roundData: CritiqueRound = {
          round,
          critiques,
          editorDecision,
          revisionBrief: brief || undefined,
          fixedItems: accumulatedFixedItems,
          wellScoredAspects: accumulatedWellScored,
        };

        // Save full round to Redis
        await getRedis().set(
          `critique_round:${runId}:${round}`,
          JSON.stringify(roundData),
          { ex: ROUND_TTL },
        );

        const summary: RoundSummary = {
          round,
          avgScore,
          highIssueCount: critiques.flatMap((c) => c.issues).filter(
            (i) => i.severity === 'high',
          ).length,
          editorDecision,
          brief,
          fixedItems: accumulatedFixedItems,
          wellScoredAspects: accumulatedWellScored,
        };

        return summary;
      },
    },

    {
      name: 'save_content',
      description:
        'Save approved content from Redis with quality status. Call after editor approves.',
      input_schema: {
        type: 'object',
        properties: {
          quality: {
            type: 'string',
            enum: ['approved', 'max-rounds-reached'],
          },
        },
        required: ['quality'],
      },
      execute: async (input) => {
        const quality = input.quality as 'approved' | 'max-rounds-reached';

        const draft = await getRedis().get<string>(`draft:${runId}`);
        if (!draft) return { error: 'No draft found in Redis' };

        // Save approved content
        const contentData = {
          content: draft,
          quality,
          contentType: recipe.contentType,
          savedAt: new Date().toISOString(),
        };

        await getRedis().set(
          `approved_content:${runId}`,
          JSON.stringify(contentData),
          { ex: DRAFT_TTL },
        );

        return {
          success: true,
          quality,
          contentLength: draft.length,
        };
      },
    },
  ];
}
```

**Step 2: Verify build**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx tsc --noEmit --pretty 2>&1 | tail -10`

Expected: No errors. Note: if `pLimit` import has issues with ESM, you may need to adjust the import or add `"type": "module"` considerations. p-limit v6+ is ESM-only; Next.js handles this fine in production but vitest may need config. If build fails on the import, try: `const pLimit = (await import('p-limit')).default;` pattern inside the execute function.

**Step 3: Commit**

```bash
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 add src/lib/agent-tools/critique.ts
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 commit -m "feat: add critique tools — generate_draft, run_critiques, editor_decision, revise_draft, summarize_round, save_content"
```

---

### Task 9: Tests for critique tools

**Files:**
- Create: `src/lib/__tests__/critique-tools.test.ts`

**Step 1: Write tests**

Create `src/lib/__tests__/critique-tools.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis
const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
};

vi.mock('@/lib/redis', () => ({
  getRedis: () => mockRedis,
  isRedisConfigured: () => true,
  parseValue: <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T,
}));

// Mock Anthropic
const mockCreate = vi.fn();
vi.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({ messages: { create: mockCreate } }),
}));

vi.mock('@/lib/config', () => ({
  CLAUDE_MODEL: 'claude-test-model',
}));

// Mock db
vi.mock('@/lib/db', () => ({
  getFoundationDoc: vi.fn().mockResolvedValue(null),
}));

// Mock advisor prompt loader
vi.mock('@/lib/advisors/prompt-loader', () => ({
  getAdvisorSystemPrompt: vi.fn().mockReturnValue('You are a test advisor.'),
}));

// Mock selectCritics
vi.mock('@/lib/content-recipes', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    selectCritics: vi.fn().mockResolvedValue([
      {
        id: 'april-dunford',
        name: 'April Dunford',
        role: 'strategist',
        evaluationExpertise: 'Evaluates positioning.',
        contextDocs: ['positioning'],
      },
    ]),
  };
});

// Mock p-limit
vi.mock('p-limit', () => ({
  default: () => <T>(fn: () => T) => fn(),
}));

import { createCritiqueTools } from '@/lib/agent-tools/critique';
import { recipes } from '@/lib/content-recipes';

describe('Critique tools', () => {
  const runId = 'test-run-123';
  const ideaId = 'idea-456';
  let tools: ReturnType<typeof createCritiqueTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = createCritiqueTools(runId, ideaId, recipes.website);
  });

  it('creates six tools', () => {
    expect(tools).toHaveLength(6);
    expect(tools.map((t) => t.name)).toEqual([
      'generate_draft',
      'run_critiques',
      'editor_decision',
      'revise_draft',
      'summarize_round',
      'save_content',
    ]);
  });

  describe('generate_draft', () => {
    it('generates draft and saves to Redis', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Generated website copy here.' }],
      });

      const tool = tools.find((t) => t.name === 'generate_draft')!;
      const result = (await tool.execute({
        contentContext: 'Test context',
      })) as { success: boolean; draft: string };

      expect(result.success).toBe(true);
      expect(result.draft).toBe('Generated website copy here.');
      expect(mockRedis.set).toHaveBeenCalledWith(
        `draft:${runId}`,
        'Generated website copy here.',
        { ex: 7200 },
      );
    });

    it('returns error when Claude API fails', async () => {
      mockCreate.mockRejectedValue(new Error('API timeout'));

      const tool = tools.find((t) => t.name === 'generate_draft')!;

      await expect(
        tool.execute({ contentContext: 'Test context' }),
      ).rejects.toThrow('API timeout');
    });

    it('throws when Redis set fails', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Draft text' }],
      });
      mockRedis.set.mockRejectedValue(new Error('Redis write failed'));

      const tool = tools.find((t) => t.name === 'generate_draft')!;

      await expect(
        tool.execute({ contentContext: 'Test context' }),
      ).rejects.toThrow('Redis write failed');
    });
  });

  describe('run_critiques', () => {
    it('reads draft from Redis and runs critic calls', async () => {
      mockRedis.get.mockResolvedValue('Test draft content');

      // Mock the critic response (tool_use for submit_critique)
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'submit_critique',
            input: {
              score: 7,
              pass: true,
              issues: [
                {
                  severity: 'medium',
                  description: 'CTA could improve',
                  suggestion: 'Simplify the CTA',
                },
              ],
            },
          },
        ],
      });

      const tool = tools.find((t) => t.name === 'run_critiques')!;
      const result = (await tool.execute({})) as {
        critiques: Array<{
          advisorId: string;
          score: number;
          issues: Array<{ severity: string }>;
        }>;
      };

      expect(result.critiques).toHaveLength(1);
      expect(result.critiques[0].advisorId).toBe('april-dunford');
      expect(result.critiques[0].score).toBe(7);
      expect(result.critiques[0].issues).toHaveLength(1);
    });

    it('returns error when no draft in Redis', async () => {
      mockRedis.get.mockResolvedValue(null);

      const tool = tools.find((t) => t.name === 'run_critiques')!;
      const result = (await tool.execute({})) as { error: string };

      expect(result.error).toContain('No draft found');
    });

    it('handles partial critic failure via allSettled', async () => {
      mockRedis.get.mockResolvedValue('Test draft');

      // Simulate the critic call throwing
      mockCreate
        .mockRejectedValueOnce(new Error('Critic 1 timeout'))
        .mockResolvedValue({
          content: [{ type: 'text', text: 'No tool use' }],
        });

      // Override selectCritics to return two critics
      const { selectCritics } = await import('@/lib/content-recipes');
      vi.mocked(selectCritics).mockResolvedValue([
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

      // Need fresh tools since critics are cached
      const freshTools = createCritiqueTools(
        'fresh-run',
        ideaId,
        recipes.website,
      );
      // Set up draft for fresh-run
      mockRedis.get.mockResolvedValue('Test draft');

      const tool = freshTools.find((t) => t.name === 'run_critiques')!;
      const result = (await tool.execute({})) as {
        critiques: Array<{ advisorId: string; error?: string }>;
      };

      // Both critics should be in results — one with error
      expect(result.critiques).toHaveLength(2);
      const failedCritic = result.critiques.find((c) => c.error);
      expect(failedCritic).toBeTruthy();
    });

    it('returns error when Redis get fails', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection lost'));

      const tool = tools.find((t) => t.name === 'run_critiques')!;

      await expect(tool.execute({})).rejects.toThrow('Redis connection lost');
    });
  });

  describe('revise_draft', () => {
    it('reads draft from Redis and saves revised version', async () => {
      mockRedis.get.mockResolvedValue('Original draft');
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Revised draft' }],
      });

      const tool = tools.find((t) => t.name === 'revise_draft')!;
      const result = (await tool.execute({
        brief: 'Fix positioning in hero section',
      })) as { success: boolean; revisedDraft: string };

      expect(result.success).toBe(true);
      expect(result.revisedDraft).toBe('Revised draft');
      expect(mockRedis.set).toHaveBeenCalledWith(
        `draft:${runId}`,
        'Revised draft',
        { ex: 7200 },
      );
    });

    it('returns error when no draft in Redis', async () => {
      mockRedis.get.mockResolvedValue(null);

      const tool = tools.find((t) => t.name === 'revise_draft')!;
      const result = (await tool.execute({
        brief: 'Fix something',
      })) as { error: string };

      expect(result.error).toContain('No draft found');
    });

    it('returns error when Claude API fails', async () => {
      mockRedis.get.mockResolvedValue('Original draft');
      mockCreate.mockRejectedValue(new Error('API error'));

      const tool = tools.find((t) => t.name === 'revise_draft')!;

      await expect(
        tool.execute({ brief: 'Fix something' }),
      ).rejects.toThrow('API error');
    });
  });

  describe('summarize_round', () => {
    it('saves round data to Redis and returns summary', async () => {
      const tool = tools.find((t) => t.name === 'summarize_round')!;
      const result = (await tool.execute({
        round: 1,
        critiques: [
          {
            advisorId: 'april-dunford',
            name: 'April Dunford',
            score: 7,
            pass: true,
            issues: [],
          },
        ],
        editorDecision: 'approve',
        brief: '',
      })) as { round: number; avgScore: number };

      expect(result.round).toBe(1);
      expect(result.avgScore).toBe(7);
      expect(mockRedis.set).toHaveBeenCalledWith(
        `critique_round:${runId}:1`,
        expect.any(String),
        { ex: 7200 },
      );
    });

    it('accumulates fixed items across rounds', async () => {
      const tool = tools.find((t) => t.name === 'summarize_round')!;

      // Round 1 has an issue
      await tool.execute({
        round: 1,
        critiques: [
          {
            advisorId: 'april-dunford',
            name: 'April Dunford',
            score: 5,
            pass: false,
            issues: [
              {
                severity: 'high',
                description: 'Positioning drift in hero',
                suggestion: 'Fix',
              },
            ],
          },
        ],
        editorDecision: 'revise',
        brief: 'Fix positioning',
      });

      // Round 2 — issue is resolved
      const result = (await tool.execute({
        round: 2,
        critiques: [
          {
            advisorId: 'april-dunford',
            name: 'April Dunford',
            score: 8,
            pass: true,
            issues: [],
          },
        ],
        editorDecision: 'approve',
        brief: '',
      })) as { fixedItems: string[] };

      expect(result.fixedItems.length).toBeGreaterThan(0);
      expect(result.fixedItems[0]).toContain('Positioning drift');
    });
  });

  describe('save_content', () => {
    it('saves approved content to Redis', async () => {
      mockRedis.get.mockResolvedValue('Final approved draft');

      const tool = tools.find((t) => t.name === 'save_content')!;
      const result = (await tool.execute({
        quality: 'approved',
      })) as { success: boolean; quality: string };

      expect(result.success).toBe(true);
      expect(result.quality).toBe('approved');
      expect(mockRedis.set).toHaveBeenCalledWith(
        `approved_content:${runId}`,
        expect.stringContaining('"quality":"approved"'),
        { ex: 7200 },
      );
    });

    it('handles max-rounds-reached quality', async () => {
      mockRedis.get.mockResolvedValue('Draft after max rounds');

      const tool = tools.find((t) => t.name === 'save_content')!;
      const result = (await tool.execute({
        quality: 'max-rounds-reached',
      })) as { quality: string };

      expect(result.quality).toBe('max-rounds-reached');
    });

    it('returns error when no draft in Redis', async () => {
      mockRedis.get.mockResolvedValue(null);

      const tool = tools.find((t) => t.name === 'save_content')!;
      const result = (await tool.execute({
        quality: 'approved',
      })) as { error: string };

      expect(result.error).toContain('No draft found');
    });
  });
});
```

**Step 2: Run tests**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx vitest run src/lib/__tests__/critique-tools.test.ts`

Expected: All tests pass.

**Step 3: Commit**

```bash
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 add src/lib/__tests__/critique-tools.test.ts
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 commit -m "test: add tests for critique tools"
```

---

### Task 10: Make BrandIdentity.landingPage and seoDescription optional

> **Ordering:** Tasks 10, 11, and 12 all modify `src/lib/agent-tools/website.ts`. Execute them in order (10 → 11 → 12) and resolve merge conflicts if any arise.

**Files:**
- Modify: `src/types/index.ts` (lines 168-194)
- Modify: `src/lib/agent-tools/website.ts`
- Modify: `src/lib/painted-door-templates.ts`
- Modify: `src/lib/painted-door-agent.ts` (possibly)

**Step 1: Update BrandIdentity interface**

In `src/types/index.ts`, find the existing `BrandIdentity` interface and make two fields optional. Replace:

```typescript
  seoDescription: string;
```

With:

```typescript
  seoDescription?: string;
```

And replace:

```typescript
  landingPage: {
```

With:

```typescript
  landingPage?: {
```

The full interface after changes should look like:

```typescript
export interface BrandIdentity {
  siteName: string;
  tagline: string;
  seoDescription?: string;
  targetDemographic: string;
  voice: { tone: string; personality: string; examples: string[] };
  colors: {
    primary: string;
    primaryLight: string;
    background: string;
    backgroundElevated: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    border: string;
  };
  typography: { headingFont: string; bodyFont: string; monoFont: string };
  landingPage?: {
    heroHeadline: string;
    heroSubheadline: string;
    ctaText: string;
    valueProps: { title: string; description: string }[];
    socialProofApproach: string;
    faqs: { question: string; answer: string }[];
  };
}
```

**Step 2: Fix type errors in downstream files**

The type change will cause errors in files that access `brand.landingPage.heroHeadline` etc. without null checks. Fix these:

**In `src/lib/agent-tools/website.ts`:**

1. `design_brand` execute (around line 333): Change `brand.landingPage.heroHeadline` to use optional chaining. Replace:

   ```typescript
   heroHeadline: brand.landingPage.heroHeadline,
   ```

   With:

   ```typescript
   heroHeadline: brand.landingPage?.heroHeadline,
   ```

2. `evaluate_brand` execute (around line 383): Guard `brand.seoDescription` for the `checkMetaDescription` call. Replace:

   ```typescript
   evals.push(checkMetaDescription(brand.seoDescription, primaryKeyword));
   ```

   With:

   ```typescript
   if (brand.seoDescription) {
     evals.push(checkMetaDescription(brand.seoDescription, primaryKeyword));
   }
   ```

3. `evaluate_brand` execute (around line 388): Guard `brand.landingPage` accesses. Wrap all code that accesses `brand.landingPage.heroHeadline`, `brand.landingPage.heroSubheadline`, and `brand.landingPage.valueProps` in:

   ```typescript
   if (brand.landingPage) {
     // ...existing landingPage checks
   }
   ```

**In `src/lib/painted-door-templates.ts`:**

1. `renderLayout` (line 368): Guard `brand.seoDescription`. Replace:

   ```typescript
   const seoDesc = esc(brand.seoDescription);
   ```

   With:

   ```typescript
   const seoDesc = esc(brand.seoDescription || '');
   ```

2. `renderLandingPage` (line 424): Guard `brand.landingPage` — this function should only be called when landingPage exists. Add an early return at the top:

   ```typescript
   if (!brand.landingPage) return '';
   ```

**In `src/lib/painted-door-agent.ts`:** The v1 flow generates full brand identity including copy, so `brand.landingPage` will always be present there. No changes needed unless TypeScript complains about the optional type. If it does, add non-null assertions (`brand.landingPage!`) since the v1 prompt always produces landingPage.

**Step 3: Verify build**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx tsc --noEmit --pretty 2>&1 | tail -20`

Expected: No errors. If errors remain, fix each one by adding appropriate null guards or non-null assertions (only in v1 flow code where the value is guaranteed).

**Step 4: Run all existing tests**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx vitest run`

Expected: All tests pass.

**Step 5: Commit**

```bash
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 add src/types/index.ts src/lib/agent-tools/website.ts src/lib/painted-door-templates.ts src/lib/painted-door-agent.ts
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 commit -m "feat: make BrandIdentity.landingPage and seoDescription optional for critique pipeline split"
```

---

### Task 11: Add visualOnly mode to design_brand prompt + update tool

> **Depends on:** Task 10 (which also modifies `website.ts`). Execute after Task 10.

**Files:**
- Modify: `src/lib/painted-door-prompts.ts`
- Modify: `src/lib/agent-tools/website.ts`

**Step 1: Add visualOnly parameter to buildBrandIdentityPrompt**

In `src/lib/painted-door-prompts.ts`, add an optional `visualOnly` parameter:

Change the function signature from:
```typescript
export function buildBrandIdentityPrompt(
  idea: ProductIdea,
  ctx: ContentContext,
): string {
```

To:
```typescript
export function buildBrandIdentityPrompt(
  idea: ProductIdea,
  ctx: ContentContext,
  visualOnly = false,
): string {
```

Then at the end of the function (around line 98 where the JSON schema starts), conditionally include or exclude the `landingPage` and `seoDescription` fields:

When `visualOnly` is true, the prompt should say:
```
Respond with ONLY valid JSON matching this exact schema:
{
  "siteName": "string",
  "tagline": "string",
  "targetDemographic": "string",
  "voice": { ... },
  "colors": { ... },
  "typography": { ... }
}

Do NOT include landingPage, seoDescription, or any copy fields — those are generated separately.
```

When `visualOnly` is false, keep the existing schema (with all fields including landingPage).

**Step 2: Update design_brand tool for visual-only mode in the tool-based flow**

The `design_brand` tool in `src/lib/agent-tools/website.ts` (line 315) should accept an optional `visualOnly` parameter in its input_schema and pass it to `buildBrandIdentityPrompt`:

```typescript
input_schema: {
  type: 'object',
  properties: {
    visualOnly: {
      type: 'boolean',
      description: 'If true, generates only visual identity (no copy). Used when critique pipeline provides copy.',
    },
  },
  required: [],
},
execute: async (input) => {
  if (!idea || !ctx) return { error: 'Call get_idea_context first' };

  const visualOnly = (input.visualOnly as boolean) || false;
  const prompt = buildBrandIdentityPrompt(idea, ctx, visualOnly);
  // ... (the rest of the execute function stays the same — brand parsing, Redis save, etc.)
  // But the return value must use optional chaining since brand.landingPage may be undefined:
  return {
    success: true,
    siteName: brand.siteName,
    tagline: brand.tagline,
    seoDescription: brand.seoDescription,
    heroHeadline: brand.landingPage?.heroHeadline,
    mode: visualOnly ? 'visual-only' : 'full',
  };
```

> **Note:** The `heroHeadline` return value will be `undefined` when `visualOnly=true` — this is expected. The orchestrator agent uses `mode` to know whether copy was generated. Since the tool return is consumed by an LLM agent (not typed TypeScript code), the optional field is sufficient. Alternative for stricter typing: use a discriminated return with separate shapes per mode.

**Step 3: Verify build**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx tsc --noEmit --pretty 2>&1 | tail -5`

Expected: No errors. The v1 flow in `painted-door-agent.ts` calls `buildBrandIdentityPrompt(idea, ctx)` without the third arg — defaults to `false`, keeping backward compatibility.

**Step 4: Run all tests**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx vitest run`

Expected: All pass.

**Step 5: Commit**

```bash
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 add src/lib/painted-door-prompts.ts src/lib/agent-tools/website.ts
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 commit -m "feat: add visualOnly mode to brand identity prompt for critique pipeline"
```

---

### Task 12: Update assembleAllFiles to accept approved copy

> **Depends on:** Tasks 10 and 11 (which also modify `website.ts`). Execute after Task 11.

**Files:**
- Modify: `src/lib/painted-door-templates.ts`
- Modify: `src/lib/agent-tools/website.ts`

**Step 1: Add approvedCopy parameter to assembleAllFiles**

In `src/lib/painted-door-templates.ts`, change the `assembleAllFiles` function signature (line 885):

From:
```typescript
export function assembleAllFiles(
  brand: BrandIdentity,
  ctx: ContentContext,
): Record<string, string> {
```

To:
```typescript
export interface ApprovedCopy {
  landingPage: NonNullable<BrandIdentity['landingPage']>;
  seoDescription: string;
}

export function assembleAllFiles(
  brand: BrandIdentity,
  ctx: ContentContext,
  approvedCopy?: ApprovedCopy,
): Record<string, string> {
```

Then inside the function, create a "resolved brand" that merges approved copy back:

```typescript
// Merge approved copy into brand for template rendering
const resolvedBrand: BrandIdentity = approvedCopy
  ? { ...brand, landingPage: approvedCopy.landingPage, seoDescription: approvedCopy.seoDescription }
  : brand;
```

Replace all references to `brand` with `resolvedBrand` within the function body. This means `renderLayout(resolvedBrand)`, `renderLandingPage(resolvedBrand, ctx)`, etc.

**Step 2: Update assemble_site_files tool**

In `src/lib/agent-tools/website.ts`, the `assemble_site_files` tool (around line 350) should accept an optional `approvedCopy` in its input_schema:

```typescript
input_schema: {
  type: 'object',
  properties: {
    approvedCopy: {
      type: 'object',
      description: 'Optional approved copy from critique pipeline. When provided, overrides brand copy.',
      properties: {
        landingPage: { type: 'object' },
        seoDescription: { type: 'string' },
      },
    },
  },
  required: [],
},
execute: async (input) => {
  if (!brand || !ctx) return { error: 'Call design_brand first' };

  const approvedCopy = input.approvedCopy as ApprovedCopy | undefined;
  allFiles = assembleAllFiles(brand, ctx, approvedCopy);

  return {
    success: true,
    totalFileCount: Object.keys(allFiles).length,
    files: Object.keys(allFiles),
  };
},
```

Add the import for `ApprovedCopy` from `painted-door-templates.ts`.

**Step 3: Verify build**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx tsc --noEmit --pretty 2>&1 | tail -10`

Expected: No errors. The existing call in `painted-door-agent.ts` uses `assembleAllFiles(brand, ctx)` — omitting `approvedCopy` means it falls back to `brand.landingPage` as before.

**Step 4: Run all tests**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx vitest run`

Expected: All pass.

**Step 5: Commit**

```bash
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 add src/lib/painted-door-templates.ts src/lib/agent-tools/website.ts
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 commit -m "feat: update assembleAllFiles to accept approved copy from critique pipeline"
```

---

### Task 13: Create content-critique-agent.ts

**Files:**
- Create: `src/lib/content-critique-agent.ts`

**Step 1: Create the agent file**

Create `src/lib/content-critique-agent.ts`, following the pattern from `src/lib/foundation-agent.ts`:

```typescript
import type { AgentConfig, PipelineProgress } from '@/types';
import {
  runAgent,
  resumeAgent,
  getAgentState,
  deleteAgentState,
  saveActiveRun,
  getActiveRunId,
  clearActiveRun,
} from './agent-runtime';
import { createCritiqueTools } from './agent-tools/critique';
import { createPlanTools, createScratchpadTools } from './agent-tools/common';
import { createFoundationTools } from './agent-tools/foundation';
import { getRedis } from './redis';
import { CLAUDE_MODEL } from './config';
import { recipes, type ContentRecipe } from './content-recipes';

const PROGRESS_TTL = 7200;

function buildSystemPrompt(recipe: ContentRecipe): string {
  return `You are a content pipeline orchestrator. You execute a write-critique-revise cycle.

Content type: ${recipe.contentType}
Max revision rounds: ${recipe.maxRevisionRounds}

Your tools: generate_draft, run_critiques, editor_decision, revise_draft, summarize_round, save_content.
You also have load_foundation_docs to load reference documents if needed.

Procedure:
1. Call generate_draft with content context.
2. Call run_critiques.
3. Read the critique results. Apply these rules:
   - ANY high-severity issue -> editor_decision(decision='revise', brief=...)
   - NO high-severity AND avg score >= ${recipe.minAggregateScore} -> editor_decision(decision='approve')
   - NO high-severity BUT avg < ${recipe.minAggregateScore} -> editor_decision(decision='revise')
   - Scores decreasing from previous round -> editor_decision(decision='approve')
4. After editor_decision, call summarize_round with the round data.
5. If revise: call revise_draft with the brief, then back to step 2.
6. If approve: call save_content with quality='approved'.
7. If you've hit ${recipe.maxRevisionRounds} rounds without approval: call save_content with quality='max-rounds-reached'.

When writing revision briefs:
- Focus on HIGH and MEDIUM issues only.
- Include the "do not regress" list from summarize_round output.
- Instruct: "Address only the listed issues. Do not change aspects on the do-not-regress list."

Do NOT narrate your reasoning. Call the tools.`;
}

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
    steps: [
      { name: 'Generate Draft', status: 'pending' },
      { name: 'Run Critiques', status: 'pending' },
      { name: 'Editor Review', status: 'pending' },
      { name: 'Save Content', status: 'pending' },
    ],
    critiqueHistory: [],
  };
}

export async function runContentCritiquePipeline(
  ideaId: string,
  contentType: string,
  contentContext: string,
): Promise<{ runId: string }> {
  const recipe = recipes[contentType];
  if (!recipe) throw new Error(`Unknown content type: ${contentType}`);

  // Check for paused run
  const existingRunId = await getActiveRunId('content-critique', ideaId);
  let pausedState = existingRunId ? await getAgentState(existingRunId) : null;
  if (pausedState && pausedState.status !== 'paused') {
    pausedState = null;
  }

  const runId = pausedState
    ? pausedState.runId
    : `critique-${ideaId}-${Date.now()}`;
  const isResume = !!pausedState;

  // Initialize progress
  const progress = makeInitialProgress(contentType, recipe.maxRevisionRounds);
  await getRedis().set(
    `pipeline_progress:${runId}`,
    JSON.stringify(progress),
    { ex: PROGRESS_TTL },
  );

  const tools = [
    ...createPlanTools(runId),
    ...createScratchpadTools(),
    ...createFoundationTools(ideaId),
    ...createCritiqueTools(runId, ideaId, recipe),
  ];

  const config: AgentConfig = {
    agentId: 'content-critique',
    runId,
    model: CLAUDE_MODEL,
    maxTokens: 4096,
    maxTurns: 30,
    tools,
    systemPrompt: buildSystemPrompt(recipe),
    onProgress: async (step, detail) => {
      console.log(`[content-critique] ${step}: ${detail ?? ''}`);

      const existing = await getRedis().get<string>(
        `pipeline_progress:${runId}`,
      );
      if (!existing) return;

      const p: PipelineProgress =
        typeof existing === 'string' ? JSON.parse(existing) : existing;

      if (step === 'tool_call' && detail) {
        p.currentStep = detail;
      } else if (step === 'complete') {
        p.status = 'complete';
        p.currentStep = 'Content pipeline complete!';
      } else if (step === 'error') {
        p.status = 'error';
        p.currentStep = detail || 'Pipeline failed';
      }

      await getRedis().set(
        `pipeline_progress:${runId}`,
        JSON.stringify(p),
        { ex: PROGRESS_TTL },
      );
    },
  };

  const initialMessage = `Generate ${contentType} content for idea ${ideaId}.\n\nContent context:\n${contentContext}`;

  let state;
  if (pausedState) {
    console.log(
      `[content-critique] Resuming paused run ${runId} (resume #${pausedState.resumeCount + 1})`,
    );
    state = await resumeAgent(config, pausedState);
  } else {
    state = await runAgent(config, initialMessage);
  }

  if (state.status === 'paused') {
    await saveActiveRun('content-critique', ideaId, runId);
    throw new Error('AGENT_PAUSED');
  }

  await clearActiveRun('content-critique', ideaId);
  await deleteAgentState(runId);

  if (state.status === 'error') {
    throw new Error(state.error || 'Content critique pipeline failed');
  }

  return { runId };
}
```

**Step 2: Verify build**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx tsc --noEmit --pretty 2>&1 | tail -10`

Expected: No errors.

**Step 3: Commit**

```bash
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 add src/lib/content-critique-agent.ts
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 commit -m "feat: add content critique agent with write-critique-revise loop"
```

---

### Task 14: Create API route for content pipeline

**Files:**
- Create: `src/app/api/content-pipeline/[ideaId]/route.ts`

**Step 1: Create the route**

Create the directory and file following the pattern from `src/app/api/foundation/[ideaId]/route.ts`:

```typescript
import { NextRequest, NextResponse, after } from 'next/server';
import { isRedisConfigured, getAllFoundationDocs } from '@/lib/db';
import { runContentCritiquePipeline } from '@/lib/content-critique-agent';
import { recipes } from '@/lib/content-recipes';
import { buildContentContext } from '@/lib/content-agent';
import { getRedis } from '@/lib/redis';

export const maxDuration = 300;

// POST — trigger content critique pipeline
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> },
) {
  const { ideaId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json(
      { error: 'Database not configured.' },
      { status: 500 },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured.' },
      { status: 500 },
    );
  }

  let body: { contentType?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body. Expected { contentType: "website" }.' },
      { status: 400 },
    );
  }

  const contentType = body.contentType || 'website';
  const recipe = recipes[contentType];
  if (!recipe) {
    return NextResponse.json(
      { error: `Unknown content type: ${contentType}` },
      { status: 400 },
    );
  }

  // Verify foundation docs exist for the recipe's authorContextDocs
  const docs = await getAllFoundationDocs(ideaId);
  const missing = recipe.authorContextDocs.filter((dt) => !docs[dt]);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Missing foundation docs: ${missing.join(', ')}. Generate foundation docs first.`,
      },
      { status: 400 },
    );
  }

  // Build content context for the author
  const ctx = await buildContentContext(ideaId);
  if (!ctx) {
    return NextResponse.json(
      { error: 'No analysis found — run research agent first.' },
      { status: 400 },
    );
  }

  const contentContext =
    `Product: ${ctx.ideaName}\n` +
    `Description: ${ctx.ideaDescription}\n` +
    `Target User: ${ctx.targetUser}\n` +
    `Problem Solved: ${ctx.problemSolved}\n` +
    `Top Keywords: ${ctx.topKeywords.slice(0, 5).map((k) => k.keyword).join(', ')}`;

  // Run pipeline in background
  after(async () => {
    try {
      await runContentCritiquePipeline(ideaId, contentType, contentContext);
    } catch (error) {
      if (error instanceof Error && error.message === 'AGENT_PAUSED') {
        console.log(
          `[content-pipeline] Agent paused for ${ideaId}, will resume on next request`,
        );
        return;
      }
      console.error('Content critique pipeline failed:', error);
    }
  });

  return NextResponse.json({
    message: 'Content pipeline started',
    ideaId,
    contentType,
  });
}

// GET — poll pipeline progress
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> },
) {
  const { ideaId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 500 },
    );
  }

  try {
    // Find the progress key — we need the runId
    // Convention: the POST handler could store a mapping, but for now
    // we scan for the most recent pipeline_progress key for this idea
    const redis = getRedis();

    // Check for active run
    const runId = await redis.get<string>(
      `active_run:content-critique:${ideaId}`,
    );

    if (runId) {
      const progress = await redis.get<string>(`pipeline_progress:${runId}`);
      if (progress) {
        return NextResponse.json(
          typeof progress === 'string' ? JSON.parse(progress) : progress,
        );
      }
    }

    return NextResponse.json({ status: 'not_started' });
  } catch (error) {
    console.error('Error getting pipeline progress:', error);
    return NextResponse.json(
      { error: 'Failed to get progress' },
      { status: 500 },
    );
  }
}
```

**Step 2: Verify build**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx tsc --noEmit --pretty 2>&1 | tail -10`

Expected: No errors.

**Step 3: Commit**

```bash
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 add src/app/api/content-pipeline/[ideaId]/route.ts
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 commit -m "feat: add POST /api/content-pipeline/[ideaId] route with progress polling"
```

---

### Task 15: Integration test for critique pipeline

**Files:**
- Create: `src/lib/__tests__/critique-pipeline.integration.test.ts`

**Step 1: Write integration test**

Create `src/lib/__tests__/critique-pipeline.integration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis
const store = new Map<string, string>();
const mockRedis = {
  set: vi.fn(async (key: string, value: string) => {
    store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    return 'OK';
  }),
  get: vi.fn(async (key: string) => {
    const val = store.get(key);
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }),
  del: vi.fn(async (key: string) => {
    store.delete(key);
    return 1;
  }),
};

vi.mock('@/lib/redis', () => ({
  getRedis: () => mockRedis,
  isRedisConfigured: () => true,
  parseValue: <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T,
}));

const mockCreate = vi.fn();
vi.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({ messages: { create: mockCreate } }),
}));

vi.mock('@/lib/config', () => ({
  CLAUDE_MODEL: 'claude-test-model',
}));

vi.mock('@/lib/db', () => ({
  getFoundationDoc: vi.fn().mockResolvedValue({
    content: 'Test foundation doc content',
  }),
  getAllFoundationDocs: vi.fn().mockResolvedValue({}),
  saveFoundationDoc: vi.fn(),
}));

vi.mock('@/lib/advisors/prompt-loader', () => ({
  getAdvisorSystemPrompt: vi.fn().mockReturnValue('You are a test advisor.'),
}));

vi.mock('@/lib/content-recipes', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    selectCritics: vi.fn().mockResolvedValue([
      {
        id: 'april-dunford',
        name: 'April Dunford',
        role: 'strategist',
        evaluationExpertise: 'Evaluates positioning.',
        contextDocs: ['positioning'],
      },
    ]),
  };
});

vi.mock('p-limit', () => ({
  default: () => <T>(fn: () => T) => fn(),
}));

import { createCritiqueTools } from '@/lib/agent-tools/critique';
import { recipes } from '@/lib/content-recipes';

describe('Critique pipeline integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
  });

  it('full cycle: generate → critique → approve (single round)', async () => {
    const runId = 'integ-1';
    const ideaId = 'idea-integ';
    const tools = createCritiqueTools(runId, ideaId, recipes.website);

    // Step 1: Generate draft
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Great website copy here.' }],
    });

    const generateTool = tools.find((t) => t.name === 'generate_draft')!;
    const draftResult = (await generateTool.execute({
      contentContext: 'Product context',
    })) as { success: boolean; draft: string };
    expect(draftResult.success).toBe(true);

    // Step 2: Run critiques — all pass with high scores
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c1',
          name: 'submit_critique',
          input: { score: 8, pass: true, issues: [] },
        },
      ],
    });

    const critiqueTool = tools.find((t) => t.name === 'run_critiques')!;
    const critiqueResult = (await critiqueTool.execute({})) as {
      critiques: Array<{ score: number }>;
    };
    expect(critiqueResult.critiques[0].score).toBe(8);

    // Step 3: Editor decision — should approve
    const editorTool = tools.find((t) => t.name === 'editor_decision')!;
    const editorResult = (await editorTool.execute({
      critiques: critiqueResult.critiques,
    })) as { decision: string };
    expect(editorResult.decision).toBe('approve');

    // Step 4: Save content
    const saveTool = tools.find((t) => t.name === 'save_content')!;
    const saveResult = (await saveTool.execute({
      quality: 'approved',
    })) as { success: boolean; quality: string };
    expect(saveResult.success).toBe(true);
    expect(saveResult.quality).toBe('approved');

    // Verify content was saved to Redis
    expect(store.has(`approved_content:${runId}`)).toBe(true);
  });

  it('full cycle: generate → critique → revise → critique → approve (two rounds)', async () => {
    const runId = 'integ-2';
    const ideaId = 'idea-integ';
    const tools = createCritiqueTools(runId, ideaId, recipes.website);

    // Round 1: Generate
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'First draft.' }],
    });
    const genTool = tools.find((t) => t.name === 'generate_draft')!;
    await genTool.execute({ contentContext: 'context' });

    // Round 1: Critique with high-severity issue
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c1',
          name: 'submit_critique',
          input: {
            score: 4,
            pass: false,
            issues: [
              {
                severity: 'high',
                description: 'Positioning drift',
                suggestion: 'Fix',
              },
            ],
          },
        },
      ],
    });
    const critTool = tools.find((t) => t.name === 'run_critiques')!;
    const crit1 = (await critTool.execute({})) as {
      critiques: Array<{ score: number; issues: Array<{ severity: string }> }>;
    };

    // Round 1: Editor — should revise
    const edTool = tools.find((t) => t.name === 'editor_decision')!;
    const ed1 = (await edTool.execute({
      critiques: crit1.critiques,
    })) as { decision: string; brief: string };
    expect(ed1.decision).toBe('revise');

    // Round 1: Summarize
    const sumTool = tools.find((t) => t.name === 'summarize_round')!;
    await sumTool.execute({
      round: 1,
      critiques: crit1.critiques,
      editorDecision: 'revise',
      brief: ed1.brief,
    });

    // Round 1: Revise
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Revised draft.' }],
    });
    const revTool = tools.find((t) => t.name === 'revise_draft')!;
    await revTool.execute({ brief: ed1.brief });

    // Round 2: Critique — issue resolved
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c2',
          name: 'submit_critique',
          input: { score: 8, pass: true, issues: [] },
        },
      ],
    });
    const crit2 = (await critTool.execute({})) as {
      critiques: Array<{ score: number }>;
    };

    // Round 2: Editor — should approve
    const ed2 = (await edTool.execute({
      critiques: crit2.critiques,
    })) as { decision: string };
    expect(ed2.decision).toBe('approve');

    // Round 2: Summarize — should show fixed items
    const sum2 = (await sumTool.execute({
      round: 2,
      critiques: crit2.critiques,
      editorDecision: 'approve',
    })) as { fixedItems: string[] };
    expect(sum2.fixedItems.length).toBeGreaterThan(0);
  });

  it('max-rounds-reached: saves with max-rounds quality after hitting limit', async () => {
    // Use social-post recipe which has maxRevisionRounds=2
    const runId = 'integ-max';
    const ideaId = 'idea-integ';
    const tools = createCritiqueTools(runId, ideaId, recipes['social-post']);

    // Generate draft
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Social post draft.' }],
    });
    const genTool = tools.find((t) => t.name === 'generate_draft')!;
    await genTool.execute({ contentContext: 'Social context' });

    // Round 1: Critique with high-severity (will revise)
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c1',
          name: 'submit_critique',
          input: {
            score: 3,
            pass: false,
            issues: [{ severity: 'high', description: 'Weak hook', suggestion: 'Rewrite' }],
          },
        },
      ],
    });
    const critTool = tools.find((t) => t.name === 'run_critiques')!;
    const crit1 = (await critTool.execute({})) as { critiques: Array<{ score: number }> };

    const edTool = tools.find((t) => t.name === 'editor_decision')!;
    const ed1 = (await edTool.execute({ critiques: crit1.critiques })) as { decision: string; brief: string };
    expect(ed1.decision).toBe('revise');

    const sumTool = tools.find((t) => t.name === 'summarize_round')!;
    await sumTool.execute({ round: 1, critiques: crit1.critiques, editorDecision: 'revise', brief: ed1.brief });

    // Revise
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Revised social post.' }],
    });
    const revTool = tools.find((t) => t.name === 'revise_draft')!;
    await revTool.execute({ brief: ed1.brief });

    // Round 2: Still failing — hit max rounds
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c2',
          name: 'submit_critique',
          input: {
            score: 3,
            pass: false,
            issues: [{ severity: 'high', description: 'Still weak', suggestion: 'Try again' }],
          },
        },
      ],
    });
    const crit2 = (await critTool.execute({})) as { critiques: Array<{ score: number }> };

    const ed2 = (await edTool.execute({ critiques: crit2.critiques })) as { decision: string };
    expect(ed2.decision).toBe('revise');

    // At this point orchestrator has hit maxRevisionRounds=2, so save with max-rounds-reached
    const saveTool = tools.find((t) => t.name === 'save_content')!;
    const saveResult = (await saveTool.execute({
      quality: 'max-rounds-reached',
    })) as { success: boolean; quality: string };
    expect(saveResult.success).toBe(true);
    expect(saveResult.quality).toBe('max-rounds-reached');

    // Verify content was saved
    expect(store.has(`approved_content:${runId}`)).toBe(true);
    const saved = JSON.parse(store.get(`approved_content:${runId}`)!);
    expect(saved.quality).toBe('max-rounds-reached');
  });

  it('oscillation guard: approves when scores regress between rounds', async () => {
    const runId = 'integ-osc';
    const ideaId = 'idea-integ';
    const tools = createCritiqueTools(runId, ideaId, recipes.website);

    // Generate draft
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Website copy.' }],
    });
    const genTool = tools.find((t) => t.name === 'generate_draft')!;
    await genTool.execute({ contentContext: 'context' });

    // Round 1: Score 5, below threshold (4 is minAggregateScore for website, but scores 1-10, and 5 is above 4)
    // Use score 3 with no high-severity issues to trigger "avg < threshold" revise
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c1',
          name: 'submit_critique',
          input: {
            score: 3,
            pass: false,
            issues: [{ severity: 'medium', description: 'Below threshold', suggestion: 'Improve' }],
          },
        },
      ],
    });
    const critTool = tools.find((t) => t.name === 'run_critiques')!;
    const crit1 = (await critTool.execute({})) as { critiques: Array<{ score: number }> };

    const edTool = tools.find((t) => t.name === 'editor_decision')!;
    const ed1 = (await edTool.execute({ critiques: crit1.critiques })) as { decision: string };
    expect(ed1.decision).toBe('revise'); // Below threshold

    const sumTool = tools.find((t) => t.name === 'summarize_round')!;
    await sumTool.execute({ round: 1, critiques: crit1.critiques, editorDecision: 'revise', brief: 'Fix it' });

    // Revise
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Revised copy.' }],
    });
    const revTool = tools.find((t) => t.name === 'revise_draft')!;
    await revTool.execute({ brief: 'Fix it' });

    // Round 2: Score REGRESSED to 2 (lower than round 1's 3) — oscillation guard should approve
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'c2',
          name: 'submit_critique',
          input: {
            score: 2,
            pass: false,
            issues: [{ severity: 'medium', description: 'Still needs work', suggestion: 'Try more' }],
          },
        },
      ],
    });
    const crit2 = (await critTool.execute({})) as { critiques: Array<{ score: number }> };

    // Editor should approve due to oscillation guard (score went from 3 → 2)
    const ed2 = (await edTool.execute({ critiques: crit2.critiques })) as { decision: string };
    expect(ed2.decision).toBe('approve'); // Oscillation guard triggers
  });
});
```

**Step 2: Run integration tests**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx vitest run src/lib/__tests__/critique-pipeline.integration.test.ts`

Expected: All pass.

**Step 3: Run full test suite**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx vitest run`

Expected: All tests pass.

**Step 4: Commit**

```bash
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 add src/lib/__tests__/critique-pipeline.integration.test.ts
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 commit -m "test: add integration tests for critique pipeline full cycle"
```

---

### Task 16: Verify build and run full test suite

**Files:** None — verification only.

**Step 1: Run full build**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npm run build 2>&1 | tail -20`

Expected: Build succeeds.

**Step 2: Run all tests**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npx vitest run`

Expected: All tests pass with 0 failures.

**Step 3: Run lint**

Run: `cd /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 && npm run lint 2>&1 | tail -10`

Expected: No errors.

---

### Task 17: Update architecture.md

**Files:**
- Modify: `docs/architecture.md`

**Step 1: Add content critique agent to architecture**

Update the following sections in `docs/architecture.md`:

1. **Agent Layer** in the High-Level Architecture mermaid diagram: Add `CRITIQUE["Content Critique Agent<br/>content-critique-agent.ts"]` to the Agents subgraph.

2. **Module Dependency Map**: Add `A_CRITIQUE["content-critique-agent"]` to the Agents subgraph and connect it to `L_RUNTIME`, `S_ADVISORS`, and `T_CRITIQUE["critique"]` tools.

3. **Agent Tools section**: Add `T_CRITIQUE["critique<br/>(generate_draft, run_critiques,<br/>editor_decision, revise_draft,<br/>summarize_round, save_content)"]` to the Tools subgraph.

4. **API Routes table**: Add `| Content Pipeline | \`/api/content-pipeline/[ideaId]\` | POST, GET | POST triggers critique pipeline; GET polls progress |`

5. **Agents table**: Add `| Content Critique | \`src/lib/content-critique-agent.ts\` | \`agent-tools/critique.ts\` | Multi-advisor critique cycle with dynamic selection |`

6. **Core Library table**: Add entries for:
   - `src/lib/content-recipes.ts` — Content recipe definitions and LLM-based critic selection
   - `src/lib/editor-decision.ts` — Mechanical editor rubric for critique pipeline

7. **Redis Keys section**: Add the new key patterns:
   ```
   | `draft:{runId}` | String | 2hr | Current draft for a pipeline run |
   | `critique_round:{runId}:{round}` | String (JSON) | 2hr | Full round data |
   | `pipeline_progress:{runId}` | String (JSON) | 2hr | Structured progress for frontend |
   | `approved_content:{runId}` | String (JSON) | 2hr | Approved content from critique pipeline |
   ```

**Step 2: Verify the doc renders correctly**

Read `docs/architecture.md` and confirm the new sections are present and correctly formatted.

**Step 3: Commit**

```bash
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 add docs/architecture.md
git -C /Users/ericpage/software/epch-projects/.worktrees/feature/content-pipeline-phase2 commit -m "docs: add content critique agent to architecture reference"
```

---

## Manual Steps (Post-Automation)

> Complete these after all tasks finish.

- [ ] **Eval scenarios**: Create eval scenarios for critic selection and critique quality as described in the design doc. These require running the pipeline against real ideas with foundation docs and evaluating output quality — not automatable in the task sequence.
- [ ] **Baseline comparison**: Run both single-pass (`painted-door-agent.ts`) and critique pipeline on 2-3 ideas with complete foundation docs. Compare output quality.
- [ ] **Frontend progress UI**: The API route and types are in place. Build the React component for displaying critique progress (polling `pipeline_progress:{runId}` on the painted-door tab or a new content-pipeline tab). This is a frontend task that depends on design decisions about where to surface the UI.

---

## Decision Log

### Summary

| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | visualOnly parameter vs new function | Add `visualOnly` param to `buildBrandIdentityPrompt` | New `buildVisualIdentityPrompt` function |
| 2 | Redis access in critique tools | Import `getRedis` from `@/lib/redis` | Use common.ts Redis accessor, create db.ts functions |
| 3 | p-limit import strategy | Top-level `import pLimit from 'p-limit'` | Dynamic `import()` inside execute function |
| 4 | Progress polling mechanism | Reuse active_run key pattern from agent-runtime | Separate pipeline-run-id mapping in Redis |

### Appendix: Decision Details

#### Decision 1: visualOnly parameter vs new function

**Chose:** Add an optional `visualOnly = false` parameter to the existing `buildBrandIdentityPrompt` function.

**Why:** DRY — the function already builds all the context (SEO data, vertical detection, competitor landscape). A separate function would duplicate 90% of that logic. The only difference is the JSON schema at the end of the prompt. The default `false` maintains backward compatibility — the v1 flow in `painted-door-agent.ts` (line 405) and the `design_brand` tool both call without the parameter and get the same behavior as before.

**Alternatives rejected:**
- New `buildVisualIdentityPrompt` function: Duplicates the entire context-building logic. Any future changes to how we pass SEO data or competitor info would need updating in two places.

#### Decision 2: Redis access in critique tools

**Chose:** Import `getRedis` from `@/lib/redis` (the central singleton) for all Redis operations in the critique tools.

**Why:** This matches the pattern used by `db.ts` (lines 1-15) and keeps all Redis access through a single lazy singleton. Both `common.ts` and `agent-runtime.ts` create their own local Redis singletons — this is an existing inconsistency that shouldn't be propagated. Using the central `@/lib/redis` import ensures new code goes through the canonical path. The `agent-runtime.ts` local singleton (lines 16-28) also has its own lazy init; unifying these is out of scope but noted.

**Alternatives rejected:**
- common.ts Redis accessor: Would propagate the dual-Redis-singleton inconsistency.
- agent-runtime.ts pattern (local singleton): Same issue — creates a parallel Redis instance.
- New db.ts functions for each Redis operation: Over-abstraction for simple key-value operations with TTLs. The critique tools' Redis keys are private to the critique pipeline (not shared with other modules), so db.ts functions would add indirection without value.

#### Decision 3: p-limit import strategy

**Chose:** Top-level ESM import `import pLimit from 'p-limit'`.

**Why:** Next.js 16 handles ESM imports natively. The project already imports ESM-only packages. Top-level imports are cleaner and allow tree-shaking. If vitest has issues with the ESM import, the mock in tests uses `vi.mock('p-limit', ...)` which avoids the actual import.

**Alternatives rejected:**
- Dynamic `import()` inside execute function: Adds unnecessary async overhead on every call. The module only needs to be loaded once.

#### Decision 4: Progress polling mechanism

**Chose:** Reuse the `active_run:{agentId}:{entityId}` key pattern from the agent runtime to find the current pipeline run's progress key.

**Why:** The agent runtime already establishes this pattern — `saveActiveRun('content-critique', ideaId, runId)` creates the mapping. The GET endpoint reads `active_run:content-critique:{ideaId}` to find the runId, then reads `pipeline_progress:{runId}`. This avoids creating a parallel mapping system.

**Alternatives rejected:**
- Separate mapping key (e.g., `pipeline_run:{ideaId}`): Redundant — the agent runtime already tracks active runs. Adding another key creates a synchronization requirement between two sources of truth.
