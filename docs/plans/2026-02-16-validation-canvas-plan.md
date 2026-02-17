# Validation Canvas Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add a Validation Canvas to each Project page that tracks five business assumptions (Demand, Reachability, Engagement, WTP, Differentiation) through their lifecycle, with auto-evaluation from analytics data and a pivot suggestion system for invalidated assumptions.

**Source Design Doc:** `docs/plans/2026-02-16-validation-canvas-design.md`

**Architecture:** New `src/lib/validation-canvas.ts` module provides canvas CRUD, assumption evaluation, and pivot suggestion generation. Three new API routes handle GET/POST operations. A `ValidationCanvas` client component renders the horizontal five-card layout at the top of the project page. The analytics cron calls `evaluateAssumptions()` after each run.

**Tech Stack:** Next.js 16, React 19, TypeScript, Upstash Redis, Anthropic SDK (Claude for pivot suggestions), Tailwind CSS 4, Vitest

---

## Prerequisites

> Complete these steps manually before starting Task 1.

- [ ] None — all prerequisites are already in place.

---

### Task 1: Add Validation Canvas Types

**Files:**
- Modify: `src/types/index.ts` (append after line ~444, after the `CritiqueIssue` interface)

**Step 1: Write the type definitions**

Add these types at the end of `src/types/index.ts`:

```typescript
// Validation Canvas Types

export type AssumptionType = 'demand' | 'reachability' | 'engagement' | 'wtp' | 'differentiation';

export const ASSUMPTION_TYPES: AssumptionType[] = [
  'demand', 'reachability', 'engagement', 'wtp', 'differentiation',
];

export type AssumptionStatus = 'untested' | 'testing' | 'validated' | 'invalidated' | 'pivoted';

export interface AssumptionThreshold {
  validated: string;
  invalidated: string;
  windowDays: number;
}

export interface Assumption {
  type: AssumptionType;
  status: AssumptionStatus;
  statement: string;
  evidence: string[];
  threshold: AssumptionThreshold;
  linkedStage: string;
  validatedAt?: number;
  invalidatedAt?: number;
}

export interface PivotSuggestion {
  statement: string;
  evidence: string[];
  impact: string;
  experiment: string;
}

export interface PivotRecord {
  fromStatement: string;
  toStatement: string;
  reason: string;
  suggestedBy: 'system';
  approvedBy: 'curator';
  timestamp: number;
  alternatives: PivotSuggestion[];
}

export interface CanvasState {
  status: 'active' | 'killed';
  killedAt?: number;
  killedReason?: string;
}

export interface ValidationCanvasData {
  canvas: CanvasState;
  assumptions: Record<AssumptionType, Assumption>;
  pivotSuggestions: Partial<Record<AssumptionType, PivotSuggestion[]>>;
  pivotHistory: Partial<Record<AssumptionType, PivotRecord[]>>;
}
```

**Step 2: Verify the build compiles**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: No errors (or only pre-existing errors unrelated to your changes)

**Step 3: Commit**

```
git add src/types/index.ts
git commit -m "feat(validation-canvas): add type definitions for canvas, assumptions, pivots"
```

---

### Task 2: Add Validation Canvas DB Functions

**Files:**
- Modify: `src/lib/db.ts` (add functions after the foundation doc section, ~line 82)
- Create: `src/lib/__tests__/validation-canvas-db.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/__tests__/validation-canvas-db.test.ts`. Follow the exact Redis mock pattern from `src/lib/__tests__/foundation-db.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  saveCanvasState,
  getCanvasState,
  saveAssumption,
  getAssumption,
  getAllAssumptions,
  savePivotSuggestions,
  getPivotSuggestions,
  clearPivotSuggestions,
  appendPivotHistory,
  getPivotHistory,
  deleteCanvasData,
} from '@/lib/db';
import type { CanvasState, Assumption, PivotSuggestion, PivotRecord } from '@/types';

describe('Validation Canvas DB functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCanvas: CanvasState = { status: 'active' };
  const mockAssumption: Assumption = {
    type: 'demand',
    status: 'untested',
    statement: '500+ monthly searches for target keywords',
    evidence: [],
    threshold: {
      validated: '500+ monthly searches, < 20 competitors',
      invalidated: '< 100 monthly searches',
      windowDays: 0,
    },
    linkedStage: 'analysis',
  };

  describe('saveCanvasState', () => {
    it('saves canvas state to the correct Redis key', async () => {
      await saveCanvasState('idea-1', mockCanvas);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'canvas:idea-1',
        JSON.stringify(mockCanvas),
      );
    });
  });

  describe('getCanvasState', () => {
    it('returns canvas state when it exists', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(mockCanvas));
      const result = await getCanvasState('idea-1');
      expect(mockRedis.get).toHaveBeenCalledWith('canvas:idea-1');
      expect(result).toEqual(mockCanvas);
    });

    it('returns null when no canvas exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await getCanvasState('idea-1');
      expect(result).toBeNull();
    });
  });

  describe('saveAssumption', () => {
    it('saves assumption to the correct Redis key', async () => {
      await saveAssumption('idea-1', mockAssumption);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'assumption:idea-1:demand',
        JSON.stringify(mockAssumption),
      );
    });
  });

  describe('getAssumption', () => {
    it('returns assumption when it exists', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(mockAssumption));
      const result = await getAssumption('idea-1', 'demand');
      expect(mockRedis.get).toHaveBeenCalledWith('assumption:idea-1:demand');
      expect(result).toEqual(mockAssumption);
    });

    it('returns null when assumption does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await getAssumption('idea-1', 'demand');
      expect(result).toBeNull();
    });
  });

  describe('getAllAssumptions', () => {
    it('returns all five assumptions for an idea', async () => {
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(mockAssumption)) // demand
        .mockResolvedValueOnce(null) // reachability
        .mockResolvedValueOnce(null) // engagement
        .mockResolvedValueOnce(null) // wtp
        .mockResolvedValueOnce(null); // differentiation

      const result = await getAllAssumptions('idea-1');
      expect(result.demand).toEqual(mockAssumption);
      expect(result.reachability).toBeUndefined();
    });

    it('returns empty object when no assumptions exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await getAllAssumptions('idea-1');
      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe('savePivotSuggestions', () => {
    it('saves pivot suggestions to the correct Redis key', async () => {
      const suggestions: PivotSuggestion[] = [
        { statement: 'Pivot to X', evidence: ['data'], impact: 'low', experiment: 'test X' },
      ];
      await savePivotSuggestions('idea-1', 'demand', suggestions);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'pivot-suggestions:idea-1:demand',
        JSON.stringify(suggestions),
      );
    });
  });

  describe('getPivotSuggestions', () => {
    it('returns suggestions when they exist', async () => {
      const suggestions: PivotSuggestion[] = [
        { statement: 'Pivot to X', evidence: ['data'], impact: 'low', experiment: 'test X' },
      ];
      mockRedis.get.mockResolvedValue(JSON.stringify(suggestions));
      const result = await getPivotSuggestions('idea-1', 'demand');
      expect(result).toEqual(suggestions);
    });

    it('returns empty array when no suggestions exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await getPivotSuggestions('idea-1', 'demand');
      expect(result).toEqual([]);
    });
  });

  describe('clearPivotSuggestions', () => {
    it('deletes pivot suggestions key', async () => {
      await clearPivotSuggestions('idea-1', 'demand');
      expect(mockRedis.del).toHaveBeenCalledWith('pivot-suggestions:idea-1:demand');
    });
  });

  describe('appendPivotHistory', () => {
    it('appends to existing history', async () => {
      const existing: PivotRecord[] = [];
      mockRedis.get.mockResolvedValue(JSON.stringify(existing));
      const newRecord: PivotRecord = {
        fromStatement: 'old',
        toStatement: 'new',
        reason: 'low demand',
        suggestedBy: 'system',
        approvedBy: 'curator',
        timestamp: Date.now(),
        alternatives: [],
      };
      await appendPivotHistory('idea-1', 'demand', newRecord);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'pivots:idea-1:demand',
        JSON.stringify([newRecord]),
      );
    });

    it('creates new history when none exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      const newRecord: PivotRecord = {
        fromStatement: 'old',
        toStatement: 'new',
        reason: 'low demand',
        suggestedBy: 'system',
        approvedBy: 'curator',
        timestamp: Date.now(),
        alternatives: [],
      };
      await appendPivotHistory('idea-1', 'demand', newRecord);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'pivots:idea-1:demand',
        JSON.stringify([newRecord]),
      );
    });
  });

  describe('getPivotHistory', () => {
    it('returns history when it exists', async () => {
      const history: PivotRecord[] = [{
        fromStatement: 'old', toStatement: 'new', reason: 'test',
        suggestedBy: 'system', approvedBy: 'curator', timestamp: 1, alternatives: [],
      }];
      mockRedis.get.mockResolvedValue(JSON.stringify(history));
      const result = await getPivotHistory('idea-1', 'demand');
      expect(result).toEqual(history);
    });

    it('returns empty array when no history exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await getPivotHistory('idea-1', 'demand');
      expect(result).toEqual([]);
    });
  });

  describe('deleteCanvasData', () => {
    it('deletes canvas state and all assumption keys', async () => {
      await deleteCanvasData('idea-1');
      expect(mockRedis.del).toHaveBeenCalledWith('canvas:idea-1');
      // 5 assumption keys + 5 pivot-suggestion keys + 5 pivot history keys = 15 + 1 canvas = 16
      expect(mockRedis.del).toHaveBeenCalledWith('assumption:idea-1:demand');
      expect(mockRedis.del).toHaveBeenCalledWith('assumption:idea-1:reachability');
      expect(mockRedis.del).toHaveBeenCalledWith('assumption:idea-1:engagement');
      expect(mockRedis.del).toHaveBeenCalledWith('assumption:idea-1:wtp');
      expect(mockRedis.del).toHaveBeenCalledWith('assumption:idea-1:differentiation');
      expect(mockRedis.del).toHaveBeenCalledWith('pivot-suggestions:idea-1:demand');
      expect(mockRedis.del).toHaveBeenCalledWith('pivots:idea-1:demand');
    });
  });

  describe('error handling', () => {
    it('propagates Redis errors from get', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection lost'));
      await expect(getCanvasState('idea-1')).rejects.toThrow('Connection lost');
    });

    it('propagates Redis errors from set', async () => {
      mockRedis.set.mockRejectedValue(new Error('Connection lost'));
      await expect(saveCanvasState('idea-1', mockCanvas)).rejects.toThrow('Connection lost');
    });

    it('propagates Redis errors from del', async () => {
      mockRedis.del.mockRejectedValue(new Error('Connection lost'));
      await expect(clearPivotSuggestions('idea-1', 'demand')).rejects.toThrow('Connection lost');
    });
  });
});
```

**Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/validation-canvas-db.test.ts`
Expected: FAIL — functions not found in `@/lib/db`

**Step 3: Implement the DB functions**

Add these functions to `src/lib/db.ts`, after the `deleteIdeaFromDb` function (after line ~82). Import the types at the top of the file alongside existing imports:

```typescript
import type { ..., CanvasState, Assumption, AssumptionType, PivotSuggestion, PivotRecord } from '@/types';
import { ASSUMPTION_TYPES } from '@/types';
```

Add the functions:

```typescript
// Validation Canvas

export async function saveCanvasState(ideaId: string, state: CanvasState): Promise<void> {
  await getRedis().set(`canvas:${ideaId}`, JSON.stringify(state));
}

export async function getCanvasState(ideaId: string): Promise<CanvasState | null> {
  const data = await getRedis().get(`canvas:${ideaId}`);
  if (!data) return null;
  return parseValue<CanvasState>(data);
}

export async function saveAssumption(ideaId: string, assumption: Assumption): Promise<void> {
  await getRedis().set(`assumption:${ideaId}:${assumption.type}`, JSON.stringify(assumption));
}

export async function getAssumption(ideaId: string, type: AssumptionType): Promise<Assumption | null> {
  const data = await getRedis().get(`assumption:${ideaId}:${type}`);
  if (!data) return null;
  return parseValue<Assumption>(data);
}

export async function getAllAssumptions(ideaId: string): Promise<Partial<Record<AssumptionType, Assumption>>> {
  const result: Partial<Record<AssumptionType, Assumption>> = {};
  for (const type of ASSUMPTION_TYPES) {
    const assumption = await getAssumption(ideaId, type);
    if (assumption) result[type] = assumption;
  }
  return result;
}

export async function savePivotSuggestions(ideaId: string, type: AssumptionType, suggestions: PivotSuggestion[]): Promise<void> {
  await getRedis().set(`pivot-suggestions:${ideaId}:${type}`, JSON.stringify(suggestions));
}

export async function getPivotSuggestions(ideaId: string, type: AssumptionType): Promise<PivotSuggestion[]> {
  const data = await getRedis().get(`pivot-suggestions:${ideaId}:${type}`);
  if (!data) return [];
  return parseValue<PivotSuggestion[]>(data);
}

export async function clearPivotSuggestions(ideaId: string, type: AssumptionType): Promise<void> {
  await getRedis().del(`pivot-suggestions:${ideaId}:${type}`);
}

export async function appendPivotHistory(ideaId: string, type: AssumptionType, record: PivotRecord): Promise<void> {
  const existing = await getPivotHistory(ideaId, type);
  existing.push(record);
  await getRedis().set(`pivots:${ideaId}:${type}`, JSON.stringify(existing));
}

export async function getPivotHistory(ideaId: string, type: AssumptionType): Promise<PivotRecord[]> {
  const data = await getRedis().get(`pivots:${ideaId}:${type}`);
  if (!data) return [];
  return parseValue<PivotRecord[]>(data);
}

export async function deleteCanvasData(ideaId: string): Promise<void> {
  const r = getRedis();
  await r.del(`canvas:${ideaId}`);
  for (const type of ASSUMPTION_TYPES) {
    await r.del(`assumption:${ideaId}:${type}`);
    await r.del(`pivot-suggestions:${ideaId}:${type}`);
    await r.del(`pivots:${ideaId}:${type}`);
  }
}
```

**Step 4: Add canvas cleanup to `deleteIdeaFromDb`**

In `src/lib/db.ts`, find the `deleteIdeaFromDb` function. After the line `await r.del('foundation_progress:${id}');` (line ~79), add:

```typescript
  // Validation canvas data
  await deleteCanvasData(id);
```

**Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/validation-canvas-db.test.ts`
Expected: All tests pass

**Step 6: Commit**

```
git add src/lib/db.ts src/lib/__tests__/validation-canvas-db.test.ts
git commit -m "feat(validation-canvas): add Redis persistence functions for canvas, assumptions, pivots"
```

---

### Task 3: Verify Seth Godin Advisor Exists

**Files:**
- Verify: `src/lib/advisors/prompts/seth-godin.md` (already exists)
- Verify: `src/lib/advisors/registry.ts` (Seth Godin entry already present at ~line 158)
- Verify: `src/lib/advisors/prompt-loader.ts` (already uses `readFileSync`, dynamically resolves any advisor ID)

**Context:** Seth Godin was added to the codebase in a prior session. The prompt file, registry entry, and loader all already exist. `src/lib/advisors/prompts/index.ts` was deleted during the `.ts`→`.md` migration. The prompt-loader uses `readFileSync` with dynamic path resolution — no explicit map entry is needed.

**Step 1: Verify the advisor loads**

Run: `npx vitest run src/lib/__tests__/advisor-prompt-loader.test.ts`
Expected: All tests pass, including seth-godin resolution.

**Step 2: No commit needed** — nothing changed.

---

### Task 4: Update Strategy Foundation Doc to Use Seth Godin

> **Behavior change:** All strategy foundation docs generated from this point forward will use Seth Godin's three-questions format (smallest viable audience, remarkability, permission to reach) instead of Richard Rumelt's diagnosis/guiding policy/coherent actions format. Existing generated strategy docs are unaffected — they remain in Redis as-is. The `design-principles` doc continues to use `richard-rumelt` (intentionally unchanged).

**Files:**
- Modify: `src/lib/agent-tools/foundation.ts` (lines 15, 56-61)

**Step 1: Update DOC_ADVISOR_MAP**

In `src/lib/agent-tools/foundation.ts`, change line 15:

```typescript
// Before:
'strategy': 'richard-rumelt',

// After:
'strategy': 'seth-godin',
```

**Step 2: Update the strategy prompt template**

In the same file, replace the strategy case in `buildGenerationPrompt` (lines 56-61):

```typescript
// Before:
case 'strategy':
  prompt += `Write a strategy document with three sections:
1. THE CHALLENGE — What's the core problem or opportunity? Be specific.
2. THE GUIDING POLICY — What's the overall approach? What tradeoffs are we making?
3. COHERENT ACTIONS — What specific steps follow from the policy?

If the user has not provided differentiation, tradeoffs, or anti-target information, mark those sections with: [ASSUMPTION: The LLM inferred this strategic choice — review and confirm]`;
  break;

// After:
case 'strategy':
  prompt += `Write a concise strategy document (aim for ~1 page) answering three questions:

1. WHO IS OUR SMALLEST VIABLE AUDIENCE?
The specific group of people we seek to serve. Not a demographic — a psychographic. People who believe what we believe, defined narrowly enough that we can be remarkable to them. If the answer is "everyone" or a broad category, it's not narrow enough.

2. WHAT MAKES US REMARKABLE TO THEM?
The specific thing we do that they'd miss if we disappeared. Not a feature list — the core promise. The Purple Cow. This should feel risky and specific. If it could apply to any competitor, it's not remarkable.

3. WHAT'S OUR PERMISSION TO REACH THEM?
How we earn the right to show up in their world. For this system, primarily SEO content that answers questions they're already asking — showing up with value before asking for anything.

If the user has not provided differentiation, tradeoffs, or anti-target information, mark those sections with: [ASSUMPTION: The LLM inferred this strategic choice — review and confirm]`;
  break;
```

**Step 3: Verify existing foundation tests still pass**

Run: `npx vitest run src/lib/__tests__/foundation-tools.test.ts`
Expected: All tests pass (or update any test that hardcodes `'richard-rumelt'` as the strategy advisor to `'seth-godin'`)

**Step 4: Commit**

```
git add src/lib/agent-tools/foundation.ts
git commit -m "feat(validation-canvas): switch strategy doc from Richard Rumelt to Seth Godin"
```

---

### Task 5: Implement Core Validation Canvas Logic

**Files:**
- Create: `src/lib/validation-canvas.ts`
- Create: `src/lib/__tests__/validation-canvas.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/__tests__/validation-canvas.test.ts`:

```typescript
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
  getAnthropic: () => ({
    messages: { create: mockCreate },
  }),
}));

vi.mock('@/lib/config', () => ({ CLAUDE_MODEL: 'test-model' }));

import {
  generateAssumptions,
  evaluateAssumptions,
  generatePivotSuggestions,
  applyPivot,
} from '@/lib/validation-canvas';
import type { Assumption } from '@/types';

describe('generateAssumptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates five assumptions from analysis data', async () => {
    // Mock getAnalysisFromDb and getAnalysisContent
    const mockAnalysis = {
      id: 'analysis-1',
      ideaId: 'idea-1',
      ideaName: 'TestProduct',
      scores: {
        seoOpportunity: 8,
        competitiveLandscape: 7,
        willingnessToPay: 6,
        differentiationPotential: 7,
        expertiseAlignment: 5,
        overall: 7,
      },
      recommendation: 'Tier 1',
      confidence: 'High',
      summary: 'Good opportunity',
      risks: [],
      completedAt: new Date().toISOString(),
      hasCompetitorAnalysis: true,
      hasKeywordAnalysis: true,
    };

    const mockContent = {
      seoData: JSON.stringify({
        synthesis: {
          comparison: { agreedKeywords: [{ keyword: 'test keyword', volume: 1200 }] },
          serpValidated: [{ keyword: 'test keyword', hasContentGap: true }],
        },
      }),
      competitors: 'Competitor A, Competitor B',
    };

    // Mock the LLM response for assumption generation
    mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          demand: { statement: '1,200+ monthly searches for target keywords', evidence: ['keyword data'] },
          reachability: { statement: 'Content can rank for target keywords', evidence: [] },
          engagement: { statement: '3%+ signup rate expected', evidence: [] },
          wtp: { statement: 'Users willing to pay for premium features', evidence: [] },
          differentiation: { statement: 'No direct competitor in this niche', evidence: ['competitor gap'] },
        }),
      }],
    });

    // Need to mock db imports used internally
    vi.doMock('@/lib/db', async (importOriginal) => {
      const actual = await importOriginal() as Record<string, unknown>;
      return {
        ...actual,
        getAnalysisFromDb: vi.fn().mockResolvedValue(mockAnalysis),
        getAnalysisContent: vi.fn().mockResolvedValue(mockContent),
        saveCanvasState: vi.fn(),
        saveAssumption: vi.fn(),
      };
    });

    // Re-import after mock
    const { generateAssumptions: gen } = await import('@/lib/validation-canvas');
    const result = await gen('idea-1');

    expect(result).toBeTruthy();
    expect(result!.assumptions.demand).toBeDefined();
    expect(result!.assumptions.demand.status).toBe('untested');
  });

  it('returns null when no analysis exists', async () => {
    vi.doMock('@/lib/db', async (importOriginal) => {
      const actual = await importOriginal() as Record<string, unknown>;
      return {
        ...actual,
        getAnalysisFromDb: vi.fn().mockResolvedValue(null),
      };
    });

    const { generateAssumptions: gen } = await import('@/lib/validation-canvas');
    const result = await gen('idea-1');
    expect(result).toBeNull();
  });
});

describe('evaluateAssumptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not change assumptions with status other than testing', async () => {
    const untestedAssumption: Assumption = {
      type: 'demand',
      status: 'untested',
      statement: 'Test statement',
      evidence: [],
      threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
      linkedStage: 'analysis',
    };

    vi.doMock('@/lib/db', async (importOriginal) => {
      const actual = await importOriginal() as Record<string, unknown>;
      return {
        ...actual,
        getCanvasState: vi.fn().mockResolvedValue({ status: 'active' }),
        getAllAssumptions: vi.fn().mockResolvedValue({ demand: untestedAssumption }),
        saveAssumption: vi.fn(),
      };
    });

    const { evaluateAssumptions: evalAssumptions } = await import('@/lib/validation-canvas');
    await evalAssumptions('idea-1');

    // saveAssumption should NOT have been called since nothing is in "testing" status
    const { saveAssumption } = await import('@/lib/db');
    expect(saveAssumption).not.toHaveBeenCalled();
  });

  it('skips evaluation when canvas is killed', async () => {
    vi.doMock('@/lib/db', async (importOriginal) => {
      const actual = await importOriginal() as Record<string, unknown>;
      return {
        ...actual,
        getCanvasState: vi.fn().mockResolvedValue({ status: 'killed' }),
        getAllAssumptions: vi.fn(),
      };
    });

    const { evaluateAssumptions: evalAssumptions } = await import('@/lib/validation-canvas');
    await evalAssumptions('idea-1');

    const { getAllAssumptions } = await import('@/lib/db');
    expect(getAllAssumptions).not.toHaveBeenCalled();
  });

  it('skips evaluation when no canvas exists', async () => {
    vi.doMock('@/lib/db', async (importOriginal) => {
      const actual = await importOriginal() as Record<string, unknown>;
      return {
        ...actual,
        getCanvasState: vi.fn().mockResolvedValue(null),
        getAllAssumptions: vi.fn(),
      };
    });

    const { evaluateAssumptions: evalAssumptions } = await import('@/lib/validation-canvas');
    await evalAssumptions('idea-1');

    const { getAllAssumptions } = await import('@/lib/db');
    expect(getAllAssumptions).not.toHaveBeenCalled();
  });
});

describe('generatePivotSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates 2-3 pivot suggestions via LLM', async () => {
    const suggestions = [
      { statement: 'Pivot A', evidence: ['data'], impact: 'Keep content', experiment: 'Test A' },
      { statement: 'Pivot B', evidence: ['data2'], impact: 'Rebuild site', experiment: 'Test B' },
    ];

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(suggestions) }],
    });

    vi.doMock('@/lib/db', async (importOriginal) => {
      const actual = await importOriginal() as Record<string, unknown>;
      return {
        ...actual,
        getAssumption: vi.fn().mockResolvedValue({
          type: 'demand', status: 'invalidated', statement: 'No demand',
          evidence: ['low search volume'], threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
          linkedStage: 'analysis',
        }),
        getAnalysisContent: vi.fn().mockResolvedValue({ seoData: '{}', competitors: 'none' }),
        savePivotSuggestions: vi.fn(),
      };
    });

    const { generatePivotSuggestions: genPivots } = await import('@/lib/validation-canvas');
    const result = await genPivots('idea-1', 'demand');

    expect(result).toHaveLength(2);
    expect(result[0].statement).toBe('Pivot A');
  });

  it('returns empty array when LLM call fails', async () => {
    mockCreate.mockRejectedValue(new Error('API timeout'));

    vi.doMock('@/lib/db', async (importOriginal) => {
      const actual = await importOriginal() as Record<string, unknown>;
      return {
        ...actual,
        getAssumption: vi.fn().mockResolvedValue({
          type: 'demand', status: 'invalidated', statement: 'No demand',
          evidence: [], threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
          linkedStage: 'analysis',
        }),
        getAnalysisContent: vi.fn().mockResolvedValue({ seoData: '{}' }),
        savePivotSuggestions: vi.fn(),
      };
    });

    const { generatePivotSuggestions: genPivots } = await import('@/lib/validation-canvas');
    const result = await genPivots('idea-1', 'demand');

    expect(result).toEqual([]);
  });

  it('returns empty array when LLM returns malformed JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'This is not valid JSON at all' }],
    });

    vi.doMock('@/lib/db', async (importOriginal) => {
      const actual = await importOriginal() as Record<string, unknown>;
      return {
        ...actual,
        getAssumption: vi.fn().mockResolvedValue({
          type: 'demand', status: 'invalidated', statement: 'No demand',
          evidence: [], threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
          linkedStage: 'analysis',
        }),
        getAnalysisContent: vi.fn().mockResolvedValue({ seoData: '{}' }),
        savePivotSuggestions: vi.fn(),
      };
    });

    const { generatePivotSuggestions: genPivots } = await import('@/lib/validation-canvas');
    const result = await genPivots('idea-1', 'demand');

    expect(result).toEqual([]);
  });
});

describe('applyPivot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates assumption, clears suggestions, and appends to history', async () => {
    const mockSaveAssumption = vi.fn();
    const mockClearSuggestions = vi.fn();
    const mockAppendHistory = vi.fn();

    const existingAssumption: Assumption = {
      type: 'demand', status: 'invalidated', statement: 'Old statement',
      evidence: ['low volume'], threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
      linkedStage: 'analysis',
    };

    const suggestions = [
      { statement: 'New statement', evidence: ['better data'], impact: 'Keep content', experiment: 'Test new' },
    ];

    vi.doMock('@/lib/db', async (importOriginal) => {
      const actual = await importOriginal() as Record<string, unknown>;
      return {
        ...actual,
        getAssumption: vi.fn().mockResolvedValue(existingAssumption),
        getPivotSuggestions: vi.fn().mockResolvedValue(suggestions),
        saveAssumption: mockSaveAssumption,
        clearPivotSuggestions: mockClearSuggestions,
        appendPivotHistory: mockAppendHistory,
      };
    });

    const { applyPivot: pivot } = await import('@/lib/validation-canvas');
    await pivot('idea-1', 'demand', 0);

    // New assumption should be untested with the pivot statement
    expect(mockSaveAssumption).toHaveBeenCalledWith('idea-1', expect.objectContaining({
      type: 'demand',
      status: 'untested',
      statement: 'New statement',
    }));

    // Suggestions should be cleared
    expect(mockClearSuggestions).toHaveBeenCalledWith('idea-1', 'demand');

    // History should be appended
    expect(mockAppendHistory).toHaveBeenCalledWith('idea-1', 'demand', expect.objectContaining({
      fromStatement: 'Old statement',
      toStatement: 'New statement',
    }));
  });

  it('resets downstream assumptions when demand pivots', async () => {
    const mockSaveAssumption = vi.fn();

    const demandAssumption: Assumption = {
      type: 'demand', status: 'invalidated', statement: 'Old',
      evidence: [], threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
      linkedStage: 'analysis',
    };

    const reachabilityAssumption: Assumption = {
      type: 'reachability', status: 'testing', statement: 'Testing reach',
      evidence: [], threshold: { validated: 'x', invalidated: 'y', windowDays: 45 },
      linkedStage: 'content',
    };

    const suggestions = [
      { statement: 'New demand', evidence: [], impact: 'Rebuild', experiment: 'Test' },
    ];

    vi.doMock('@/lib/db', async (importOriginal) => {
      const actual = await importOriginal() as Record<string, unknown>;
      return {
        ...actual,
        getAssumption: vi.fn()
          .mockResolvedValueOnce(demandAssumption) // for the pivot target
          .mockResolvedValueOnce(reachabilityAssumption) // downstream check
          .mockResolvedValueOnce(null) // engagement
          .mockResolvedValueOnce(null) // wtp
          .mockResolvedValueOnce(null), // differentiation
        getPivotSuggestions: vi.fn().mockResolvedValue(suggestions),
        saveAssumption: mockSaveAssumption,
        clearPivotSuggestions: vi.fn(),
        appendPivotHistory: vi.fn(),
      };
    });

    const { applyPivot: pivot } = await import('@/lib/validation-canvas');
    await pivot('idea-1', 'demand', 0);

    // Should reset reachability to untested
    expect(mockSaveAssumption).toHaveBeenCalledWith('idea-1', expect.objectContaining({
      type: 'reachability',
      status: 'untested',
    }));
  });

  it('throws when suggestion index is out of bounds', async () => {
    vi.doMock('@/lib/db', async (importOriginal) => {
      const actual = await importOriginal() as Record<string, unknown>;
      return {
        ...actual,
        getAssumption: vi.fn().mockResolvedValue({
          type: 'demand', status: 'invalidated', statement: 'x',
          evidence: [], threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
          linkedStage: 'analysis',
        }),
        getPivotSuggestions: vi.fn().mockResolvedValue([]),
      };
    });

    const { applyPivot: pivot } = await import('@/lib/validation-canvas');
    await expect(pivot('idea-1', 'demand', 5)).rejects.toThrow();
  });
});
```

**Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/validation-canvas.test.ts`
Expected: FAIL — module `@/lib/validation-canvas` not found

**Step 3: Implement the validation canvas module**

Create `src/lib/validation-canvas.ts`:

```typescript
import {
  getAnalysisFromDb,
  getAnalysisContent,
  getCanvasState,
  saveCanvasState,
  saveAssumption,
  getAssumption,
  getAllAssumptions,
  savePivotSuggestions,
  getPivotSuggestions,
  clearPivotSuggestions,
  appendPivotHistory,
} from '@/lib/db';
import { getAnthropic } from '@/lib/anthropic';
import { CLAUDE_MODEL } from '@/lib/config';
import { parseLLMJson } from '@/lib/llm-utils';
import type {
  AssumptionType,
  Assumption,
  CanvasState,
  PivotSuggestion,
  PivotRecord,
  ValidationCanvasData,
} from '@/types';
import { ASSUMPTION_TYPES } from '@/types';

// Downstream dependency order: when type N pivots, types N+1..4 reset
const DOWNSTREAM: Record<AssumptionType, AssumptionType[]> = {
  demand: ['reachability', 'engagement', 'wtp', 'differentiation'],
  reachability: ['engagement', 'wtp', 'differentiation'],
  engagement: ['wtp', 'differentiation'],
  wtp: ['differentiation'],
  differentiation: [],
};

const LINKED_STAGES: Record<AssumptionType, string> = {
  demand: 'analysis',
  reachability: 'content',
  engagement: 'painted-door',
  wtp: 'analytics',
  differentiation: 'analytics',
};

const DEFAULT_THRESHOLDS: Record<AssumptionType, { validated: string; invalidated: string; windowDays: number }> = {
  demand: {
    validated: '500+ monthly searches for primary keyword cluster AND < 20 direct competitors',
    invalidated: '< 100 monthly searches OR > 50 direct competitors with established authority',
    windowDays: 0,
  },
  reachability: {
    validated: 'Any content piece ranks in top 50 for a target keyword OR 100+ organic sessions/month',
    invalidated: '0 ranking keywords and < 10 organic sessions/month after evaluation window',
    windowDays: 45,
  },
  engagement: {
    validated: '3%+ email signup conversion rate from organic visitors OR 2+ min avg time on site',
    invalidated: '< 0.5% signup rate AND < 30s avg time on site after evaluation window',
    windowDays: 30,
  },
  wtp: {
    validated: '1%+ click-through to pricing/purchase page from engaged visitors',
    invalidated: '0 pricing page visits after 100+ engaged sessions',
    windowDays: 60,
  },
  differentiation: {
    validated: 'Sustained or growing organic traffic over 3 consecutive analytics periods',
    invalidated: 'Declining traffic over 3 consecutive periods OR new direct competitor capturing > 50% of target keywords',
    windowDays: 90,
  },
};

/**
 * Generate initial assumptions for an idea from its analysis data.
 * Creates the canvas state and all five assumptions with concrete statements.
 */
export async function generateAssumptions(ideaId: string): Promise<ValidationCanvasData | null> {
  const analysis = await getAnalysisFromDb(ideaId);
  if (!analysis) return null;

  const content = await getAnalysisContent(ideaId);

  // Build context for LLM to generate concrete assumption statements
  let context = `Business: ${analysis.ideaName}\n`;
  context += `Summary: ${analysis.summary}\n`;

  if (content?.seoData) {
    try {
      const seo = JSON.parse(content.seoData);
      const keywords = seo.synthesis?.comparison?.agreedKeywords ?? [];
      if (keywords.length > 0) {
        context += `Top keywords: ${keywords.slice(0, 5).map((k: { keyword: string; volume?: number }) => `${k.keyword} (${k.volume ?? '?'} searches/mo)`).join(', ')}\n`;
      }
      const competitors = seo.synthesis?.serpValidated?.length ?? 0;
      context += `SERP-validated gaps: ${competitors}\n`;
    } catch { /* ignore parse errors */ }
  }

  if (content?.competitors) {
    context += `Competitors: ${content.competitors.slice(0, 500)}\n`;
  }

  // Ask Claude to generate concrete, testable assumption statements
  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: 'You generate concrete, testable business assumptions. Output valid JSON only, no markdown.',
    messages: [{
      role: 'user',
      content: `Given this business context, generate concrete testable statements for each of these five assumption types. Each statement should be specific and measurable — not generic.

Context:
${context}

Output a JSON object with these keys: demand, reachability, engagement, wtp, differentiation.
Each value should be an object with:
- statement: a concrete, testable claim (e.g., "1,200+ monthly searches for 'chronic illness second opinion'" not "people search for this")
- evidence: array of supporting data points from the context above (can be empty if no data yet)

Example:
{
  "demand": { "statement": "1,200+ monthly searches for target keyword cluster with < 15 direct competitors", "evidence": ["keyword data shows 1,200 monthly searches"] },
  "reachability": { "statement": "SEO content targeting diagnostic journey keywords can rank in top 50 within 45 days", "evidence": [] },
  ...
}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const generated = parseLLMJson<Record<string, { statement: string; evidence: string[] }>>(text);

  // Create canvas state
  const canvasState: CanvasState = { status: 'active' };
  await saveCanvasState(ideaId, canvasState);

  // Create assumptions
  const assumptions: Record<string, Assumption> = {};
  for (const type of ASSUMPTION_TYPES) {
    const gen = generated[type];
    const assumption: Assumption = {
      type,
      status: 'untested',
      statement: gen?.statement ?? `[No statement generated for ${type}]`,
      evidence: gen?.evidence ?? [],
      threshold: DEFAULT_THRESHOLDS[type],
      linkedStage: LINKED_STAGES[type],
    };
    await saveAssumption(ideaId, assumption);
    assumptions[type] = assumption;
  }

  return {
    canvas: canvasState,
    assumptions: assumptions as Record<AssumptionType, Assumption>,
    pivotSuggestions: {},
    pivotHistory: {},
  };
}

/**
 * Evaluate all Testing assumptions against their thresholds.
 * Called after analytics cron runs. Only processes assumptions with status 'testing'.
 *
 * NOTE: Threshold-based auto-evaluation is deferred to a follow-up plan.
 * This implementation provides the hook point and guard logic. The curator
 * changes statuses manually via the API until auto-evaluation is implemented.
 * See Decision Log entry 6 for rationale.
 */
export async function evaluateAssumptions(ideaId: string): Promise<void> {
  const canvasState = await getCanvasState(ideaId);
  if (!canvasState || canvasState.status === 'killed') return;

  const assumptions = await getAllAssumptions(ideaId);
  const testingAssumptions = Object.values(assumptions).filter(a => a.status === 'testing');

  if (testingAssumptions.length === 0) return;

  // TODO: Auto-evaluate testing assumptions against analytics data.
  // Design doc specifies checking thresholds (e.g., 500+ searches for demand,
  // top-50 rankings for reachability) and auto-transitioning to validated/invalidated.
  // Requires integration with GSC analytics data and research agent output.
  // Deferred to a follow-up plan — see Decision Log entry 6.
}

/**
 * Generate 2-3 pivot suggestions when an assumption is invalidated.
 * Uses Claude to analyze the failure and suggest alternatives.
 */
export async function generatePivotSuggestions(
  ideaId: string,
  type: AssumptionType,
): Promise<PivotSuggestion[]> {
  const assumption = await getAssumption(ideaId, type);
  if (!assumption) return [];

  const content = await getAnalysisContent(ideaId);

  let context = `The "${type}" assumption was invalidated.\n`;
  context += `Statement: ${assumption.statement}\n`;
  context += `Evidence: ${assumption.evidence.join(', ') || 'none'}\n`;

  if (content?.seoData) {
    context += `SEO Data: ${content.seoData.slice(0, 1000)}\n`;
  }
  if (content?.competitors) {
    context += `Competitors: ${content.competitors.slice(0, 500)}\n`;
  }

  try {
    const response = await getAnthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: 'You are a business pivot advisor. Generate concrete, actionable pivot suggestions. Output valid JSON only.',
      messages: [{
        role: 'user',
        content: `This business assumption was invalidated:

Type: ${type}
Statement: ${assumption.statement}
Evidence that invalidated it: ${assumption.evidence.join(', ') || 'Insufficient data'}

Context:
${context}

Generate 2-3 pivot suggestions. Each should be a concrete reframing — not just "try harder."

Output a JSON array of objects, each with:
- statement: the new concrete assumption to test
- evidence: supporting data for this pivot direction (array of strings)
- impact: what existing work survives vs. needs rebuilding (1-2 sentences)
- experiment: what to run next to test this pivoted assumption (1 sentence)

Example:
[
  {
    "statement": "Shift from 'rare disease second opinion' to 'chronic illness symptom tracker' — 4x search volume, fewer competitors",
    "evidence": ["4,800 monthly searches for 'symptom tracker'", "Only 3 direct competitors vs 15 in original niche"],
    "impact": "Existing blog content salvageable with angle adjustment. Painted door site needs full rebuild.",
    "experiment": "Publish 3 symptom-tracker focused articles and measure organic traffic after 30 days"
  }
]`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const suggestions = parseLLMJson<PivotSuggestion[]>(text);

    if (Array.isArray(suggestions) && suggestions.length > 0) {
      await savePivotSuggestions(ideaId, type, suggestions);
      return suggestions;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Apply a pivot suggestion: update the assumption, clear suggestions,
 * record history, and reset downstream assumptions.
 */
export async function applyPivot(
  ideaId: string,
  type: AssumptionType,
  suggestionIndex: number,
): Promise<void> {
  const assumption = await getAssumption(ideaId, type);
  if (!assumption) throw new Error(`No assumption found for ${type}`);

  const suggestions = await getPivotSuggestions(ideaId, type);
  if (suggestionIndex < 0 || suggestionIndex >= suggestions.length) {
    throw new Error(`Invalid suggestion index: ${suggestionIndex}. Available: ${suggestions.length}`);
  }

  const chosen = suggestions[suggestionIndex];

  // Record the pivot in history
  const record: PivotRecord = {
    fromStatement: assumption.statement,
    toStatement: chosen.statement,
    reason: chosen.impact,
    suggestedBy: 'system',
    approvedBy: 'curator',
    timestamp: Date.now(),
    alternatives: suggestions.filter((_, i) => i !== suggestionIndex),
  };
  await appendPivotHistory(ideaId, type, record);

  // Update the assumption with the new statement
  const updated: Assumption = {
    ...assumption,
    status: 'untested',
    statement: chosen.statement,
    evidence: chosen.evidence,
    invalidatedAt: undefined,
  };
  await saveAssumption(ideaId, updated);

  // Clear the suggestions
  await clearPivotSuggestions(ideaId, type);

  // Reset downstream assumptions to untested
  const downstream = DOWNSTREAM[type];
  for (const downType of downstream) {
    const downAssumption = await getAssumption(ideaId, downType);
    if (downAssumption && downAssumption.status !== 'untested') {
      await saveAssumption(ideaId, {
        ...downAssumption,
        status: 'untested',
        validatedAt: undefined,
        invalidatedAt: undefined,
      });
    }
  }

  // Trigger strategy doc regeneration for Demand or Differentiation pivots.
  // These change the fundamental audience/positioning, so the strategy doc
  // (and its downstream dependents) need to be regenerated.
  if (type === 'demand' || type === 'differentiation') {
    const { deleteFoundationDoc } = await import('@/lib/db');
    // Delete strategy doc — it will be regenerated on next Foundation tab visit.
    // Downstream docs (positioning, brand-voice, etc.) remain but may be stale;
    // the Foundation tab shows them as needing regeneration when strategy changes.
    await deleteFoundationDoc(ideaId, 'strategy').catch(() => {});
  }
}
```

**Step 4: Run the tests**

Run: `npx vitest run src/lib/__tests__/validation-canvas.test.ts`
Expected: All tests pass

**Step 5: Commit**

```
git add src/lib/validation-canvas.ts src/lib/__tests__/validation-canvas.test.ts
git commit -m "feat(validation-canvas): implement core logic — generate, evaluate, pivot"
```

---

### Task 6: Create Validation Canvas API Routes

**Files:**
- Create: `src/app/api/validation/[ideaId]/route.ts`
- Create: `src/app/api/validation/[ideaId]/pivot/route.ts`
- Create: `src/app/api/validation/[ideaId]/kill/route.ts`
- Create: `src/app/api/validation/__tests__/route.test.ts`

**Step 1: Write the failing tests**

Create `src/app/api/validation/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  isRedisConfigured: vi.fn(),
  getCanvasState: vi.fn(),
  getAllAssumptions: vi.fn(),
  getPivotSuggestions: vi.fn(),
  getPivotHistory: vi.fn(),
  saveCanvasState: vi.fn(),
  saveAssumption: vi.fn(),
}));

vi.mock('@/lib/validation-canvas', () => ({
  generateAssumptions: vi.fn(),
  applyPivot: vi.fn(),
  generatePivotSuggestions: vi.fn(),
}));

import {
  isRedisConfigured,
  getCanvasState,
  getAllAssumptions,
  getPivotSuggestions,
  getPivotHistory,
  saveCanvasState,
} from '@/lib/db';
import { generateAssumptions, applyPivot } from '@/lib/validation-canvas';

// Import route handlers — adjust paths based on actual file structure
import { GET } from '@/app/api/validation/[ideaId]/route';
import { POST as PivotPOST } from '@/app/api/validation/[ideaId]/pivot/route';
import { POST as KillPOST } from '@/app/api/validation/[ideaId]/kill/route';

describe('GET /api/validation/[ideaId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isRedisConfigured).mockReturnValue(true);
  });

  it('returns 500 when Redis is not configured', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(false);
    const req = new NextRequest('http://localhost/api/validation/idea-1');
    const res = await GET(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(500);
  });

  it('returns canvas data when it exists', async () => {
    vi.mocked(getCanvasState).mockResolvedValue({ status: 'active' });
    vi.mocked(getAllAssumptions).mockResolvedValue({
      demand: {
        type: 'demand', status: 'validated', statement: 'Test',
        evidence: [], threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
        linkedStage: 'analysis',
      },
    });
    vi.mocked(getPivotSuggestions).mockResolvedValue([]);
    vi.mocked(getPivotHistory).mockResolvedValue([]);

    const req = new NextRequest('http://localhost/api/validation/idea-1');
    const res = await GET(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.canvas.status).toBe('active');
    expect(data.assumptions.demand).toBeDefined();
  });

  it('auto-generates canvas when none exists and generates=true', async () => {
    vi.mocked(getCanvasState).mockResolvedValue(null);
    vi.mocked(generateAssumptions).mockResolvedValue({
      canvas: { status: 'active' },
      assumptions: {} as Record<string, unknown>,
      pivotSuggestions: {},
      pivotHistory: {},
    } as unknown as import('@/types').ValidationCanvasData);

    const req = new NextRequest('http://localhost/api/validation/idea-1?generate=true');
    const res = await GET(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(200);
    expect(generateAssumptions).toHaveBeenCalledWith('idea-1');
  });

  it('returns 404 when no canvas exists and generate is not requested', async () => {
    vi.mocked(getCanvasState).mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/validation/idea-1');
    const res = await GET(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(404);
  });

  it('returns 500 when Redis get fails', async () => {
    vi.mocked(getCanvasState).mockRejectedValue(new Error('Connection lost'));

    const req = new NextRequest('http://localhost/api/validation/idea-1');
    const res = await GET(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(500);
  });
});

describe('POST /api/validation/[ideaId]/pivot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isRedisConfigured).mockReturnValue(true);
  });

  it('applies a pivot successfully', async () => {
    vi.mocked(applyPivot).mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost/api/validation/idea-1/pivot', {
      method: 'POST',
      body: JSON.stringify({ type: 'demand', suggestionIndex: 0 }),
    });
    const res = await PivotPOST(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(200);
    expect(applyPivot).toHaveBeenCalledWith('idea-1', 'demand', 0);
  });

  it('returns 400 when type is missing', async () => {
    const req = new NextRequest('http://localhost/api/validation/idea-1/pivot', {
      method: 'POST',
      body: JSON.stringify({ suggestionIndex: 0 }),
    });
    const res = await PivotPOST(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 500 when applyPivot throws', async () => {
    vi.mocked(applyPivot).mockRejectedValue(new Error('Invalid index'));

    const req = new NextRequest('http://localhost/api/validation/idea-1/pivot', {
      method: 'POST',
      body: JSON.stringify({ type: 'demand', suggestionIndex: 99 }),
    });
    const res = await PivotPOST(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(500);
  });

  it('returns 400 when JSON body is malformed', async () => {
    const req = new NextRequest('http://localhost/api/validation/idea-1/pivot', {
      method: 'POST',
      body: 'not json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await PivotPOST(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/validation/[ideaId]/kill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isRedisConfigured).mockReturnValue(true);
  });

  it('kills the project', async () => {
    vi.mocked(saveCanvasState).mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost/api/validation/idea-1/kill', {
      method: 'POST',
      body: JSON.stringify({ reason: 'No demand found' }),
    });
    const res = await KillPOST(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(200);
    expect(saveCanvasState).toHaveBeenCalledWith('idea-1', expect.objectContaining({
      status: 'killed',
      killedReason: 'No demand found',
    }));
  });

  it('returns 400 when reason is missing', async () => {
    const req = new NextRequest('http://localhost/api/validation/idea-1/kill', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await KillPOST(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 500 when Redis save fails', async () => {
    vi.mocked(saveCanvasState).mockRejectedValue(new Error('Connection lost'));

    const req = new NextRequest('http://localhost/api/validation/idea-1/kill', {
      method: 'POST',
      body: JSON.stringify({ reason: 'No demand' }),
    });
    const res = await KillPOST(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(500);
  });
});
```

**Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/api/validation/__tests__/route.test.ts`
Expected: FAIL — route modules not found

**Step 3: Implement the GET route**

Create `src/app/api/validation/[ideaId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import {
  isRedisConfigured,
  getCanvasState,
  getAllAssumptions,
  getPivotSuggestions,
  getPivotHistory,
} from '@/lib/db';
import { generateAssumptions } from '@/lib/validation-canvas';
import { ASSUMPTION_TYPES } from '@/types';

interface RouteContext {
  params: Promise<{ ideaId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { ideaId } = await context.params;

  try {
    let canvas = await getCanvasState(ideaId);

    // Auto-generate if requested and no canvas exists
    if (!canvas && request.nextUrl.searchParams.get('generate') === 'true') {
      const result = await generateAssumptions(ideaId);
      if (result) return NextResponse.json(result);
      return NextResponse.json({ error: 'No analysis found for this idea' }, { status: 404 });
    }

    if (!canvas) {
      return NextResponse.json({ error: 'No validation canvas found' }, { status: 404 });
    }

    const assumptions = await getAllAssumptions(ideaId);

    // Gather pivot suggestions and history for all types
    const pivotSuggestions: Record<string, unknown[]> = {};
    const pivotHistoryMap: Record<string, unknown[]> = {};

    for (const type of ASSUMPTION_TYPES) {
      const suggestions = await getPivotSuggestions(ideaId, type);
      if (suggestions.length > 0) pivotSuggestions[type] = suggestions;

      const history = await getPivotHistory(ideaId, type);
      if (history.length > 0) pivotHistoryMap[type] = history;
    }

    return NextResponse.json({
      canvas,
      assumptions,
      pivotSuggestions,
      pivotHistory: pivotHistoryMap,
    });
  } catch (error) {
    console.error('Validation canvas GET failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load canvas' },
      { status: 500 },
    );
  }
}
```

**Step 4: Implement the pivot route**

Create `src/app/api/validation/[ideaId]/pivot/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured } from '@/lib/db';
import { applyPivot } from '@/lib/validation-canvas';
import type { AssumptionType } from '@/types';

interface RouteContext {
  params: Promise<{ ideaId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { ideaId } = await context.params;

  let body: { type?: AssumptionType; suggestionIndex?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.type || body.suggestionIndex === undefined) {
    return NextResponse.json({ error: 'Missing required fields: type, suggestionIndex' }, { status: 400 });
  }

  try {
    await applyPivot(ideaId, body.type, body.suggestionIndex);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Pivot failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Pivot failed' },
      { status: 500 },
    );
  }
}
```

**Step 5: Implement the kill route**

Create `src/app/api/validation/[ideaId]/kill/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured, saveCanvasState } from '@/lib/db';

interface RouteContext {
  params: Promise<{ ideaId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { ideaId } = await context.params;

  let body: { reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.reason) {
    return NextResponse.json({ error: 'Missing required field: reason' }, { status: 400 });
  }

  try {
    await saveCanvasState(ideaId, {
      status: 'killed',
      killedAt: Date.now(),
      killedReason: body.reason,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Kill failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kill failed' },
      { status: 500 },
    );
  }
}
```

**Step 6: Run the tests**

Run: `npx vitest run src/app/api/validation/__tests__/route.test.ts`
Expected: All tests pass

**Step 7: Commit**

```
git add src/app/api/validation/
git commit -m "feat(validation-canvas): add API routes — GET canvas, POST pivot, POST kill"
```

---

### Task 7: Integrate with Analytics Cron

**Files:**
- Modify: `src/app/api/cron/analytics/route.ts`

**Step 1: Read the current file**

Read `src/app/api/cron/analytics/route.ts` to verify the current structure matches what the plan expects (lines 1-55).

**Step 2: Add evaluateAssumptions import and call**

Add the import at the top:

```typescript
import { evaluateAllCanvases } from '@/lib/validation-canvas';
```

Add a new exported function to `src/lib/validation-canvas.ts` (before the `export async function generateAssumptions` function):

```typescript
/**
 * Evaluate assumptions for all active canvases.
 * Called by the analytics cron after each run.
 * Scans all ideas for active canvases with testing assumptions.
 */
export async function evaluateAllCanvases(): Promise<void> {
  const { getIdeasFromDb } = await import('@/lib/db');
  const ideas = await getIdeasFromDb();

  for (const idea of ideas) {
    try {
      await evaluateAssumptions(idea.id);
    } catch (error) {
      console.error(`[evaluateAllCanvases] Failed for ${idea.id}:`, error);
    }
  }
}
```

In the analytics cron route, insert one line after `const report = await runAnalyticsAgentAuto();` in the GET handler (line 21). Do NOT replace the surrounding `try` block — just add this single line between the `runAnalyticsAgentAuto()` call and the `return` statement:

```typescript
  await evaluateAllCanvases().catch(err => console.error('[cron/analytics] Canvas evaluation failed:', err));
```

The result should read:
```typescript
  const report = await runAnalyticsAgentAuto();
  await evaluateAllCanvases().catch(err => console.error('[cron/analytics] Canvas evaluation failed:', err));
  return NextResponse.json(report);
```

Apply the identical one-line insertion to the POST handler (after its `runAnalyticsAgentAuto()` call at line 43).

**Step 3: Verify the build**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: No new errors

**Step 4: Commit**

```
git add src/app/api/cron/analytics/route.ts src/lib/validation-canvas.ts
git commit -m "feat(validation-canvas): integrate assumption evaluation with analytics cron"
```

---

### Task 8: Build the ValidationCanvas UI Component

**Files:**
- Create: `src/components/ValidationCanvas.tsx`
- Create: `src/components/PivotActions.tsx`

The mockup is at `docs/mockups/validation-canvas/project-page.html`. Reference it for exact layout, spacing, and color values.

**Step 1: Create the server component for canvas display**

Create `src/components/ValidationCanvas.tsx`:

```tsx
import type { Assumption, AssumptionType, PivotSuggestion, CanvasState, PivotRecord } from '@/types';
import PivotActions from './PivotActions';

interface ValidationCanvasProps {
  ideaId: string;
  canvas: CanvasState;
  assumptions: Partial<Record<AssumptionType, Assumption>>;
  pivotSuggestions: Partial<Record<AssumptionType, PivotSuggestion[]>>;
  pivotHistory: Partial<Record<AssumptionType, PivotRecord[]>>;
}

const TYPE_LABELS: Record<AssumptionType, string> = {
  demand: 'Demand',
  reachability: 'Reachability',
  engagement: 'Engagement',
  wtp: 'WTP',
  differentiation: 'Differentiation',
};

function getStatusClasses(status: string) {
  switch (status) {
    case 'validated':
      return {
        badge: 'bg-[rgba(16,185,129,0.15)] text-[var(--accent-emerald)] border border-[rgba(16,185,129,0.25)]',
        card: 'border-[rgba(16,185,129,0.2)]',
        type: 'text-[var(--accent-emerald)]',
      };
    case 'testing':
      return {
        badge: 'bg-[rgba(245,158,11,0.15)] text-[var(--accent-amber)] border border-[rgba(245,158,11,0.25)]',
        card: 'border-[rgba(245,158,11,0.2)] animate-[pulse-border_3s_ease-in-out_infinite]',
        type: 'text-[var(--accent-amber)]',
      };
    case 'invalidated':
      return {
        badge: 'bg-[rgba(248,113,113,0.15)] text-[var(--color-danger)] border border-[rgba(248,113,113,0.25)]',
        card: 'border-[rgba(248,113,113,0.2)]',
        type: 'text-[var(--color-danger)]',
      };
    default: // untested, pivoted
      return {
        badge: 'bg-[rgba(255,255,255,0.05)] text-[var(--text-muted)] border border-[rgba(255,255,255,0.08)]',
        card: '',
        type: 'text-[var(--text-muted)]',
      };
  }
}

const ASSUMPTION_ORDER: AssumptionType[] = ['demand', 'reachability', 'engagement', 'wtp', 'differentiation'];

const ArrowSvg = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

export default function ValidationCanvas({
  ideaId,
  canvas,
  assumptions,
  pivotSuggestions,
  pivotHistory,
}: ValidationCanvasProps) {
  const isKilled = canvas.status === 'killed';

  return (
    <div className={`mb-10 ${isKilled ? 'opacity-50' : ''}`}>
      {/* Section label */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase" style={{ color: 'var(--text-muted)' }}>
          Validation Canvas
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
      </div>

      {/* Canvas grid — horizontal on desktop, vertical on mobile */}
      <div className="flex flex-col lg:flex-row items-stretch gap-0">
        {ASSUMPTION_ORDER.map((type, i) => {
          const assumption = assumptions[type];
          const status = assumption?.status ?? 'untested';
          const classes = getStatusClasses(status);
          const suggestions = pivotSuggestions[type] ?? [];
          const history = pivotHistory[type] ?? [];
          const isFirst = i === 0;
          const isLast = i === ASSUMPTION_ORDER.length - 1;

          // Determine if this assumption is "reset" (upstream invalidated)
          const upstreamInvalidated = !isFirst && ASSUMPTION_ORDER.slice(0, i).some(
            upType => assumptions[upType]?.status === 'invalidated'
          );

          return (
            <div key={type} className="contents">
              {/* Arrow connector (not before first card) */}
              {!isFirst && (
                <div className="flex items-center justify-center w-6 lg:mx-[-12px] h-5 lg:h-auto z-10 rotate-90 lg:rotate-0" style={{ color: 'var(--text-muted)' }}>
                  <ArrowSvg />
                </div>
              )}

              {/* Card */}
              <div
                className={`flex-1 p-5 flex flex-col min-h-[160px] lg:min-h-[160px]
                  ${classes.card}
                  ${isFirst ? 'rounded-t-lg lg:rounded-l-lg lg:rounded-tr-none' : ''}
                  ${isLast ? 'rounded-b-lg lg:rounded-r-lg lg:rounded-bl-none' : ''}
                  ${!isFirst ? 'border-t-0 lg:border-t lg:border-l-0' : ''}
                `}
                style={{
                  background: 'var(--bg-card)',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: classes.card ? undefined : 'var(--border-subtle)',
                }}
              >
                {/* Card header */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[11px] font-semibold tracking-[0.06em] uppercase ${classes.type}`}>
                    {TYPE_LABELS[type]}
                  </span>
                  <span className={`text-[10px] font-semibold tracking-[0.06em] uppercase px-2 py-0.5 rounded-full ${classes.badge}`}>
                    {upstreamInvalidated ? 'Reset' : status}
                  </span>
                </div>

                {/* Statement */}
                <div className={`text-[13px] leading-relaxed flex-1 ${
                  status === 'untested' || upstreamInvalidated ? 'italic' : ''
                }`} style={{ color: status === 'untested' || upstreamInvalidated ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                  {upstreamInvalidated ? (
                    <span>{assumption?.statement ?? 'Awaiting upstream pivot decision'}</span>
                  ) : (
                    assumption?.statement ?? 'No assumption generated'
                  )}
                </div>

                {/* Evidence (only for validated/testing) */}
                {assumption?.evidence && assumption.evidence.length > 0 && (status === 'validated' || status === 'testing') && (
                  <div className="mt-3 pt-3 flex items-center gap-1.5 text-[12px]" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <div>
                      <div className="font-display font-semibold text-base tabular-nums" style={{
                        color: status === 'validated' ? 'var(--accent-emerald)' : 'var(--accent-amber)',
                      }}>
                        {assumption.evidence[0]}
                      </div>
                    </div>
                  </div>
                )}

                {/* Pivot history link */}
                {history.length > 0 && (
                  <span className="text-[11px] mt-2 inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    {history.length} pivot{history.length !== 1 ? 's' : ''} recorded
                  </span>
                )}

                {/* Pivot suggestions (only for invalidated) */}
                {status === 'invalidated' && suggestions.length > 0 && (
                  <PivotActions ideaId={ideaId} type={type} suggestions={suggestions} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Killed banner */}
      {isKilled && canvas.killedReason && (
        <div className="mt-4 p-3 rounded-lg text-sm" style={{
          background: 'rgba(248, 113, 113, 0.08)',
          color: 'var(--color-danger)',
          border: '1px solid rgba(248, 113, 113, 0.15)',
        }}>
          Project archived: {canvas.killedReason}
        </div>
      )}

      {/* Section divider */}
      <div className="flex items-center gap-2 mt-8 mb-0">
        <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
          Project Details
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
      </div>
    </div>
  );
}
```

**Step 2: Create the client component for pivot actions**

Create `src/components/PivotActions.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { AssumptionType, PivotSuggestion } from '@/types';

interface PivotActionsProps {
  ideaId: string;
  type: AssumptionType;
  suggestions: PivotSuggestion[];
}

export default function PivotActions({ ideaId, type, suggestions }: PivotActionsProps) {
  const [loading, setLoading] = useState<number | null>(null);
  const [killing, setKilling] = useState(false);

  async function handlePivot(index: number) {
    setLoading(index);
    try {
      const res = await fetch(`/api/validation/${ideaId}/pivot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, suggestionIndex: index }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleKill() {
    const reason = prompt('Why are you archiving this project?');
    if (!reason) return;

    setKilling(true);
    try {
      const res = await fetch(`/api/validation/${ideaId}/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } finally {
      setKilling(false);
    }
  }

  return (
    <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(248, 113, 113, 0.15)' }}>
      <div className="text-[10px] font-semibold tracking-[0.08em] uppercase mb-3" style={{ color: 'var(--color-danger)' }}>
        Pivot Opportunities
      </div>

      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => handlePivot(i)}
          disabled={loading !== null}
          className="w-full text-left p-3 mb-2 rounded-lg border transition-colors hover:border-[var(--accent-coral)] hover:bg-[rgba(255,107,91,0.05)] disabled:opacity-50"
          style={{
            background: 'var(--bg-elevated)',
            borderColor: 'var(--border-default)',
          }}
        >
          <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
            {loading === i ? 'Applying pivot...' : s.statement}
          </div>
          {s.evidence.length > 0 && (
            <div className="text-[12px] mt-1" style={{ color: 'var(--text-secondary)' }}>
              {s.evidence[0]}
            </div>
          )}
          <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {s.impact}
          </div>
        </button>
      ))}

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleKill}
          disabled={killing}
          className="text-[12px] font-medium px-3.5 py-1.5 rounded-lg border transition-colors hover:bg-[rgba(248,113,113,0.1)]"
          style={{
            color: 'var(--color-danger)',
            borderColor: 'rgba(248, 113, 113, 0.3)',
            background: 'transparent',
          }}
        >
          {killing ? 'Archiving...' : 'Archive Project'}
        </button>
      </div>
    </div>
  );
}
```

**Step 3: Add the `pulse-border` keyframes to globals.css**

In `src/app/globals.css`, add this keyframe animation (if not already present — check first):

```css
@keyframes pulse-border {
  0%, 100% { border-color: rgba(245, 158, 11, 0.2); }
  50% { border-color: rgba(245, 158, 11, 0.4); }
}
```

**Step 4: Verify the build**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: No new errors

**Step 5: Commit**

```
git add src/components/ValidationCanvas.tsx src/components/PivotActions.tsx src/app/globals.css
git commit -m "feat(validation-canvas): add canvas UI component with pivot actions"
```

---

### Task 9: Integrate Canvas into Project Page

**Files:**
- Modify: `src/app/analyses/[id]/page.tsx`

**Step 1: Add canvas data to DashboardData**

In `src/app/analyses/[id]/page.tsx`, add imports at the top:

```typescript
import ValidationCanvas from '@/components/ValidationCanvas';
import type { ValidationCanvasData } from '@/types';
```

Extend the `DashboardData` interface (after line ~35) to include:

```typescript
validationCanvas: ValidationCanvasData | null;
```

**Step 2: Fetch canvas data in getDashboardData**

In the `getDashboardData` function, add canvas imports and fetch. Add this import at the top of the file:

```typescript
import { getCanvasState, getAllAssumptions, getPivotSuggestions, getPivotHistory } from '@/lib/db';
import { ASSUMPTION_TYPES } from '@/types';
```

Update the existing `Promise.all` on line 84 to include `getCanvasState` as a 7th parallel fetch. Change the destructuring from:

```typescript
const [content, foundationDocsMap, calendar, pieces, gscLink, pdSite] = await Promise.all([
```

to:

```typescript
const [content, foundationDocsMap, calendar, pieces, gscLink, pdSite, canvasState] = await Promise.all([
```

And add `getCanvasState(id).catch(() => null),` as the last entry in the `Promise.all` array, after `getPaintedDoorSite(id).catch(() => null),`.

Then, after the `Promise.all` resolves (around line 91), conditionally fetch the remaining canvas data using a second `Promise.all` for parallelism — following the same pattern used for `websiteSignups` (conditional on `pdSite` existing):

```typescript
    // Fetch validation canvas data (canvasState was fetched in the Promise.all above)
    let validationCanvas: ValidationCanvasData | null = null;
    if (canvasState) {
      // Fetch all canvas sub-data in parallel — not sequentially
      const [canvasAssumptions, ...pivotResults] = await Promise.all([
        getAllAssumptions(id).catch(() => ({})),
        ...ASSUMPTION_TYPES.flatMap(aType => [
          getPivotSuggestions(id, aType).catch(() => []),
          getPivotHistory(id, aType).catch(() => []),
        ]),
      ]);
      const canvasPivotSuggestions: Record<string, unknown[]> = {};
      const canvasPivotHistory: Record<string, unknown[]> = {};
      ASSUMPTION_TYPES.forEach((aType, i) => {
        const sug = pivotResults[i * 2] as unknown[];
        const hist = pivotResults[i * 2 + 1] as unknown[];
        if (sug.length > 0) canvasPivotSuggestions[aType] = sug;
        if (hist.length > 0) canvasPivotHistory[aType] = hist;
      }
      validationCanvas = {
        canvas: canvasState,
        assumptions: canvasAssumptions as Record<string, unknown>,
        pivotSuggestions: canvasPivotSuggestions,
        pivotHistory: canvasPivotHistory,
      } as unknown as ValidationCanvasData;
    }
```

Add `validationCanvas` to the returned object from `getDashboardData`.

Also update the filesystem fallback return to include `validationCanvas: null`.

**Step 3: Render the canvas between header and pipeline cards**

In the JSX, after the `</header>` closing tag (line ~265) and before the pipeline summary `<div className="flex flex-col gap-3">` (line ~268), add:

```tsx
      {/* Validation Canvas */}
      {data.validationCanvas && (
        <ValidationCanvas
          ideaId={id}
          canvas={data.validationCanvas.canvas}
          assumptions={data.validationCanvas.assumptions}
          pivotSuggestions={data.validationCanvas.pivotSuggestions}
          pivotHistory={data.validationCanvas.pivotHistory}
        />
      )}
```

**Step 4: Verify the build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 5: Commit**

```
git add src/app/analyses/[id]/page.tsx
git commit -m "feat(validation-canvas): render canvas on project dashboard page"
```

---

### Task 10: Update Architecture Doc

**Files:**
- Modify: `docs/architecture.md`

**Step 1: Update the Database Schema section**

Add new Redis keys to the database schema Mermaid diagram in the "Strings" subgraph:

```
S_CANVAS["canvas:{ideaId}<br/>CanvasState JSON"]
S_ASSUMPTION["assumption:{ideaId}:{type}<br/>Assumption JSON"]
S_PIVOT_SUG["pivot-suggestions:{ideaId}:{type}<br/>PivotSuggestion[] JSON"]
S_PIVOT_HIST["pivots:{ideaId}:{type}<br/>PivotRecord[] JSON"]
```

**Step 2: Update the API Routes section**

Add new routes to the API Routes table:

```
| Validation Canvas | `/api/validation/[ideaId]` | GET | Full canvas state with assumptions and pivot suggestions |
| Validation Pivot | `/api/validation/[ideaId]/pivot` | POST | Approve a pivot suggestion |
| Validation Kill | `/api/validation/[ideaId]/kill` | POST | Archive the project |
```

**Step 3: Update the Foundation Document Generation Order diagram**

Change `STRATEGY` label from `(Richard Rumelt)` to `(Seth Godin)`.

**Step 4: Update the Library Module Map**

In the Advisors subgraph, update the advisor count from 4 to 14 (the registry has grown significantly since the architecture doc was last updated). Seth Godin is already included:

```
advisors_registry["advisors/registry.ts<br/>14 advisors including Seth Godin, Richard Rumelt,<br/>April Dunford, SEO Expert, and others"]
```

Also update the Quick Reference section's library table entry from "4-advisor virtual board registry" to "14-advisor virtual board registry".

Add a new entry in the Support Modules:

```
S_CANVAS_MOD["validation-canvas"]
```

**Step 5: Update the Components section**

Add to the Components table:

```
| `ValidationCanvas.tsx` | Validation canvas displaying 5 assumption cards with status |
| `PivotActions.tsx` | Client component for pivot approval and project kill actions |
```

**Step 6: Commit**

```
git add docs/architecture.md
git commit -m "docs: update architecture for validation canvas, Seth Godin advisor, new API routes"
```

---

### Task 11: Add ValidationCanvas Component Tests

**Files:**
- Create: `src/components/__tests__/ValidationCanvas.test.tsx`

The design doc specifies a component test file covering rendering, status display, pivot interaction, and kill button.

**Step 1: Write component render tests**

Create `src/components/__tests__/ValidationCanvas.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ValidationCanvas from '@/components/ValidationCanvas';
import type { Assumption, AssumptionType, CanvasState } from '@/types';

// Mock PivotActions since it's a client component
vi.mock('@/components/PivotActions', () => ({
  default: ({ type }: { type: string }) => <div data-testid={`pivot-actions-${type}`}>PivotActions</div>,
}));

const mockAssumption = (type: AssumptionType, status: string, statement: string): Assumption => ({
  type,
  status: status as Assumption['status'],
  statement,
  evidence: status === 'validated' ? ['1,200 monthly searches'] : [],
  threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
  linkedStage: 'analysis',
});

describe('ValidationCanvas', () => {
  const defaultCanvas: CanvasState = { status: 'active' };
  const defaultAssumptions = {
    demand: mockAssumption('demand', 'validated', 'High search volume confirmed'),
    reachability: mockAssumption('reachability', 'testing', 'Content ranking in progress'),
    engagement: mockAssumption('engagement', 'untested', 'Signup rate TBD'),
    wtp: mockAssumption('wtp', 'untested', 'Pricing page visits TBD'),
    differentiation: mockAssumption('differentiation', 'untested', 'Market gap TBD'),
  };

  it('renders all five assumption cards', () => {
    render(
      <ValidationCanvas
        ideaId="idea-1"
        canvas={defaultCanvas}
        assumptions={defaultAssumptions}
        pivotSuggestions={{}}
        pivotHistory={{}}
      />
    );

    expect(screen.getByText('Demand')).toBeDefined();
    expect(screen.getByText('Reachability')).toBeDefined();
    expect(screen.getByText('Engagement')).toBeDefined();
    expect(screen.getByText('WTP')).toBeDefined();
    expect(screen.getByText('Differentiation')).toBeDefined();
  });

  it('displays status badges for each assumption', () => {
    render(
      <ValidationCanvas
        ideaId="idea-1"
        canvas={defaultCanvas}
        assumptions={defaultAssumptions}
        pivotSuggestions={{}}
        pivotHistory={{}}
      />
    );

    expect(screen.getByText('validated')).toBeDefined();
    expect(screen.getByText('testing')).toBeDefined();
    expect(screen.getAllByText('untested')).toHaveLength(3);
  });

  it('shows pivot actions for invalidated assumptions', () => {
    const assumptions = {
      ...defaultAssumptions,
      demand: mockAssumption('demand', 'invalidated', 'Low search volume'),
    };

    render(
      <ValidationCanvas
        ideaId="idea-1"
        canvas={defaultCanvas}
        assumptions={assumptions}
        pivotSuggestions={{ demand: [{ statement: 'Pivot A', evidence: [], impact: 'low', experiment: 'test' }] }}
        pivotHistory={{}}
      />
    );

    expect(screen.getByTestId('pivot-actions-demand')).toBeDefined();
  });

  it('shows "Reset" badge for downstream assumptions when upstream is invalidated', () => {
    const assumptions = {
      ...defaultAssumptions,
      demand: mockAssumption('demand', 'invalidated', 'No demand found'),
    };

    render(
      <ValidationCanvas
        ideaId="idea-1"
        canvas={defaultCanvas}
        assumptions={assumptions}
        pivotSuggestions={{}}
        pivotHistory={{}}
      />
    );

    // Downstream of demand should show "Reset"
    const resetBadges = screen.getAllByText('Reset');
    expect(resetBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('grays out killed canvas and shows reason', () => {
    const killedCanvas: CanvasState = {
      status: 'killed',
      killedAt: Date.now(),
      killedReason: 'No market demand',
    };

    const { container } = render(
      <ValidationCanvas
        ideaId="idea-1"
        canvas={killedCanvas}
        assumptions={defaultAssumptions}
        pivotSuggestions={{}}
        pivotHistory={{}}
      />
    );

    expect(screen.getByText(/No market demand/)).toBeDefined();
    // Check opacity class is applied
    expect(container.firstElementChild?.classList.contains('opacity-50')).toBe(true);
  });

  it('shows pivot history count when history exists', () => {
    render(
      <ValidationCanvas
        ideaId="idea-1"
        canvas={defaultCanvas}
        assumptions={defaultAssumptions}
        pivotSuggestions={{}}
        pivotHistory={{
          demand: [{
            fromStatement: 'old', toStatement: 'new', reason: 'test',
            suggestedBy: 'system', approvedBy: 'curator', timestamp: 1, alternatives: [],
          }],
        }}
      />
    );

    expect(screen.getByText('1 pivot recorded')).toBeDefined();
  });

  it('renders section divider between canvas and project details', () => {
    render(
      <ValidationCanvas
        ideaId="idea-1"
        canvas={defaultCanvas}
        assumptions={defaultAssumptions}
        pivotSuggestions={{}}
        pivotHistory={{}}
      />
    );

    expect(screen.getByText('Project Details')).toBeDefined();
  });
});
```

**Step 2: Run the tests**

Run: `npx vitest run src/components/__tests__/ValidationCanvas.test.tsx`

If `@testing-library/react` is not installed, install it first:
```
npm install -D @testing-library/react @testing-library/jest-dom
```

Expected: All tests pass

**Step 3: Commit**

```
git add src/components/__tests__/ValidationCanvas.test.tsx
git commit -m "test(validation-canvas): add component render tests for ValidationCanvas"
```

---

## Manual Steps (Post-Automation)

> Complete these steps after all automated tasks finish.

- [ ] **Visual QA:** Start `npm run dev`, navigate to a project that has an analysis, and verify the canvas renders correctly. Test the responsive layout on mobile viewport.
- [ ] **Generate canvas for existing project:** Click through to a project page. If no canvas exists, call `GET /api/validation/{ideaId}?generate=true` to create one. Verify the five assumption cards populate with data from the analysis.
- [ ] **Test pivot flow:** Manually set an assumption to `invalidated` status in Redis, then call `generatePivotSuggestions` via the API or directly. Verify suggestions appear on the card and the "Explore Pivot" button works.
- [ ] **Test kill flow:** Click "Archive Project" on an invalidated card. Verify the canvas grays out and shows the kill reason.
- [ ] **Regenerate strategy doc:** For an existing project, delete the strategy foundation doc from Redis and regenerate. Verify it now uses Seth Godin's three-questions format instead of Rumelt's diagnosis/policy/actions format.

---

## Decision Log

### Summary

| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Advisor prompt format | Follow CLAUDE.md (`.md` file) | Design doc says `.ts` |
| 2 | Canvas data keys | Separate keys per assumption | Single hash for all canvas data |
| 3 | Evaluation trigger | After analytics cron, scan all ideas | Per-idea webhook trigger |
| 4 | Canvas component pattern | Server component + client child for actions | Full client component |
| 5 | Pivot confirmation UX | Browser `prompt()` for kill reason | Custom modal component |
| 6 | Threshold auto-evaluation | Deferred to follow-up plan | Implement in this plan |
| 7 | Strategy doc regeneration on pivot | Delete strategy doc, regenerate on next visit | Auto-regenerate immediately |

### Appendix: Decision Details

#### Decision 1: Advisor prompt format for Seth Godin

**Chose:** Create `seth-godin.md` following CLAUDE.md convention
**Why:** The project CLAUDE.md explicitly states "Never create advisor prompts as `.ts` files — always `.md`" and "Prompt loaders use `readFileSync` to read `.md` files from disk (not TS imports)." The design doc says `.ts` but was written before the migration convention was established. The codebase is actively migrating from `.ts` to `.md` (git status shows `.ts` deletions and `.md` creations for existing advisors). Following the established convention ensures consistency.
**Alternatives rejected:**
- Create `.ts` as design doc specifies: conflicts with CLAUDE.md, would need to be migrated later.

#### Decision 2: Canvas data keys — separate vs. hash

**Chose:** Separate `SET`/`GET` keys per assumption type (e.g., `assumption:{ideaId}:demand`)
**Why:** This matches the design document's data model exactly. It also follows the `foundation:{ideaId}:{docType}` pattern already established in the codebase. Individual key access means we never need to read/write the entire canvas when updating one assumption — lower Redis bandwidth.
**Alternatives rejected:**
- Single hash with all assumptions: Would require reading the full canvas to update one field. Doesn't match the existing per-type key pattern.

#### Decision 3: Evaluation trigger approach

**Chose:** `evaluateAllCanvases()` scans all ideas after analytics cron
**Why:** The design doc specifies "After each analytics cron run, the system evaluates all Testing assumptions." Since the analytics cron already runs weekly for all ideas, adding a scan at the end is the simplest integration. The scan is lightweight — it reads canvas state and skips ideas without active canvases.
**Alternatives rejected:**
- Per-idea webhook: More complex, requires event infrastructure that doesn't exist.

#### Decision 4: Server component with client child

**Chose:** `ValidationCanvas` as server component, `PivotActions` as `'use client'` child
**Why:** This follows the existing pattern in the project page — `ScoreRing` and the page itself are server-rendered, while interactive elements like `DeleteButton` and `ReanalyzeForm` use `'use client'`. The canvas is mostly display; only the pivot approval and kill actions need interactivity.
**Alternatives rejected:**
- Full client component: Unnecessary client-side JS for what is mostly static display. Would also require `useEffect` for data fetching instead of server-side data loading.

#### Decision 5: Browser `prompt()` for kill reason

**Chose:** Use `window.prompt()` for the kill reason input
**Why:** This is the simplest approach that meets the design doc's requirement ("kill the project directly from the canvas — no navigation to a separate page"). A browser prompt is immediate, requires no additional UI components, and captures a text reason. The kill action is expected to be rare (once per project at most).
**Alternatives rejected:**
- Custom modal: Over-engineered for a one-time, rare action. Would require additional component code, state management, and styling for minimal benefit.

#### Decision 6: Defer threshold auto-evaluation

**Chose:** Implement `evaluateAssumptions` as a hook point with guard logic (skip killed canvases, skip non-testing assumptions), but defer the actual threshold comparison logic to a follow-up plan.
**Why:** Meaningful auto-evaluation requires integrating with GSC analytics data (for reachability), painted door signup data (for engagement), and research agent output (for demand). Each of these data sources has different schemas and access patterns. Implementing all threshold comparisons in this plan would roughly double its scope. The manual curator workflow (changing assumption statuses via the API) provides immediate value while the auto-evaluation is built separately. The design doc's requirement is fully acknowledged — this is a scoping decision, not a silent omission.
**Alternatives rejected:**
- Implement full auto-evaluation in this plan: Would add 3-4 additional tasks touching analytics-db, gsc-client, and painted-door-db modules, significantly expanding scope.

#### Decision 7: Strategy doc regeneration approach on pivot

**Chose:** Delete the strategy foundation doc from Redis when a Demand or Differentiation pivot is approved. The Foundation tab's existing "generate" flow will detect the missing doc and allow regeneration with the new context.
**Why:** The foundation agent already handles doc generation with dependency ordering (strategy first, then positioning, etc.). Deleting the strategy doc and letting the user trigger regeneration from the Foundation tab reuses existing infrastructure without requiring a new auto-regeneration mechanism. This also gives the curator control over when regeneration happens — they may want to review the new assumption before regenerating strategy.
**Alternatives rejected:**
- Auto-regenerate immediately on pivot: Would require calling the foundation agent from within `applyPivot`, creating a tight coupling between validation canvas and foundation generation. Also risks slow API responses since foundation doc generation takes 30-60 seconds.
