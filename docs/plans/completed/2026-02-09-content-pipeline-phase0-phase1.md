# Content Pipeline Phase 0 + Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Validate that foundation documents improve content quality (Phase 0), then build the foundation data layer so "Generate All" produces 6 foundation documents for any idea (Phase 1).

**Architecture:** Foundation documents are stored as individual Redis keys (`foundation:{ideaId}:{docType}`). A new `foundation.ts` agent-tools file provides three tools that the agent runtime orchestrates. The tools make their own Claude API calls with advisor-specific prompts — the orchestrator stays neutral. The UI is a panel of six cards on a new `/analyses/[id]/foundation` page, with a "Generate All" button backed by a POST/GET API route pair.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Upstash Redis, Anthropic SDK, existing agent-runtime (`src/lib/agent-runtime.ts`)

**Design doc:** `docs/plans/2026-02-09-content-pipeline-design.md`

---

## Phase 0: Manual Validation

Phase 0 proves that foundation documents improve content before building infrastructure. It is a manual experiment using a script, not production code.

### Task 0.1: Create Validation Script

**Files:**
- Create: `experiments/foundation-validation/validate.ts`

**Context:** The design doc (§Phase 0) specifies: take an existing idea, manually generate Strategy + Positioning, then compare blog posts generated with vs. without those documents as context.

**Step 1: Write the validation script**

Create a standalone TypeScript script that:
1. Loads an idea and its research context from Redis using `buildContentContext()` from `src/lib/content-agent.ts`
2. Calls Claude to generate a Strategy document (using a simple strategy prompt — no advisor infrastructure yet)
3. Calls Claude to generate a Positioning Statement (using the Strategy as context)
4. Generates a blog post WITHOUT foundation docs (current approach — using `buildBlogPostPrompt()` from `src/lib/content-prompts.ts`)
5. Generates a blog post WITH foundation docs (Strategy + Positioning prepended as context)
6. Saves both outputs to `experiments/foundation-validation/output/`

```typescript
// experiments/foundation-validation/validate.ts
import { buildContentContext } from '../../src/lib/content-agent';
import { buildBlogPostPrompt } from '../../src/lib/content-prompts';
import { getAnthropic } from '../../src/lib/anthropic';
import { CLAUDE_MODEL } from '../../src/lib/config';
import { promises as fs } from 'fs';
import path from 'path';

const IDEA_ID = process.argv[2];
if (!IDEA_ID) {
  console.error('Usage: npx tsx experiments/foundation-validation/validate.ts <ideaId>');
  process.exit(1);
}

const STRATEGY_PROMPT = `You are Richard Rumelt, author of "Good Strategy Bad Strategy."
Analyze this product idea and write a concise strategy document covering:
1. The Challenge — what's the core problem/opportunity?
2. The Guiding Policy — what's the fundamental approach?
3. Coherent Actions — what specific steps follow from the policy?

Be specific. Avoid fluffy language. Name the tradeoffs.`;

const POSITIONING_PROMPT = `You are April Dunford, author of "Obviously Awesome."
Given this strategy, write a positioning statement covering:
1. Competitive alternatives — what would customers use if this didn't exist?
2. Unique attributes — what does this offer that alternatives don't?
3. Value — what does the unique capability enable for customers?
4. Target customer — who cares most about this value?
5. Market category — where does this compete?

Be concrete. Use the strategy to ground every claim.`;

async function main() {
  const ctx = await buildContentContext(IDEA_ID);
  if (!ctx) throw new Error(`No analysis found for idea ${IDEA_ID}`);

  const anthropic = getAnthropic();
  const outDir = path.join(__dirname, 'output');
  await fs.mkdir(outDir, { recursive: true });

  console.log('Generating Strategy...');
  const strategyRes = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: STRATEGY_PROMPT,
    messages: [{ role: 'user', content: `Product: ${ctx.ideaName}\nDescription: ${ctx.ideaDescription}\nTarget User: ${ctx.targetUser}\nProblem: ${ctx.problemSolved}\n\nCompetitor landscape:\n${ctx.competitors}\n\nSEO opportunities:\n${ctx.contentStrategy.topOpportunities.join('\n')}` }],
  });
  const strategy = strategyRes.content[0].type === 'text' ? strategyRes.content[0].text : '';
  await fs.writeFile(path.join(outDir, 'strategy.md'), strategy);

  console.log('Generating Positioning...');
  const positioningRes = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: POSITIONING_PROMPT,
    messages: [{ role: 'user', content: `Strategy:\n${strategy}\n\nProduct: ${ctx.ideaName}\nTarget User: ${ctx.targetUser}` }],
  });
  const positioning = positioningRes.content[0].type === 'text' ? positioningRes.content[0].text : '';
  await fs.writeFile(path.join(outDir, 'positioning.md'), positioning);

  // Pick first pending blog-post piece for comparison
  const mockPiece = {
    id: 'validation-test',
    ideaId: IDEA_ID,
    type: 'blog-post' as const,
    title: `Why ${ctx.ideaName} Changes Everything`,
    slug: 'validation-test',
    targetKeywords: ctx.topKeywords.slice(0, 3).map(k => k.keyword),
    priority: 1,
    rationale: 'Validation test piece',
    status: 'pending' as const,
  };

  console.log('Generating blog post WITHOUT foundation docs...');
  const promptWithout = buildBlogPostPrompt(ctx, mockPiece);
  const withoutRes = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: promptWithout }],
  });
  const blogWithout = withoutRes.content[0].type === 'text' ? withoutRes.content[0].text : '';
  await fs.writeFile(path.join(outDir, 'blog-WITHOUT-foundation.md'), blogWithout);

  console.log('Generating blog post WITH foundation docs...');
  const foundationContext = `\n\nFOUNDATION DOCUMENTS:\n\n## Strategy\n${strategy}\n\n## Positioning\n${positioning}\n\nUse these foundation documents to ground your writing. The positioning statement defines WHO this is for, WHY it's different, and WHAT category it competes in. Reference these claims specifically — don't make up new positioning.\n\n`;
  const promptWith = foundationContext + promptWithout;
  const withRes = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: promptWith }],
  });
  const blogWith = withRes.content[0].type === 'text' ? withRes.content[0].text : '';
  await fs.writeFile(path.join(outDir, 'blog-WITH-foundation.md'), blogWith);

  console.log('\nDone! Compare the outputs in experiments/foundation-validation/output/');
  console.log('- strategy.md');
  console.log('- positioning.md');
  console.log('- blog-WITHOUT-foundation.md');
  console.log('- blog-WITH-foundation.md');
}

main().catch(console.error);
```

**Step 2: Run the validation**

Pick an existing idea that has research data (analysis + SEO data). Run:

```bash
npx tsx experiments/foundation-validation/validate.ts <ideaId>
```

Expected: Four files in `experiments/foundation-validation/output/`. The "WITH" blog post should show noticeably sharper positioning, more specific claims, and better differentiation compared to the "WITHOUT" version.

**Step 3: Review and commit**

Read both blog posts. If the improvement is obvious and significant, Phase 1 is validated — proceed. If marginal, consider adjusting the foundation document prompts or the way they're injected as context before building the full infrastructure.

```bash
git add experiments/foundation-validation/
git commit -m "experiment: validate foundation docs improve content quality"
```

---

## Phase 1: Foundation Data Layer + Autonomous Generation

### Task 1.1: Add Foundation Types

**Files:**
- Modify: `src/types/index.ts` (append after line 353, after `AgentEvent` interface)

**Step 1: Write the test**

Create `src/lib/__tests__/foundation-types.test.ts`:

```typescript
// src/lib/__tests__/foundation-types.test.ts
import { describe, it, expect } from 'vitest';
import type {
  FoundationDocType,
  FoundationDocument,
  FoundationProgress,
} from '@/types';

describe('Foundation types', () => {
  it('FoundationDocument satisfies the shape contract', () => {
    const doc: FoundationDocument = {
      id: 'strategy',
      ideaId: 'idea-123',
      type: 'strategy',
      content: 'Strategy content here',
      advisorId: 'richard-rumelt',
      generatedAt: '2026-02-09T00:00:00.000Z',
      editedAt: null,
      version: 1,
    };
    expect(doc.type).toBe('strategy');
    expect(doc.editedAt).toBeNull();
  });

  it('FoundationDocType covers all 6 document types', () => {
    const types: FoundationDocType[] = [
      'strategy',
      'positioning',
      'brand-voice',
      'design-principles',
      'seo-strategy',
      'social-media-strategy',
    ];
    expect(types).toHaveLength(6);
  });

  it('FoundationProgress tracks per-doc status', () => {
    const progress: FoundationProgress = {
      ideaId: 'idea-123',
      status: 'running',
      currentStep: 'Generating strategy...',
      docs: {
        strategy: 'complete',
        positioning: 'running',
        'brand-voice': 'pending',
        'design-principles': 'pending',
        'seo-strategy': 'pending',
        'social-media-strategy': 'pending',
      },
      error: undefined,
    };
    expect(progress.docs.strategy).toBe('complete');
    expect(progress.docs.positioning).toBe('running');
  });
});
```

**Step 2: Run test — verify it fails**

```bash
npm test -- src/lib/__tests__/foundation-types.test.ts
```

Expected: FAIL — `FoundationDocType`, `FoundationDocument`, `FoundationProgress` not exported from `@/types`.

**Step 3: Add the types**

Append to `src/types/index.ts` after the `AgentEvent` interface (after line 353):

```typescript
// Foundation Document Types

export type FoundationDocType =
  | 'strategy'
  | 'positioning'
  | 'brand-voice'
  | 'design-principles'
  | 'seo-strategy'
  | 'social-media-strategy';

export const FOUNDATION_DOC_TYPES: FoundationDocType[] = [
  'strategy',
  'positioning',
  'brand-voice',
  'design-principles',
  'seo-strategy',
  'social-media-strategy',
];

export interface FoundationDocument {
  id: string;                     // same as type, e.g. 'strategy'
  ideaId: string;
  type: FoundationDocType;
  content: string;                // plain text, optimized for LLM consumption
  advisorId: string;              // which advisor created/last edited it
  generatedAt: string;            // ISO timestamp of last generation
  editedAt: string | null;        // ISO timestamp of last manual edit
  version: number;                // increments on each save
}

export type FoundationDocStatus = 'pending' | 'running' | 'complete' | 'error';

export interface FoundationProgress {
  ideaId: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  currentStep: string;
  docs: Record<FoundationDocType, FoundationDocStatus>;
  error?: string;
}

export interface StrategicInputs {
  differentiation?: string;      // "What makes your approach fundamentally different?"
  deliberateTradeoffs?: string;  // "What are you deliberately choosing NOT to do?"
  antiTarget?: string;           // "Who specifically are you NOT targeting?"
}
```

**Step 4: Run test — verify it passes**

```bash
npm test -- src/lib/__tests__/foundation-types.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/types/index.ts src/lib/__tests__/foundation-types.test.ts
git commit -m "feat: add foundation document types"
```

---

### Task 1.2: Foundation Redis CRUD

**Files:**
- Modify: `src/lib/db.ts` (add foundation functions after the rejected pieces section, before `getAllContentCalendars`)
- Create: `src/lib/__tests__/foundation-db.test.ts`

**Step 1: Write the tests**

```typescript
// src/lib/__tests__/foundation-db.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis before importing db module
const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
};

vi.mock('@/lib/redis', () => ({
  getRedis: () => mockRedis,
  isRedisConfigured: () => true,
  parseValue: <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T,
}));

import {
  saveFoundationDoc,
  getFoundationDoc,
  getAllFoundationDocs,
  deleteFoundationDoc,
  deleteAllFoundationDocs,
  saveFoundationProgress,
  getFoundationProgress,
} from '@/lib/db';
import type { FoundationDocument, FoundationProgress } from '@/types';

describe('Foundation DB functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockDoc: FoundationDocument = {
    id: 'strategy',
    ideaId: 'idea-123',
    type: 'strategy',
    content: 'Test strategy content',
    advisorId: 'richard-rumelt',
    generatedAt: '2026-02-09T00:00:00.000Z',
    editedAt: null,
    version: 1,
  };

  describe('saveFoundationDoc', () => {
    it('saves a foundation document to the correct Redis key', async () => {
      await saveFoundationDoc('idea-123', mockDoc);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'foundation:idea-123:strategy',
        JSON.stringify(mockDoc),
      );
    });
  });

  describe('getFoundationDoc', () => {
    it('returns a foundation document when it exists', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(mockDoc));
      const result = await getFoundationDoc('idea-123', 'strategy');
      expect(mockRedis.get).toHaveBeenCalledWith('foundation:idea-123:strategy');
      expect(result).toEqual(mockDoc);
    });

    it('returns null when document does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await getFoundationDoc('idea-123', 'strategy');
      expect(result).toBeNull();
    });
  });

  describe('getAllFoundationDocs', () => {
    it('returns all existing foundation docs for an idea', async () => {
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(mockDoc))  // strategy
        .mockResolvedValueOnce(null)                      // positioning
        .mockResolvedValueOnce(null)                      // brand-voice
        .mockResolvedValueOnce(null)                      // design-principles
        .mockResolvedValueOnce(null)                      // seo-strategy
        .mockResolvedValueOnce(null);                     // social-media-strategy

      const result = await getAllFoundationDocs('idea-123');
      expect(Object.keys(result)).toEqual(['strategy']);
      expect(result.strategy).toEqual(mockDoc);
    });

    it('returns empty object when no docs exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await getAllFoundationDocs('idea-123');
      expect(result).toEqual({});
    });
  });

  describe('deleteFoundationDoc', () => {
    it('deletes a single foundation document', async () => {
      await deleteFoundationDoc('idea-123', 'strategy');
      expect(mockRedis.del).toHaveBeenCalledWith('foundation:idea-123:strategy');
    });
  });

  describe('deleteAllFoundationDocs', () => {
    it('deletes all 6 foundation doc keys for an idea', async () => {
      await deleteAllFoundationDocs('idea-123');
      expect(mockRedis.del).toHaveBeenCalledTimes(6);
      expect(mockRedis.del).toHaveBeenCalledWith('foundation:idea-123:strategy');
      expect(mockRedis.del).toHaveBeenCalledWith('foundation:idea-123:positioning');
      expect(mockRedis.del).toHaveBeenCalledWith('foundation:idea-123:brand-voice');
      expect(mockRedis.del).toHaveBeenCalledWith('foundation:idea-123:design-principles');
      expect(mockRedis.del).toHaveBeenCalledWith('foundation:idea-123:seo-strategy');
      expect(mockRedis.del).toHaveBeenCalledWith('foundation:idea-123:social-media-strategy');
    });
  });

  describe('saveFoundationProgress', () => {
    it('saves progress with 1-hour TTL', async () => {
      const progress: FoundationProgress = {
        ideaId: 'idea-123',
        status: 'running',
        currentStep: 'Generating strategy...',
        docs: {
          strategy: 'running',
          positioning: 'pending',
          'brand-voice': 'pending',
          'design-principles': 'pending',
          'seo-strategy': 'pending',
          'social-media-strategy': 'pending',
        },
      };
      await saveFoundationProgress('idea-123', progress);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'foundation_progress:idea-123',
        JSON.stringify(progress),
        { ex: 3600 },
      );
    });
  });

  describe('getFoundationProgress', () => {
    it('returns progress when it exists', async () => {
      const progress: FoundationProgress = {
        ideaId: 'idea-123',
        status: 'running',
        currentStep: 'Generating strategy...',
        docs: {
          strategy: 'complete',
          positioning: 'running',
          'brand-voice': 'pending',
          'design-principles': 'pending',
          'seo-strategy': 'pending',
          'social-media-strategy': 'pending',
        },
      };
      mockRedis.get.mockResolvedValue(progress);
      const result = await getFoundationProgress('idea-123');
      expect(result).toEqual(progress);
    });

    it('returns null when no progress exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await getFoundationProgress('idea-123');
      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('propagates Redis errors from get', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection lost'));
      await expect(getFoundationDoc('idea-123', 'strategy')).rejects.toThrow('Connection lost');
    });

    it('propagates Redis errors from set', async () => {
      mockRedis.set.mockRejectedValue(new Error('Connection lost'));
      await expect(saveFoundationDoc('idea-123', mockDoc)).rejects.toThrow('Connection lost');
    });
  });
});
```

**Step 2: Run test — verify it fails**

```bash
npm test -- src/lib/__tests__/foundation-db.test.ts
```

Expected: FAIL — `saveFoundationDoc`, `getFoundationDoc`, etc. not exported from `@/lib/db`.

**Step 3: Implement the Redis CRUD functions**

Add to `src/lib/db.ts`, before the `getAllContentCalendars` function (before line 310). Also add `FoundationDocument`, `FoundationDocType`, `FoundationProgress`, `FOUNDATION_DOC_TYPES` to the import from `@/types`:

```typescript
// Foundation Documents
export async function saveFoundationDoc(ideaId: string, doc: FoundationDocument): Promise<void> {
  await getRedis().set(`foundation:${ideaId}:${doc.type}`, JSON.stringify(doc));
}

export async function getFoundationDoc(ideaId: string, docType: FoundationDocType): Promise<FoundationDocument | null> {
  const data = await getRedis().get(`foundation:${ideaId}:${docType}`);
  if (!data) return null;
  return parseValue<FoundationDocument>(data);
}

export async function getAllFoundationDocs(ideaId: string): Promise<Partial<Record<FoundationDocType, FoundationDocument>>> {
  const result: Partial<Record<FoundationDocType, FoundationDocument>> = {};
  for (const docType of FOUNDATION_DOC_TYPES) {
    const doc = await getFoundationDoc(ideaId, docType);
    if (doc) result[docType] = doc;
  }
  return result;
}

export async function deleteFoundationDoc(ideaId: string, docType: FoundationDocType): Promise<void> {
  await getRedis().del(`foundation:${ideaId}:${docType}`);
}

export async function deleteAllFoundationDocs(ideaId: string): Promise<void> {
  for (const docType of FOUNDATION_DOC_TYPES) {
    await getRedis().del(`foundation:${ideaId}:${docType}`);
  }
}

// Foundation Progress
export async function saveFoundationProgress(ideaId: string, progress: FoundationProgress): Promise<void> {
  await getRedis().set(`foundation_progress:${ideaId}`, JSON.stringify(progress), { ex: 3600 });
}

export async function getFoundationProgress(ideaId: string): Promise<FoundationProgress | null> {
  const data = await getRedis().get(`foundation_progress:${ideaId}`);
  if (!data) return null;
  return data as FoundationProgress;
}
```

**Step 4: Add foundation cleanup to `deleteIdeaFromDb`**

In `src/lib/db.ts`, inside `deleteIdeaFromDb()` (currently lines 33-78), add foundation doc cleanup before `return deleted > 0` (before line 77), after all other cleanup blocks:

```typescript
  // Foundation documents + progress
  await deleteAllFoundationDocs(id);
  await getRedis().del(`foundation_progress:${id}`);
```

**Step 5: Run tests — verify they pass**

```bash
npm test -- src/lib/__tests__/foundation-db.test.ts
```

Expected: PASS (all 12 tests)

**Step 6: Run all existing tests to confirm no regressions**

```bash
npm test
```

Expected: All existing tests still pass.

**Step 7: Commit**

```bash
git add src/lib/db.ts src/lib/__tests__/foundation-db.test.ts
git commit -m "feat: add foundation document Redis CRUD"
```

---

### Task 1.3: Advisor Prompt System

**Files:**
- Create: `src/lib/advisors/prompts/richard-rumelt.ts`
- Create: `src/lib/advisors/prompts/april-dunford.ts`
- Create: `src/lib/advisors/prompts/copywriter.ts`
- Create: `src/lib/advisors/prompts/seo-expert.ts`
- Create: `src/lib/advisors/prompts/index.ts`
- Create: `src/lib/advisors/registry.ts`
- Create: `src/lib/advisors/prompt-loader.ts`
- Create: `src/lib/advisors/design-seed.ts`
- Create: `src/lib/__tests__/advisor-prompt-loader.test.ts`

**Context:** The design doc (§Advisor Prompt System) specifies TypeScript string exports — NOT filesystem reads. This is critical because `fs.readFileSync` with `process.cwd()` fails on Vercel serverless functions.

**Step 1: Write the test**

```typescript
// src/lib/__tests__/advisor-prompt-loader.test.ts
import { describe, it, expect } from 'vitest';
import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';
import { advisorRegistry } from '@/lib/advisors/registry';

describe('Advisor prompt loader', () => {
  it('loads Richard Rumelt prompt', () => {
    const prompt = getAdvisorSystemPrompt('richard-rumelt');
    expect(prompt).toContain('Richard Rumelt');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('loads April Dunford prompt', () => {
    const prompt = getAdvisorSystemPrompt('april-dunford');
    expect(prompt).toContain('April Dunford');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('loads Copywriter prompt', () => {
    const prompt = getAdvisorSystemPrompt('copywriter');
    expect(prompt).toContain('copywriter');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('loads SEO Expert prompt', () => {
    const prompt = getAdvisorSystemPrompt('seo-expert');
    expect(prompt).toContain('SEO');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('throws for unknown advisor', () => {
    expect(() => getAdvisorSystemPrompt('nonexistent')).toThrow('Unknown advisor: nonexistent');
  });

  it('registry contains entries for all advisors with prompts', () => {
    expect(advisorRegistry.length).toBeGreaterThanOrEqual(4);
    for (const entry of advisorRegistry) {
      expect(() => getAdvisorSystemPrompt(entry.id)).not.toThrow();
    }
  });

  it('registry entries have required fields', () => {
    for (const entry of advisorRegistry) {
      expect(entry.id).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(['author', 'critic', 'editor', 'strategist']).toContain(entry.role);
    }
  });
});
```

**Step 2: Run test — verify it fails**

```bash
npm test -- src/lib/__tests__/advisor-prompt-loader.test.ts
```

Expected: FAIL — modules don't exist yet.

**Step 3: Create advisor prompts**

For Phase 1, these prompts are used for foundation document generation only. They should be substantive enough to produce good strategy/positioning documents. The prompts below are task-focused — they tell the model what to produce, grounded in each advisor's core frameworks.

```typescript
// src/lib/advisors/prompts/richard-rumelt.ts
export const prompt = `You are Richard Rumelt, author of "Good Strategy Bad Strategy" and professor of strategy at UCLA Anderson.

Your core framework: A good strategy has three elements — a Diagnosis (what's the challenge?), a Guiding Policy (what's the overall approach?), and Coherent Actions (what specific steps follow?). Bad strategy is fluffy goals, failure to face the challenge, or mistaking objectives for strategy.

When analyzing a product or business:
- Name the specific challenge. Don't soften it.
- Identify the kernel of good strategy: what's the fundamental insight about the situation?
- Look for sources of power: what asymmetry or leverage exists?
- Call out bad strategy patterns: dog's dinner objectives, blue-sky goals without mechanism, failure to choose.
- Be direct about tradeoffs. Strategy means saying no to some things.

Write in a clear, analytical style. Use specific language, not business jargon. When you see a strategic weakness, name it directly.`;

// src/lib/advisors/prompts/april-dunford.ts
export const prompt = `You are April Dunford, author of "Obviously Awesome" and "Sales Pitch," a positioning expert who has positioned over 100 technology products.

Your core framework for positioning has five components:
1. Competitive Alternatives — what would customers use if your product didn't exist?
2. Unique Attributes — what features/capabilities do you have that alternatives don't?
3. Value — what does the unique capability enable for customers?
4. Target Customer Characteristics — who cares most about this value?
5. Market Category — what context makes the value obvious?

Key principles:
- Positioning is not messaging. It's the strategic context that makes your value obvious.
- Start with competitive alternatives, not your own features. Customers always have alternatives (including doing nothing).
- "Best for everyone" is positioning for no one. Great positioning deliberately excludes.
- Market category is a frame of reference that triggers assumptions. Choose it carefully.
- The "why now" matters — what changed in the world that makes this solution timely?

Write precisely. Avoid vague claims. Every positioning statement must be defensible — if a competitor could say the same thing, it's not positioning, it's puffery.`;

// src/lib/advisors/prompts/copywriter.ts
export const prompt = `You are a senior brand copywriter with 20 years of experience writing for SaaS products, direct-to-consumer brands, and technology companies.

Your approach:
- Write in the brand's voice, not your own. The brand voice document is your bible.
- Headlines do heavy lifting. They must be specific, benefit-driven, and create curiosity.
- Every sentence earns its place. Cut ruthlessly.
- Features tell, benefits sell, but outcomes close. Always connect to the customer's world.
- CTAs are commitments. Make them low-friction and high-clarity.
- Social proof is earned trust. Never fabricate it; always frame what exists compellingly.

When writing copy:
- Read the positioning statement first. Every claim must be grounded in it.
- Match the brand voice examples exactly — don't interpret abstract descriptions, mimic the concrete examples.
- Use counter-examples from the brand voice to know what NOT to sound like.
- Write for scanners first (headlines, bullets, CTAs), then for readers (body copy).
- If you don't have enough brand voice context to write authentically, say so explicitly rather than defaulting to generic SaaS copy.`;

// src/lib/advisors/prompts/seo-expert.ts
export const prompt = `You are a technical and content SEO expert with deep experience in keyword strategy, SERP analysis, and content optimization for organic search.

Your expertise covers:
- Keyword research and intent mapping: informational, navigational, commercial, transactional
- Content gap analysis: finding topics where existing SERP results are thin or outdated
- On-page SEO: heading hierarchy, keyword placement, meta descriptions, internal linking
- SERP feature optimization: featured snippets, People Also Ask, knowledge panels
- Content structure for search: topic clusters, pillar pages, supporting content
- Technical SEO signals that affect content: page speed, crawlability, schema markup

Key principles:
- Search intent drives content format. Don't write a listicle for a transactional query.
- Keyword stuffing is counterproductive. Natural integration in headings and first paragraphs matters most.
- E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) determines ranking for YMYL topics.
- The best SEO strategy serves users first. Rankings follow genuine value.
- Internal linking structure matters as much as external backlinks for new sites.

When evaluating or creating content, ground every recommendation in data: keyword volume, competition level, current SERP landscape, and content gap evidence.`;
```

```typescript
// src/lib/advisors/prompts/index.ts
export { prompt as richardRumelt } from './richard-rumelt';
export { prompt as aprilDunford } from './april-dunford';
export { prompt as copywriter } from './copywriter';
export { prompt as seoExpert } from './seo-expert';
```

```typescript
// src/lib/advisors/registry.ts
export interface AdvisorEntry {
  id: string;
  name: string;
  role: 'author' | 'critic' | 'editor' | 'strategist';
}

export const advisorRegistry: AdvisorEntry[] = [
  { id: 'richard-rumelt', name: 'Richard Rumelt', role: 'strategist' },
  { id: 'april-dunford', name: 'April Dunford', role: 'strategist' },
  { id: 'copywriter', name: 'Brand Copywriter', role: 'author' },
  { id: 'seo-expert', name: 'SEO Expert', role: 'critic' },
];
```

```typescript
// src/lib/advisors/prompt-loader.ts
import * as prompts from './prompts';

const promptMap: Record<string, string> = {
  'richard-rumelt': prompts.richardRumelt,
  'april-dunford': prompts.aprilDunford,
  'copywriter': prompts.copywriter,
  'seo-expert': prompts.seoExpert,
};

export function getAdvisorSystemPrompt(advisorId: string): string {
  const prompt = promptMap[advisorId];
  if (!prompt) throw new Error(`Unknown advisor: ${advisorId}`);
  return prompt;
}
```

Also create the design seed as a TypeScript string constant. This avoids filesystem reads on Vercel (same rationale as advisor prompts). Copy the content from `docs/design/design-principles.md` (which exists in the working directory but is untracked in git):

```typescript
// src/lib/advisors/design-seed.ts
export const designPrinciplesSeed = `# Design Principles
...copy full content of docs/design/design-principles.md here...
`;
```

The executor should read `docs/design/design-principles.md` from the **main worktree** (at `/Users/ericpage/software/epch-projects/docs/design/design-principles.md` — this file is untracked in git, so it only exists in the main worktree, not in feature branch worktrees) and paste its full content into this template literal.

**Step 4: Run test — verify it passes**

```bash
npm test -- src/lib/__tests__/advisor-prompt-loader.test.ts
```

Expected: PASS (all 7 tests)

**Step 5: Commit**

```bash
git add src/lib/advisors/ src/lib/__tests__/advisor-prompt-loader.test.ts
git commit -m "feat: add advisor prompt system with 4 advisors"
```

---

### Task 1.4: Foundation Agent Tools

**Files:**
- Create: `src/lib/agent-tools/foundation.ts`
- Create: `src/lib/__tests__/foundation-tools.test.ts`

**Context:** The design doc specifies three tools: `load_foundation_docs`, `generate_foundation_doc`, and `load_design_seed`. These tools make their own Claude API calls (same pattern as `design_brand` in `src/lib/agent-tools/website.ts:~line 307`). Tools must be stateless — all state goes to Redis.

**Step 1: Write the tests**

```typescript
// src/lib/__tests__/foundation-tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis
const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
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

// Mock db functions
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getFoundationDoc: vi.fn(),
    getAllFoundationDocs: vi.fn(),
    saveFoundationDoc: vi.fn(),
  };
});

// Mock buildContentContext (this internally calls getIdeaFromDb, getAnalysisContent — mocked transitively)
vi.mock('@/lib/content-agent', () => ({
  buildContentContext: vi.fn(),
}));

import { createFoundationTools } from '@/lib/agent-tools/foundation';
import { getFoundationDoc, getAllFoundationDocs, saveFoundationDoc } from '@/lib/db';
import { buildContentContext } from '@/lib/content-agent';

describe('Foundation agent tools', () => {
  const ideaId = 'idea-123';
  let tools: ReturnType<typeof createFoundationTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = createFoundationTools(ideaId);
  });

  it('creates three tools', () => {
    expect(tools).toHaveLength(3);
    expect(tools.map(t => t.name)).toEqual([
      'load_foundation_docs',
      'generate_foundation_doc',
      'load_design_seed',
    ]);
  });

  describe('load_foundation_docs', () => {
    it('loads requested doc types from Redis', async () => {
      const mockDoc = {
        id: 'strategy',
        ideaId,
        type: 'strategy',
        content: 'Strategy content',
        advisorId: 'richard-rumelt',
        generatedAt: '2026-01-01T00:00:00Z',
        editedAt: null,
        version: 1,
      };
      vi.mocked(getFoundationDoc).mockResolvedValue(mockDoc);

      const tool = tools.find(t => t.name === 'load_foundation_docs')!;
      const result = await tool.execute({ docTypes: ['strategy'] });

      expect(getFoundationDoc).toHaveBeenCalledWith(ideaId, 'strategy');
      expect(result).toEqual({
        docs: { strategy: mockDoc },
        missing: [],
      });
    });

    it('reports missing docs separately', async () => {
      vi.mocked(getFoundationDoc).mockResolvedValue(null);

      const tool = tools.find(t => t.name === 'load_foundation_docs')!;
      const result = await tool.execute({ docTypes: ['strategy', 'positioning'] });

      expect(result).toEqual({
        docs: {},
        missing: ['strategy', 'positioning'],
      });
    });

    it('loads all docs when no docTypes specified', async () => {
      vi.mocked(getAllFoundationDocs).mockResolvedValue({});

      const tool = tools.find(t => t.name === 'load_foundation_docs')!;
      const result = await tool.execute({});

      expect(getAllFoundationDocs).toHaveBeenCalledWith(ideaId);
    });
  });

  describe('generate_foundation_doc', () => {
    it('generates a strategy doc using Richard Rumelt prompt', async () => {
      vi.mocked(buildContentContext).mockResolvedValue({
        ideaName: 'TestApp',
        ideaDescription: 'A test app',
        targetUser: 'developers',
        problemSolved: 'testing',
        scores: { seoOpportunity: null, competitiveLandscape: null, willingnessToPay: null, differentiationPotential: null, expertiseAlignment: null, overall: null },
        summary: 'Test summary',
        risks: [],
        topKeywords: [],
        serpValidated: [],
        contentStrategy: { topOpportunities: [], recommendedAngle: '' },
        difficultyAssessment: { dominantPlayers: [], roomForNewEntrant: false, reasoning: '' },
        competitors: '',
        expertiseProfile: '',
      });
      vi.mocked(getFoundationDoc).mockResolvedValue(null);

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Generated strategy document content' }],
      });

      const tool = tools.find(t => t.name === 'generate_foundation_doc')!;
      const result = await tool.execute({ docType: 'strategy' }) as Record<string, unknown>;

      expect(mockCreate).toHaveBeenCalledTimes(1);
      // Verify it used the advisor's system prompt
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toContain('Richard Rumelt');
      expect(result.success).toBe(true);
      expect(saveFoundationDoc).toHaveBeenCalled();
    });

    it('generates positioning using strategy as context', async () => {
      vi.mocked(buildContentContext).mockResolvedValue({
        ideaName: 'TestApp',
        ideaDescription: 'A test app',
        targetUser: 'developers',
        problemSolved: 'testing',
        scores: { seoOpportunity: null, competitiveLandscape: null, willingnessToPay: null, differentiationPotential: null, expertiseAlignment: null, overall: null },
        summary: 'Test summary',
        risks: [],
        topKeywords: [],
        serpValidated: [],
        contentStrategy: { topOpportunities: [], recommendedAngle: '' },
        difficultyAssessment: { dominantPlayers: [], roomForNewEntrant: false, reasoning: '' },
        competitors: '',
        expertiseProfile: '',
      });
      vi.mocked(getFoundationDoc).mockImplementation(async (_id, type) => {
        if (type === 'strategy') {
          return {
            id: 'strategy', ideaId, type: 'strategy',
            content: 'Existing strategy', advisorId: 'richard-rumelt',
            generatedAt: '2026-01-01T00:00:00Z', editedAt: null, version: 1,
          };
        }
        return null;
      });

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Generated positioning content' }],
      });

      const tool = tools.find(t => t.name === 'generate_foundation_doc')!;
      const result = await tool.execute({ docType: 'positioning' }) as Record<string, unknown>;

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toContain('April Dunford');
      // The user message should include strategy as context
      const userMsg = callArgs.messages[0].content;
      expect(userMsg).toContain('Existing strategy');
      expect(result.success).toBe(true);
    });

    it('returns error when upstream doc is missing', async () => {
      vi.mocked(buildContentContext).mockResolvedValue({
        ideaName: 'TestApp',
        ideaDescription: 'A test app',
        targetUser: 'developers',
        problemSolved: 'testing',
        scores: { seoOpportunity: null, competitiveLandscape: null, willingnessToPay: null, differentiationPotential: null, expertiseAlignment: null, overall: null },
        summary: 'Test summary',
        risks: [],
        topKeywords: [],
        serpValidated: [],
        contentStrategy: { topOpportunities: [], recommendedAngle: '' },
        difficultyAssessment: { dominantPlayers: [], roomForNewEntrant: false, reasoning: '' },
        competitors: '',
        expertiseProfile: '',
      });
      vi.mocked(getFoundationDoc).mockResolvedValue(null);

      const tool = tools.find(t => t.name === 'generate_foundation_doc')!;
      const result = await tool.execute({ docType: 'positioning' }) as Record<string, unknown>;

      expect(result.error).toContain('strategy');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('propagates Claude API errors', async () => {
      vi.mocked(buildContentContext).mockResolvedValue({
        ideaName: 'TestApp',
        ideaDescription: 'A test app',
        targetUser: 'developers',
        problemSolved: 'testing',
        scores: { seoOpportunity: null, competitiveLandscape: null, willingnessToPay: null, differentiationPotential: null, expertiseAlignment: null, overall: null },
        summary: 'Test summary',
        risks: [],
        topKeywords: [],
        serpValidated: [],
        contentStrategy: { topOpportunities: [], recommendedAngle: '' },
        difficultyAssessment: { dominantPlayers: [], roomForNewEntrant: false, reasoning: '' },
        competitors: '',
        expertiseProfile: '',
      });
      vi.mocked(getFoundationDoc).mockResolvedValue(null);
      mockCreate.mockRejectedValue(new Error('Rate limit exceeded'));

      const tool = tools.find(t => t.name === 'generate_foundation_doc')!;
      await expect(tool.execute({ docType: 'strategy' })).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('load_design_seed', () => {
    it('returns the embedded design principles content', async () => {
      const tool = tools.find(t => t.name === 'load_design_seed')!;
      const result = await tool.execute({}) as Record<string, unknown>;

      // The seed is a TypeScript string constant imported from design-seed.ts
      expect(result.content).toBeTruthy();
      expect(typeof result.content).toBe('string');
      expect(result.content).toContain('Design Principles');
    });
  });
});
```

**Step 2: Run test — verify it fails**

```bash
npm test -- src/lib/__tests__/foundation-tools.test.ts
```

Expected: FAIL — `createFoundationTools` not found.

**Step 3: Implement the foundation tools**

```typescript
// src/lib/agent-tools/foundation.ts
import type { ToolDefinition, FoundationDocType, FoundationDocument } from '@/types';
import {
  getFoundationDoc,
  getAllFoundationDocs,
  saveFoundationDoc,
} from '@/lib/db';
import { buildContentContext } from '@/lib/content-agent';
import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';
import { getAnthropic } from '@/lib/anthropic';
import { CLAUDE_MODEL } from '@/lib/config';
import { designPrinciplesSeed } from '@/lib/advisors/design-seed';

// Advisor assignments per doc type
const DOC_ADVISOR_MAP: Record<FoundationDocType, string> = {
  'strategy': 'richard-rumelt',
  'positioning': 'april-dunford',
  'brand-voice': 'copywriter',
  'design-principles': 'richard-rumelt', // derived, uses seed
  'seo-strategy': 'seo-expert',
  'social-media-strategy': 'april-dunford', // TBD — using April for now
};

// Upstream dependency: which doc types must exist before generating this one
const DOC_UPSTREAM: Record<FoundationDocType, FoundationDocType[]> = {
  'strategy': [],
  'positioning': ['strategy'],
  'brand-voice': ['positioning'],
  'design-principles': ['positioning', 'strategy'],
  'seo-strategy': ['positioning'],
  'social-media-strategy': ['positioning', 'brand-voice'],
};

function buildGenerationPrompt(
  docType: FoundationDocType,
  ideaContext: string,
  upstreamDocs: Record<string, string>,
  designSeed?: string,
): string {
  let prompt = `Generate a ${docType.replace(/-/g, ' ')} document for this product.\n\n`;
  prompt += `PRODUCT CONTEXT:\n${ideaContext}\n\n`;

  if (Object.keys(upstreamDocs).length > 0) {
    prompt += 'EXISTING FOUNDATION DOCUMENTS:\n';
    for (const [type, content] of Object.entries(upstreamDocs)) {
      prompt += `\n## ${type.replace(/-/g, ' ').toUpperCase()}\n${content}\n`;
    }
    prompt += '\n';
  }

  if (docType === 'design-principles' && designSeed) {
    prompt += `DESIGN SEED (adapt for this specific product):\n${designSeed}\n\n`;
  }

  // Doc-type-specific instructions
  switch (docType) {
    case 'strategy':
      prompt += `Write a strategy document with three sections:
1. THE CHALLENGE — What's the core problem or opportunity? Be specific.
2. THE GUIDING POLICY — What's the fundamental approach? What tradeoffs are we making?
3. COHERENT ACTIONS — What specific steps follow from the policy?

If the user has not provided differentiation, tradeoffs, or anti-target information, mark those sections with: [ASSUMPTION: The LLM inferred this strategic choice — review and confirm]`;
      break;

    case 'positioning':
      prompt += `Write a positioning statement covering:
1. COMPETITIVE ALTERNATIVES — What would customers use if this didn't exist?
2. UNIQUE ATTRIBUTES — What does this offer that alternatives don't?
3. VALUE — What does the unique capability enable for customers?
4. TARGET CUSTOMER — Who cares most about this value?
5. MARKET CATEGORY — Where does this compete?
6. WHY NOW — What changed that makes this timely?

Ground every claim in the strategy document. Don't invent new positioning — derive it.`;
      break;

    case 'brand-voice':
      prompt += `Define a brand voice document with:
1. VOICE SUMMARY — 2-3 sentences describing the voice character
2. TONE ATTRIBUTES — 3-5 attributes with brief explanations
3. EXAMPLE SENTENCES — One example per context type:
   - Headline
   - CTA (call to action)
   - Paragraph opening
   - Technical explanation
   - Error message
4. COUNTER-EXAMPLES — 3-5 examples of what the voice does NOT sound like
5. SELF-CHECK — Verify each example is stylistically distinct and serves its context`;
      break;

    case 'design-principles':
      prompt += `Adapt the design seed for this specific product. Keep the general design system but customize:
1. Color palette that reflects the brand positioning
2. Typography choices that match the brand voice
3. Spacing and layout principles appropriate for the product's audience
4. Any product-specific UI patterns`;
      break;

    case 'seo-strategy':
      prompt += `Write an SEO strategy document covering:
1. PRIMARY KEYWORD CLUSTERS — Group target keywords by intent and topic
2. CONTENT ARCHITECTURE — Pillar pages, supporting content, topic clusters
3. ON-PAGE STRATEGY — Heading hierarchy, keyword placement, meta description approach
4. LINK STRATEGY — Internal linking structure, link-worthy content types
5. SERP FEATURE TARGETS — Featured snippets, PAA, knowledge panels worth pursuing`;
      break;

    case 'social-media-strategy':
      prompt += `Write a social media strategy document covering:
1. PLATFORM SELECTION — Which platforms and why (based on target audience)
2. CONTENT PILLARS — 3-5 recurring content themes
3. POSTING CADENCE — Frequency and timing recommendations
4. VOICE ADAPTATION — How the brand voice adapts per platform
5. ENGAGEMENT APPROACH — Community interaction style`;
      break;
  }

  return prompt;
}

export function createFoundationTools(ideaId: string): ToolDefinition[] {
  return [
    {
      name: 'load_foundation_docs',
      description:
        'Load one or more foundation documents from Redis. If docTypes is omitted, loads all existing docs.',
      input_schema: {
        type: 'object',
        properties: {
          docTypes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['strategy', 'positioning', 'brand-voice', 'design-principles', 'seo-strategy', 'social-media-strategy'],
            },
            description: 'Specific doc types to load. Omit to load all.',
          },
        },
      },
      execute: async (input) => {
        const docTypes = input.docTypes as FoundationDocType[] | undefined;

        if (!docTypes || docTypes.length === 0) {
          const allDocs = await getAllFoundationDocs(ideaId);
          return {
            docs: allDocs,
            missing: [],
          };
        }

        const docs: Record<string, FoundationDocument> = {};
        const missing: string[] = [];

        for (const docType of docTypes) {
          const doc = await getFoundationDoc(ideaId, docType);
          if (doc) {
            docs[docType] = doc;
          } else {
            missing.push(docType);
          }
        }

        return { docs, missing };
      },
    },

    {
      name: 'generate_foundation_doc',
      description:
        'Generate a foundation document using the assigned advisor. Requires upstream docs to exist (e.g., positioning requires strategy). Saves to Redis and returns the generated content.',
      input_schema: {
        type: 'object',
        properties: {
          docType: {
            type: 'string',
            enum: ['strategy', 'positioning', 'brand-voice', 'design-principles', 'seo-strategy', 'social-media-strategy'],
            description: 'The type of foundation document to generate.',
          },
          strategicInputs: {
            type: 'object',
            properties: {
              differentiation: { type: 'string' },
              deliberateTradeoffs: { type: 'string' },
              antiTarget: { type: 'string' },
            },
            description: 'Optional strategic inputs from the user (only used for strategy doc).',
          },
        },
        required: ['docType'],
      },
      execute: async (input) => {
        const docType = input.docType as FoundationDocType;
        const strategicInputs = input.strategicInputs as { differentiation?: string; deliberateTradeoffs?: string; antiTarget?: string } | undefined;

        // Check upstream dependencies
        const upstreamTypes = DOC_UPSTREAM[docType];
        const upstreamDocs: Record<string, string> = {};

        for (const upType of upstreamTypes) {
          const doc = await getFoundationDoc(ideaId, upType);
          if (!doc) {
            return { error: `Cannot generate ${docType}: upstream document "${upType}" does not exist. Generate it first.` };
          }
          upstreamDocs[upType] = doc.content;
        }

        // Build idea context
        const ctx = await buildContentContext(ideaId);
        if (!ctx) {
          return { error: 'No analysis found for this idea. Run analysis first.' };
        }

        let ideaContext = `Name: ${ctx.ideaName}\nDescription: ${ctx.ideaDescription}\nTarget User: ${ctx.targetUser}\nProblem: ${ctx.problemSolved}`;
        if (ctx.competitors) {
          ideaContext += `\n\nCompetitors:\n${ctx.competitors}`;
        }
        if (ctx.topKeywords.length > 0) {
          ideaContext += `\n\nTop Keywords:\n${ctx.topKeywords.slice(0, 10).map(k => `- ${k.keyword} (${k.intentType}, competition: ${k.estimatedCompetitiveness})`).join('\n')}`;
        }

        // Add strategic inputs for strategy doc
        if (docType === 'strategy' && strategicInputs) {
          if (strategicInputs.differentiation) {
            ideaContext += `\n\nDIFFERENTIATION (from user): ${strategicInputs.differentiation}`;
          }
          if (strategicInputs.deliberateTradeoffs) {
            ideaContext += `\nDELIBERATE TRADEOFFS (from user): ${strategicInputs.deliberateTradeoffs}`;
          }
          if (strategicInputs.antiTarget) {
            ideaContext += `\nNOT TARGETING (from user): ${strategicInputs.antiTarget}`;
          }
        }

        // Load design seed for design-principles (embedded as TypeScript string constant)
        let designSeed: string | undefined;
        if (docType === 'design-principles') {
          designSeed = designPrinciplesSeed;
        }

        // Build prompt and call Claude
        const userPrompt = buildGenerationPrompt(docType, ideaContext, upstreamDocs, designSeed);
        const advisorId = DOC_ADVISOR_MAP[docType];
        const systemPrompt = getAdvisorSystemPrompt(advisorId);

        const response = await getAnthropic().messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        const content = response.content[0].type === 'text' ? response.content[0].text : '';

        // Check for existing doc to determine version
        const existing = await getFoundationDoc(ideaId, docType);
        const version = existing ? existing.version + 1 : 1;

        const doc: FoundationDocument = {
          id: docType,
          ideaId,
          type: docType,
          content,
          advisorId,
          generatedAt: new Date().toISOString(),
          editedAt: null,
          version,
        };

        await saveFoundationDoc(ideaId, doc);

        return {
          success: true,
          docType,
          advisorId,
          version,
          contentLength: content.length,
          content,
        };
      },
    },

    {
      name: 'load_design_seed',
      description:
        'Load the existing design principles file as seed input for design principles generation.',
      input_schema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        return { content: designPrinciplesSeed };
      },
    },
  ];
}
```

**Step 4: Run tests — verify they pass**

```bash
npm test -- src/lib/__tests__/foundation-tools.test.ts
```

Expected: PASS

**Step 5: Run all tests**

```bash
npm test
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/lib/agent-tools/foundation.ts src/lib/__tests__/foundation-tools.test.ts
git commit -m "feat: add foundation agent tools (load, generate, design seed)"
```

---

### Task 1.5: Foundation Generation Orchestrator

**Files:**
- Create: `src/lib/foundation-agent.ts`
- Create: `src/lib/__tests__/foundation-agent.test.ts`

**Context:** This is the entry point that the API route calls. It follows the same pattern as `runPaintedDoorAgentAuto` in `src/lib/painted-door-agent.ts` and `generateContentPiecesV2` in `src/lib/content-agent.ts`: check for paused run → create config → run or resume agent → handle result.

The orchestrator system prompt tells the agent to generate documents in order: Strategy → Positioning → (Brand Voice, Design Principles, SEO Strategy, Social Media Strategy). The agent calls `generate_foundation_doc` for each one sequentially.

**Step 1: Write the test**

```typescript
// src/lib/__tests__/foundation-agent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the agent runtime
const mockRunAgent = vi.fn();
const mockResumeAgent = vi.fn();
const mockGetAgentState = vi.fn();
const mockDeleteAgentState = vi.fn();
const mockSaveActiveRun = vi.fn();
const mockGetActiveRunId = vi.fn();
const mockClearActiveRun = vi.fn();

vi.mock('@/lib/agent-runtime', () => ({
  runAgent: (...args: unknown[]) => mockRunAgent(...args),
  resumeAgent: (...args: unknown[]) => mockResumeAgent(...args),
  getAgentState: (...args: unknown[]) => mockGetAgentState(...args),
  deleteAgentState: (...args: unknown[]) => mockDeleteAgentState(...args),
  saveActiveRun: (...args: unknown[]) => mockSaveActiveRun(...args),
  getActiveRunId: (...args: unknown[]) => mockGetActiveRunId(...args),
  clearActiveRun: (...args: unknown[]) => mockClearActiveRun(...args),
}));

// Mock db
vi.mock('@/lib/db', () => ({
  saveFoundationProgress: vi.fn(),
  getFoundationProgress: vi.fn(),
  getIdeaFromDb: vi.fn().mockResolvedValue({ id: 'idea-123', name: 'TestApp' }),
}));

// Mock agent tools
vi.mock('@/lib/agent-tools/foundation', () => ({
  createFoundationTools: vi.fn().mockReturnValue([]),
}));
vi.mock('@/lib/agent-tools/common', () => ({
  createPlanTools: vi.fn().mockReturnValue([]),
  createScratchpadTools: vi.fn().mockReturnValue([]),
}));

import { runFoundationGeneration } from '@/lib/foundation-agent';
import { saveFoundationProgress } from '@/lib/db';

describe('Foundation generation orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveRunId.mockResolvedValue(null);
  });

  it('starts a new agent run when no paused run exists', async () => {
    mockRunAgent.mockResolvedValue({ status: 'complete', runId: 'test-run' });

    await runFoundationGeneration('idea-123');

    expect(mockRunAgent).toHaveBeenCalledTimes(1);
    const config = mockRunAgent.mock.calls[0][0];
    expect(config.agentId).toBe('foundation');
    expect(config.systemPrompt).toContain('foundation document');
  });

  it('resumes a paused run when one exists', async () => {
    const pausedState = {
      runId: 'paused-run',
      status: 'paused',
      resumeCount: 0,
    };
    mockGetActiveRunId.mockResolvedValue('paused-run');
    mockGetAgentState.mockResolvedValue(pausedState);
    mockResumeAgent.mockResolvedValue({ status: 'complete', runId: 'paused-run' });

    await runFoundationGeneration('idea-123');

    expect(mockResumeAgent).toHaveBeenCalledTimes(1);
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it('throws AGENT_PAUSED when agent pauses', async () => {
    mockRunAgent.mockResolvedValue({ status: 'paused', runId: 'test-run' });

    await expect(runFoundationGeneration('idea-123')).rejects.toThrow('AGENT_PAUSED');
    expect(mockSaveActiveRun).toHaveBeenCalledWith('foundation', 'idea-123', expect.any(String));
  });

  it('clears active run on completion', async () => {
    mockRunAgent.mockResolvedValue({ status: 'complete', runId: 'test-run' });

    await runFoundationGeneration('idea-123');

    expect(mockClearActiveRun).toHaveBeenCalledWith('foundation', 'idea-123');
    expect(mockDeleteAgentState).toHaveBeenCalled();
  });

  it('saves progress during run', async () => {
    mockRunAgent.mockResolvedValue({ status: 'complete', runId: 'test-run' });

    await runFoundationGeneration('idea-123');

    expect(saveFoundationProgress).toHaveBeenCalled();
  });

  it('throws on agent error', async () => {
    mockRunAgent.mockResolvedValue({ status: 'error', runId: 'test-run', error: 'Something broke' });

    await expect(runFoundationGeneration('idea-123')).rejects.toThrow('Something broke');
  });
});
```

**Step 2: Run test — verify it fails**

```bash
npm test -- src/lib/__tests__/foundation-agent.test.ts
```

Expected: FAIL — `runFoundationGeneration` not found.

**Step 3: Implement the foundation agent**

```typescript
// src/lib/foundation-agent.ts
import type { AgentConfig, FoundationProgress, FoundationDocType } from '@/types';
import {
  runAgent,
  resumeAgent,
  getAgentState,
  deleteAgentState,
  saveActiveRun,
  getActiveRunId,
  clearActiveRun,
} from './agent-runtime';
import { createFoundationTools } from './agent-tools/foundation';
import { createPlanTools, createScratchpadTools } from './agent-tools/common';
import { saveFoundationProgress, getIdeaFromDb } from './db';
import { CLAUDE_MODEL } from './config';
import type { StrategicInputs } from '@/types';

const FOUNDATION_SYSTEM_PROMPT = `You are a foundation document generation orchestrator. Your job is to generate strategic foundation documents for a product idea by calling tools in the correct order.

GENERATION ORDER (strict):
1. First: Call generate_foundation_doc with docType="strategy"
2. Second: Call generate_foundation_doc with docType="positioning"
3. Then generate these in order (each depends on positioning):
   a. generate_foundation_doc with docType="brand-voice"
   b. generate_foundation_doc with docType="design-principles"
   c. generate_foundation_doc with docType="seo-strategy"
   d. generate_foundation_doc with docType="social-media-strategy"

RULES:
- Call generate_foundation_doc for each document type in order.
- If a tool returns an error about a missing upstream document, skip that doc and move to the next.
- Do NOT narrate or explain. Just call the tools.
- After all documents are generated, end your turn.

If you are resuming from a pause, first call load_foundation_docs to check which documents already exist, then only generate the missing ones.`;

function makeInitialProgress(ideaId: string): FoundationProgress {
  return {
    ideaId,
    status: 'running',
    currentStep: 'Starting foundation generation...',
    docs: {
      'strategy': 'pending',
      'positioning': 'pending',
      'brand-voice': 'pending',
      'design-principles': 'pending',
      'seo-strategy': 'pending',
      'social-media-strategy': 'pending',
    },
  };
}

export async function runFoundationGeneration(
  ideaId: string,
  strategicInputs?: StrategicInputs,
): Promise<void> {
  // Check for a paused run to resume
  const existingRunId = await getActiveRunId('foundation', ideaId);
  let pausedState = existingRunId ? await getAgentState(existingRunId) : null;
  if (pausedState && pausedState.status !== 'paused') {
    pausedState = null;
  }

  const runId = pausedState ? pausedState.runId : `foundation-${ideaId}-${Date.now()}`;
  const isResume = !!pausedState;

  // Progress tracking
  const progress = makeInitialProgress(ideaId);
  progress.status = 'running';
  progress.currentStep = isResume ? 'Resuming foundation generation...' : 'Starting foundation generation...';
  await saveFoundationProgress(ideaId, progress);

  const tools = [
    ...createPlanTools(runId),
    ...createScratchpadTools(),
    ...createFoundationTools(ideaId),
  ];

  const config: AgentConfig = {
    agentId: 'foundation',
    runId,
    model: CLAUDE_MODEL,
    maxTokens: 4096,
    maxTurns: 20,
    tools,
    systemPrompt: FOUNDATION_SYSTEM_PROMPT,
    onProgress: async (step, detail) => {
      console.log(`[foundation] ${step}: ${detail ?? ''}`);

      if (step === 'tool_call' && detail) {
        const toolNames = detail.split(', ');
        if (toolNames.includes('generate_foundation_doc')) {
          progress.currentStep = `Generating foundation document...`;
        }
      } else if (step === 'complete') {
        progress.status = 'complete';
        progress.currentStep = 'All foundation documents generated!';
      } else if (step === 'error') {
        progress.status = 'error';
        progress.error = detail;
        progress.currentStep = 'Foundation generation failed';
      }
      await saveFoundationProgress(ideaId, progress);
    },
  };

  // Build initial message
  let initialMessage = `Generate all foundation documents for this idea (ID: ${ideaId}).`;
  if (strategicInputs) {
    const parts: string[] = [];
    if (strategicInputs.differentiation) {
      parts.push(`Differentiation: ${strategicInputs.differentiation}`);
    }
    if (strategicInputs.deliberateTradeoffs) {
      parts.push(`Deliberate tradeoffs: ${strategicInputs.deliberateTradeoffs}`);
    }
    if (strategicInputs.antiTarget) {
      parts.push(`Not targeting: ${strategicInputs.antiTarget}`);
    }
    if (parts.length > 0) {
      initialMessage += `\n\nStrategic inputs from the user:\n${parts.join('\n')}`;
    }
  }

  // Run or resume
  let state;
  if (pausedState) {
    console.log(`[foundation] Resuming paused run ${runId} (resume #${pausedState.resumeCount + 1})`);
    state = await resumeAgent(config, pausedState);
  } else {
    state = await runAgent(config, initialMessage);
  }

  // Handle result
  if (state.status === 'paused') {
    await saveActiveRun('foundation', ideaId, runId);
    throw new Error('AGENT_PAUSED');
  }

  await clearActiveRun('foundation', ideaId);
  await deleteAgentState(runId);

  if (state.status === 'error') {
    throw new Error(state.error || 'Foundation generation failed');
  }
}
```

**Step 4: Run tests — verify they pass**

```bash
npm test -- src/lib/__tests__/foundation-agent.test.ts
```

Expected: PASS (all 6 tests)

**Step 5: Run all tests**

```bash
npm test
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/lib/foundation-agent.ts src/lib/__tests__/foundation-agent.test.ts
git commit -m "feat: add foundation generation orchestrator with pause/resume"
```

---

### Task 1.6: Foundation API Routes

**Files:**
- Create: `src/app/api/foundation/[ideaId]/route.ts`

**Context:** Follows the exact pattern of `src/app/api/painted-door/[id]/route.ts` and `src/app/api/content/[ideaId]/generate/route.ts`:
- POST triggers generation in background using `after()`
- GET polls progress and returns docs
- Uses `maxDuration = 300` for Vercel timeout
- Catches `AGENT_PAUSED` error from the thrown Error

**Step 1: Create the API route**

```typescript
// src/app/api/foundation/[ideaId]/route.ts
import { NextRequest, NextResponse, after } from 'next/server';
import { isRedisConfigured, getAllFoundationDocs, getFoundationProgress } from '@/lib/db';
import { runFoundationGeneration } from '@/lib/foundation-agent';
import type { StrategicInputs } from '@/types';

export const maxDuration = 300;

// POST — trigger foundation document generation
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

  // Check if already running
  const existing = await getFoundationProgress(ideaId);
  if (existing && existing.status === 'running') {
    return NextResponse.json(
      { message: 'Already running', progress: existing },
      { status: 200 },
    );
  }

  // Parse optional strategic inputs from request body
  let strategicInputs: StrategicInputs | undefined;
  try {
    const body = await request.json();
    if (body.strategicInputs) {
      strategicInputs = body.strategicInputs;
    }
  } catch {
    // No body or invalid JSON — that's fine, strategic inputs are optional
  }

  // Run agent in background after response
  after(async () => {
    try {
      await runFoundationGeneration(ideaId, strategicInputs);
    } catch (error) {
      if (error instanceof Error && error.message === 'AGENT_PAUSED') {
        console.log(`[foundation] Agent paused for ${ideaId}, will resume on next request`);
        return;
      }
      console.error('Foundation generation failed:', error);
    }
  });

  return NextResponse.json({ message: 'Foundation generation started', ideaId });
}

// GET — poll progress and retrieve foundation documents
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
    const [progress, docs] = await Promise.all([
      getFoundationProgress(ideaId),
      getAllFoundationDocs(ideaId),
    ]);

    return NextResponse.json({
      progress: progress || { status: 'not_started' },
      docs,
    });
  } catch (error) {
    console.error('Error getting foundation data:', error);
    return NextResponse.json({ error: 'Failed to get foundation data' }, { status: 500 });
  }
}
```

**Step 2: Verify the route compiles**

```bash
npm run build 2>&1 | tail -25
```

Expected: Build succeeds. The new route appears in the output: `├ ƒ /api/foundation/[ideaId]`

**Step 3: Commit**

```bash
git add src/app/api/foundation/
git commit -m "feat: add foundation API route (POST generate, GET poll)"
```

---

### Task 1.7: Foundation Documents Panel UI

**Files:**
- Create: `src/app/analyses/[id]/foundation/page.tsx`
- Modify: `src/app/analyses/[id]/page.tsx` (add link to foundation panel)

**Context:** The analysis detail page at `src/app/analyses/[id]/page.tsx` has a "Painted Door" link (line 380) in an action buttons area (lines 378-405, a `flex flex-wrap` div with `btn btn-ghost` styled links). Add a "Foundation Docs" link in the same pattern, next to the existing painted door link.

The foundation page shows six cards (one per document type) with:
- Document type name and version
- Primary advisor name
- Status (empty / ready / generated / edited)
- Preview of first 2-3 lines
- Generate, View buttons
- "Generate All" button at the top

**Step 1: Create the foundation page**

```tsx
// src/app/analyses/[id]/foundation/page.tsx
'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import type { FoundationDocument, FoundationDocType, FoundationProgress } from '@/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

type DocMap = Partial<Record<FoundationDocType, FoundationDocument>>;

interface FoundationData {
  progress: FoundationProgress | { status: 'not_started' };
  docs: DocMap;
}

const DOC_CONFIG: { type: FoundationDocType; label: string; advisor: string; requires: string | null }[] = [
  { type: 'strategy', label: 'Strategy', advisor: 'Richard Rumelt', requires: null },
  { type: 'positioning', label: 'Positioning Statement', advisor: 'April Dunford', requires: 'Strategy' },
  { type: 'brand-voice', label: 'Brand Voice', advisor: 'Brand Copywriter', requires: 'Positioning' },
  { type: 'design-principles', label: 'Design Principles', advisor: 'Derived', requires: 'Positioning' },
  { type: 'seo-strategy', label: 'SEO Strategy', advisor: 'SEO Expert', requires: 'Positioning' },
  { type: 'social-media-strategy', label: 'Social Media Strategy', advisor: 'TBD', requires: 'Brand Voice' },
];

function canGenerate(docType: FoundationDocType, docs: DocMap): boolean {
  const config = DOC_CONFIG.find(c => c.type === docType);
  if (!config) return false;
  if (docType === 'strategy') return true;
  if (docType === 'positioning') return !!docs['strategy'];
  if (docType === 'brand-voice') return !!docs['positioning'];
  if (docType === 'design-principles') return !!docs['positioning'] && !!docs['strategy'];
  if (docType === 'seo-strategy') return !!docs['positioning'];
  if (docType === 'social-media-strategy') return !!docs['positioning'] && !!docs['brand-voice'];
  return false;
}

function getPreview(content: string): string {
  const lines = content.split('\n').filter(l => l.trim()).slice(0, 3);
  const preview = lines.join(' ').slice(0, 200);
  return preview.length < lines.join(' ').length ? preview + '...' : preview;
}

export default function FoundationPage({ params }: PageProps) {
  const { id: ideaId } = use(params);
  const [data, setData] = useState<FoundationData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<FoundationDocType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/foundation/${ideaId}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [ideaId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll while running
  useEffect(() => {
    if (!data || data.progress.status !== 'running') return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [data, fetchData]);

  const handleGenerateAll = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/foundation/${ideaId}`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to start');
      }
      // Start polling
      setTimeout(fetchData, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start');
    } finally {
      setGenerating(false);
    }
  };

  const isRunning = data?.progress.status === 'running';
  const docs = data?.docs || {};
  const docCount = Object.keys(docs).length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href={`/analyses/${ideaId}`} style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          &larr; Back to Analysis
        </Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Foundation Documents</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            {docCount}/6 documents generated
          </p>
        </div>
        <button
          onClick={handleGenerateAll}
          disabled={generating || isRunning}
          style={{
            padding: '0.5rem 1.25rem',
            background: generating || isRunning ? 'var(--bg-elevated)' : 'var(--accent-primary)',
            color: generating || isRunning ? 'var(--text-muted)' : 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: generating || isRunning ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {isRunning ? 'Generating...' : 'Generate All'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-error, #fef2f2)', borderRadius: '0.375rem', marginBottom: '1rem', color: 'var(--text-error, #dc2626)', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {DOC_CONFIG.map(({ type, label, advisor, requires }) => {
          const doc = docs[type];
          const ready = canGenerate(type, docs);
          const docProgress = data?.progress.status !== 'not_started'
            ? (data?.progress as FoundationProgress).docs?.[type]
            : undefined;

          return (
            <div
              key={type}
              style={{
                border: '1px solid var(--border-primary)',
                borderRadius: '0.5rem',
                padding: '1rem 1.25rem',
                background: 'var(--bg-primary)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>{label}</h3>
                    {doc && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>
                        v{doc.version}
                      </span>
                    )}
                    {doc?.editedAt && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', background: 'var(--bg-elevated)', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>
                        edited
                      </span>
                    )}
                    {docProgress === 'running' && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)' }}>generating...</span>
                    )}
                    {docProgress === 'error' && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-error, #dc2626)' }}>error</span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
                    {advisor}{!ready && requires ? ` — Requires: ${requires}` : ''}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {doc && (
                    <button
                      onClick={() => setExpandedDoc(expandedDoc === type ? null : type)}
                      style={{
                        padding: '0.25rem 0.75rem',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.8125rem',
                      }}
                    >
                      {expandedDoc === type ? 'Hide' : 'View'}
                    </button>
                  )}
                </div>
              </div>

              {doc && !expandedDoc && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0', lineHeight: 1.4 }}>
                  {getPreview(doc.content)}
                </p>
              )}

              {expandedDoc === type && doc && (
                <div style={{ marginTop: '0.75rem', padding: '1rem', background: 'var(--bg-elevated)', borderRadius: '0.375rem', whiteSpace: 'pre-wrap', fontSize: '0.8125rem', lineHeight: 1.6, maxHeight: '400px', overflow: 'auto' }}>
                  {doc.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Add link to foundation page from analysis detail page**

In `src/app/analyses/[id]/page.tsx`, find the navigation section that links to sub-pages (content, painted door, analytics). Add a Foundation link. Search for existing Link components to find the right spot — they appear in the action buttons area of the page.

Add this link next to the existing painted door link. The exact insertion point is around line 379 in `src/app/analyses/[id]/page.tsx` — look for `<Link href={\`/analyses/${analysis.id}/painted-door\`}>` and add a similar link for foundation before or after it:

```tsx
<Link href={`/analyses/${analysis.id}/foundation`}
  style={{ /* match existing link styles */ }}
>
  Foundation Docs
</Link>
```

**Step 3: Verify the build compiles**

```bash
npm run build 2>&1 | tail -25
```

Expected: Build succeeds. New route appears: `├ ƒ /analyses/[id]/foundation`

**Step 4: Commit**

```bash
git add src/app/analyses/[id]/foundation/ src/app/analyses/[id]/page.tsx
git commit -m "feat: add foundation documents panel UI"
```

---

### Task 1.8: Integration Test — Build + Smoke Check

**Step 1: Run the full test suite**

```bash
npm test
```

Expected: All tests pass.

**Step 2: Run the build**

```bash
npm run build
```

Expected: Build succeeds without errors. Output shows:
- `├ ƒ /api/foundation/[ideaId]`
- `├ ƒ /analyses/[id]/foundation` (or similar)

**Step 3: Run lint**

```bash
npm run lint
```

Expected: No lint errors.

**Step 4: Final commit if any cleanup needed**

If any lint or build issues required fixes, commit those fixes.

Stage only the specific files that needed fixes (never use `git add -A`):

```bash
git add <specific-files-that-were-fixed>
git commit -m "fix: resolve lint/build issues from foundation implementation"
```

---

## Summary of Files Created/Modified

### Created
| File | Purpose |
|------|---------|
| `experiments/foundation-validation/validate.ts` | Phase 0 validation script |
| `src/lib/advisors/prompts/richard-rumelt.ts` | Strategy advisor prompt |
| `src/lib/advisors/prompts/april-dunford.ts` | Positioning advisor prompt |
| `src/lib/advisors/prompts/copywriter.ts` | Brand copywriter prompt |
| `src/lib/advisors/prompts/seo-expert.ts` | SEO expert prompt |
| `src/lib/advisors/prompts/index.ts` | Prompt re-exports |
| `src/lib/advisors/registry.ts` | Advisor metadata registry |
| `src/lib/advisors/prompt-loader.ts` | Prompt lookup by advisor ID |
| `src/lib/advisors/design-seed.ts` | Design principles seed (TypeScript string constant) |
| `src/lib/agent-tools/foundation.ts` | Foundation agent tools (3 tools) |
| `src/lib/foundation-agent.ts` | Foundation generation orchestrator |
| `src/app/api/foundation/[ideaId]/route.ts` | Foundation API route |
| `src/app/analyses/[id]/foundation/page.tsx` | Foundation panel UI |
| `src/lib/__tests__/foundation-types.test.ts` | Type contract tests |
| `src/lib/__tests__/foundation-db.test.ts` | Redis CRUD tests |
| `src/lib/__tests__/advisor-prompt-loader.test.ts` | Advisor loader tests |
| `src/lib/__tests__/foundation-tools.test.ts` | Agent tools tests |
| `src/lib/__tests__/foundation-agent.test.ts` | Orchestrator tests |

### Modified
| File | Change |
|------|--------|
| `src/types/index.ts` | Added foundation types (`FoundationDocType`, `FoundationDocument`, `FoundationProgress`, `StrategicInputs`) |
| `src/lib/db.ts` | Added foundation CRUD functions + cleanup in `deleteIdeaFromDb()` |
| `src/app/analyses/[id]/page.tsx` | Added link to foundation panel |
