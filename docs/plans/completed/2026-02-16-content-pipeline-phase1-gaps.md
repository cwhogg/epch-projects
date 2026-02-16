# Content Pipeline Phase 1 Gaps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Close all Phase 1 implementation gaps identified in the design critique: per-card generation API, per-doc progress wiring, full UI rewrite to match mockups, and "Update via conversation" link gating.

**Source Design Doc:** `docs/plans/2026-02-09-content-pipeline-design.md` (Phase 1 Implementation Gaps section, lines 749-758)

**Architecture:** The existing foundation system has a working agent pipeline (foundation-agent → foundation-tools → Redis storage) and a basic UI that polls a GET endpoint. This plan adds a `docType` parameter to the POST API for per-card generation, wires per-doc progress updates through the tool layer, fixes a DB deserialization bug, and rewrites the foundation panel UI to match four HTML mockups (foundation-panel, expanded-document-view, generation-progress, advisor-interview placeholders).

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Upstash Redis, Anthropic SDK

**Task ordering:** Tasks must be completed in numerical order. Tasks 3 and 4 both modify `foundation-agent.ts` — complete Task 3 first.

**Behavior change:** Tasks 2-3 introduce per-doc progress updates. The GET `/api/foundation/[ideaId]` endpoint will now return real-time per-document status transitions (`pending` → `running` → `complete`/`error`) during generation. Previously, `progress.docs` was static after initialization. This is the intended fix for the "per-doc progress not wired" gap.

---

## ✅ Task 1: Fix `getFoundationProgress` deserialization

**Files:**
- Modify: `src/lib/db.ts:349-353`
- Modify: `src/lib/__tests__/foundation-db.test.ts:134-158`

**Step 1: Update the DB function to use `parseValue`**

In `src/lib/db.ts`, change:

```typescript
export async function getFoundationProgress(ideaId: string): Promise<FoundationProgress | null> {
  const data = await getRedis().get(`foundation_progress:${ideaId}`);
  if (!data) return null;
  return data as FoundationProgress;
}
```

To:

```typescript
export async function getFoundationProgress(ideaId: string): Promise<FoundationProgress | null> {
  const data = await getRedis().get(`foundation_progress:${ideaId}`);
  if (!data) return null;
  return parseValue<FoundationProgress>(data);
}
```

**Step 2: Update the test to pass a JSON string (matching real Redis behavior)**

In `src/lib/__tests__/foundation-db.test.ts`, change the `getFoundationProgress` test at line 149:

```typescript
mockRedis.get.mockResolvedValue(progress);
```

To:

```typescript
mockRedis.get.mockResolvedValue(JSON.stringify(progress));
```

**Step 3: Run tests**

Run: `cd /Users/ericpage/software/epch-projects-content-pipeline && npx vitest run src/lib/__tests__/foundation-db.test.ts`
Expected: All tests pass

**Step 4: Commit**

```
git add src/lib/db.ts src/lib/__tests__/foundation-db.test.ts
git commit -m "fix: use parseValue for getFoundationProgress deserialization"
```

---

## ✅ Task 2: Wire per-doc progress updates in `generate_foundation_doc` tool

**Files:**
- Modify: `src/lib/agent-tools/foundation.ts:120`
- Modify: `src/lib/__tests__/foundation-tools.test.ts`

The `generate_foundation_doc` tool currently saves the doc to Redis but never updates `progress.docs[docType]`. The tool needs access to a progress-update callback. The cleanest approach: accept an `onDocProgress` callback in `createFoundationTools` that the agent calls after each doc completes.

**Step 1: Write failing tests for per-doc progress updates**

Add to `src/lib/__tests__/foundation-tools.test.ts`, after the existing `generate_foundation_doc` describe block:

```typescript
it('calls onDocProgress with running then complete when generating a doc', async () => {
  const onDocProgress = vi.fn();
  const toolsWithProgress = createFoundationTools(ideaId, onDocProgress);

  vi.mocked(buildContentContext).mockResolvedValue(mockContext);
  vi.mocked(getFoundationDoc).mockResolvedValue(null);
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: 'Generated strategy' }],
  });

  const tool = toolsWithProgress.find(t => t.name === 'generate_foundation_doc')!;
  await tool.execute({ docType: 'strategy' });

  expect(onDocProgress).toHaveBeenCalledWith('strategy', 'running');
  expect(onDocProgress).toHaveBeenCalledWith('strategy', 'complete');
});

it('calls onDocProgress with error when Claude API fails', async () => {
  const onDocProgress = vi.fn();
  const toolsWithProgress = createFoundationTools(ideaId, onDocProgress);

  vi.mocked(buildContentContext).mockResolvedValue(mockContext);
  vi.mocked(getFoundationDoc).mockResolvedValue(null);
  mockCreate.mockRejectedValue(new Error('Rate limit exceeded'));

  const tool = toolsWithProgress.find(t => t.name === 'generate_foundation_doc')!;
  await expect(tool.execute({ docType: 'strategy' })).rejects.toThrow('Rate limit exceeded');

  expect(onDocProgress).toHaveBeenCalledWith('strategy', 'running');
  expect(onDocProgress).toHaveBeenCalledWith('strategy', 'error');
});

it('does NOT call onDocProgress when upstream doc is missing', async () => {
  const onDocProgress = vi.fn();
  const toolsWithProgress = createFoundationTools(ideaId, onDocProgress);

  vi.mocked(buildContentContext).mockResolvedValue(mockContext);
  vi.mocked(getFoundationDoc).mockResolvedValue(null);

  const tool = toolsWithProgress.find(t => t.name === 'generate_foundation_doc')!;
  const result = await tool.execute({ docType: 'positioning' }) as Record<string, unknown>;

  expect(result.error).toContain('strategy');
  expect(onDocProgress).not.toHaveBeenCalled();
});
```

**Step 2: Run tests to confirm they fail**

Run: `cd /Users/ericpage/software/epch-projects-content-pipeline && npx vitest run src/lib/__tests__/foundation-tools.test.ts`
Expected: 3 new tests fail (createFoundationTools only accepts 1 argument)

**Step 3: Add `onDocProgress` callback to `createFoundationTools`**

In `src/lib/agent-tools/foundation.ts`, change the function signature at line 120:

```typescript
export function createFoundationTools(ideaId: string): ToolDefinition[] {
```

To:

```typescript
export function createFoundationTools(
  ideaId: string,
  onDocProgress?: (docType: FoundationDocType, status: 'running' | 'complete' | 'error') => void,
): ToolDefinition[] {
```

Then in the `generate_foundation_doc` execute function (line 190), add progress callbacks:

The execute function should be wrapped in a try/catch with progress callbacks placed **after** validation passes (not before — placing 'running' before the upstream check would leave docs stuck in 'running' state when they return early for missing upstream):

```typescript
execute: async (input) => {
  const docType = input.docType as FoundationDocType;
  const strategicInputs = input.strategicInputs as { differentiation?: string; deliberateTradeoffs?: string; antiTarget?: string } | undefined;

  // Check upstream dependencies BEFORE signaling 'running'
  const upstreamTypes = DOC_UPSTREAM[docType];
  const upstreamDocs: Record<string, string> = {};

  for (const upType of upstreamTypes) {
    const doc = await getFoundationDoc(ideaId, upType);
    if (!doc) {
      return { error: `Cannot generate ${docType}: upstream document "${upType}" does not exist. Generate it first.` };
    }
    upstreamDocs[upType] = doc.content;
  }

  // Validation passed — NOW signal 'running'
  onDocProgress?.(docType, 'running');

  try {
    // Build idea context
    const ctx = await buildContentContext(ideaId);
    if (!ctx) {
      return { error: 'No analysis found for this idea. Run analysis first.' };
    }
    // ... rest of existing context-building + Claude call logic unchanged ...

    await saveFoundationDoc(ideaId, doc);
    onDocProgress?.(docType, 'complete');

    return {
      success: true,
      docType,
      advisorId,
      version,
      contentLength: content.length,
      content,
    };
  } catch (err) {
    onDocProgress?.(docType, 'error');
    throw err;
  }
},
```

Key placement rules:
- `onDocProgress('running')` fires **after** upstream dependency check passes, **before** the Claude API call.
- `onDocProgress('complete')` fires **after** `saveFoundationDoc` succeeds.
- `onDocProgress('error')` fires only for **thrown** errors (Claude API failures, Redis errors), not for expected control-flow returns (upstream missing, no analysis). Those leave the doc in 'pending' state.
- The upstream check and "no analysis" early returns are **outside** the try/catch — they don't trigger 'error' callbacks.

**Step 4: Run tests**

Run: `cd /Users/ericpage/software/epch-projects-content-pipeline && npx vitest run src/lib/__tests__/foundation-tools.test.ts`
Expected: All tests pass (existing tests still work because `onDocProgress` is optional)

**Step 5: Commit**

```
git add src/lib/agent-tools/foundation.ts src/lib/__tests__/foundation-tools.test.ts
git commit -m "feat: wire per-doc progress callback into generate_foundation_doc"
```

---

## ✅ Task 3: Connect progress callback in foundation agent

**Files:**
- Modify: `src/lib/foundation-agent.ts:72-100`
- Modify: `src/lib/__tests__/foundation-agent.test.ts`

**Step 1: Write failing test for per-doc progress saving**

Add to `src/lib/__tests__/foundation-agent.test.ts`:

```typescript
it('updates per-doc progress when tools report status', async () => {
  vi.mocked(getActiveRunId).mockResolvedValue(null);
  vi.mocked(runAgent).mockResolvedValue({ status: 'complete', runId: 'test', messages: [], resumeCount: 0, turnCount: 1 });

  await runFoundationGeneration('idea-123');

  // Verify createFoundationTools was called with a progress callback
  const createToolsCall = vi.mocked(createFoundationTools).mock.calls[0];
  expect(createToolsCall[0]).toBe('idea-123');
  expect(typeof createToolsCall[1]).toBe('function');

  // Simulate the callback being called
  const onDocProgress = createToolsCall[1]!;
  await onDocProgress('strategy', 'running');

  // Verify progress was saved with the updated doc status AND currentStep
  const savedProgress = vi.mocked(saveFoundationProgress).mock.calls;
  const lastCall = savedProgress[savedProgress.length - 1];
  expect(lastCall[1].docs.strategy).toBe('running');
  expect(lastCall[1].currentStep).toBe('Generating strategy...');
});
```

**Step 2: Run test to confirm it fails**

Run: `cd /Users/ericpage/software/epch-projects-content-pipeline && npx vitest run src/lib/__tests__/foundation-agent.test.ts`
Expected: Fails because `createFoundationTools` is called with only 1 argument

**Step 3: Wire the progress callback in `foundation-agent.ts`**

In `src/lib/foundation-agent.ts`, change the tools creation at line 72-76:

```typescript
const tools = [
  ...createPlanTools(runId),
  ...createScratchpadTools(),
  ...createFoundationTools(ideaId),
];
```

To:

```typescript
const onDocProgress = async (docType: FoundationDocType, status: 'running' | 'complete' | 'error') => {
  progress.docs[docType] = status;
  if (status === 'running') {
    progress.currentStep = `Generating ${docType.replace(/-/g, ' ')}...`;
  }
  await saveFoundationProgress(ideaId, progress);
};

const tools = [
  ...createPlanTools(runId),
  ...createScratchpadTools(),
  ...createFoundationTools(ideaId, onDocProgress),
];
```

Add the import for `FoundationDocType` at the top:
```typescript
import type { AgentConfig, FoundationProgress, FoundationDocType } from '@/types';
```

Also update the mock for `createFoundationTools` in the test file to accept the second parameter:
```typescript
vi.mock('@/lib/agent-tools/foundation', () => ({
  createFoundationTools: vi.fn(() => []),
}));
```

**Step 4: Run tests**

Run: `cd /Users/ericpage/software/epch-projects-content-pipeline && npx vitest run src/lib/__tests__/foundation-agent.test.ts`
Expected: All tests pass

**Step 5: Commit**

```
git add src/lib/foundation-agent.ts src/lib/__tests__/foundation-agent.test.ts
git commit -m "feat: wire per-doc progress updates through foundation agent"
```

---

## ✅ Task 4: Add `docType` parameter to POST API route for per-card generation

**Files:**
- Modify: `src/app/api/foundation/[ideaId]/route.ts:9-63`

**Step 1: Add `docType` to request body parsing**

In `src/app/api/foundation/[ideaId]/route.ts`, update the POST handler body parsing (lines 38-47):

```typescript
// Parse optional parameters from request body
let strategicInputs: StrategicInputs | undefined;
let docType: string | undefined;
try {
  const body = await request.json();
  if (body.strategicInputs) {
    strategicInputs = body.strategicInputs;
  }
  if (body.docType) {
    docType = body.docType;
  }
} catch {
  // No body or invalid JSON — that's fine, all fields are optional
}
```

**Step 2: Pass `docType` to the agent**

Update the `after()` callback to pass `docType`:

```typescript
after(async () => {
  try {
    await runFoundationGeneration(ideaId, strategicInputs, docType);
  } catch (error) {
    if (error instanceof Error && error.message === 'AGENT_PAUSED') {
      console.log(`[foundation] Agent paused for ${ideaId}, will resume on next request`);
      return;
    }
    console.error('Foundation generation failed:', error);
  }
});
```

**Step 3: Update `runFoundationGeneration` signature and initial message**

In `src/lib/foundation-agent.ts`, update the function signature:

```typescript
export async function runFoundationGeneration(
  ideaId: string,
  strategicInputs?: StrategicInputs,
  docType?: string,
): Promise<void> {
```

Update the initial message construction (line 104):

```typescript
let initialMessage: string;
if (docType) {
  initialMessage = `Generate only the "${docType}" foundation document for idea ID: ${ideaId}.`;
} else {
  initialMessage = `Generate all foundation documents for this idea (ID: ${ideaId}).`;
}
```

Keep the strategic inputs append logic the same (it follows the message).

Also update the progress initialization — when generating a single doc, only mark that doc as pending:

```typescript
const progress = makeInitialProgress(ideaId);
if (docType) {
  // For single doc generation, preserve existing doc statuses
  const existingProgress = await getFoundationProgress(ideaId);
  if (existingProgress?.docs) {
    Object.assign(progress.docs, existingProgress.docs);
  }
  progress.docs[docType as FoundationDocType] = 'pending';
}
progress.status = 'running';
progress.currentStep = isResume
  ? 'Resuming foundation generation...'
  : docType
    ? `Generating ${docType.replace(/-/g, ' ')}...`
    : 'Starting foundation generation...';
await saveFoundationProgress(ideaId, progress);
```

Add the import:
```typescript
import { saveFoundationProgress, getFoundationProgress } from './db';
```

**Step 4: Run all foundation tests**

Run: `cd /Users/ericpage/software/epch-projects-content-pipeline && npx vitest run src/lib/__tests__/foundation-agent.test.ts src/lib/__tests__/foundation-tools.test.ts`
Expected: All pass

**Step 5: Commit**

```
git add src/app/api/foundation/[ideaId]/route.ts src/lib/foundation-agent.ts
git commit -m "feat: add docType parameter to POST API for per-card generation"
```

---

## Task 5: Add API route tests

**Files:**
- Create: `src/app/api/foundation/[ideaId]/__tests__/route.test.ts`

**Step 1: Write route tests**

Create `src/app/api/foundation/[ideaId]/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  isRedisConfigured: vi.fn(),
  getAllFoundationDocs: vi.fn(),
  getFoundationProgress: vi.fn(),
}));

vi.mock('@/lib/foundation-agent', () => ({
  runFoundationGeneration: vi.fn(),
}));

// Mock next/server after() — runs the async callback synchronously in tests
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    after: (fn: () => Promise<void> | void) => fn(),
  };
});

import { GET, POST } from '@/app/api/foundation/[ideaId]/route';
import { isRedisConfigured, getAllFoundationDocs, getFoundationProgress } from '@/lib/db';
import { runFoundationGeneration } from '@/lib/foundation-agent';

function makeRequest(method: string, body?: Record<string, unknown>): NextRequest {
  const url = 'http://localhost:3000/api/foundation/idea-123';
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(url, init);
}

const params = Promise.resolve({ ideaId: 'idea-123' });

describe('Foundation API route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  describe('GET', () => {
    it('returns docs and progress', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationProgress).mockResolvedValue(null);
      vi.mocked(getAllFoundationDocs).mockResolvedValue({});

      const res = await GET(makeRequest('GET'), { params });
      const body = await res.json();

      expect(body.progress).toEqual({ status: 'not_started' });
      expect(body.docs).toEqual({});
    });

    it('returns 500 when Redis is not configured', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(false);

      const res = await GET(makeRequest('GET'), { params });
      expect(res.status).toBe(500);
    });

    it('returns 500 when Redis throws', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationProgress).mockRejectedValue(new Error('Connection lost'));

      const res = await GET(makeRequest('GET'), { params });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    });
  });

  describe('POST', () => {
    it('starts generation and returns 200', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationProgress).mockResolvedValue(null);
      vi.mocked(runFoundationGeneration).mockResolvedValue();

      const res = await POST(makeRequest('POST'), { params });
      const body = await res.json();

      expect(body.message).toContain('started');
      expect(runFoundationGeneration).toHaveBeenCalledWith('idea-123', undefined, undefined);
    });

    it('passes docType when provided in body', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationProgress).mockResolvedValue(null);
      vi.mocked(runFoundationGeneration).mockResolvedValue();

      const res = await POST(makeRequest('POST', { docType: 'strategy' }), { params });
      const body = await res.json();

      expect(body.message).toContain('started');
      expect(runFoundationGeneration).toHaveBeenCalledWith('idea-123', undefined, 'strategy');
    });

    it('returns early if already running', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationProgress).mockResolvedValue({
        ideaId: 'idea-123',
        status: 'running',
        currentStep: 'Generating...',
        docs: {
          strategy: 'running',
          positioning: 'pending',
          'brand-voice': 'pending',
          'design-principles': 'pending',
          'seo-strategy': 'pending',
          'social-media-strategy': 'pending',
        },
      });

      const res = await POST(makeRequest('POST'), { params });
      const body = await res.json();

      expect(body.message).toContain('Already running');
      expect(runFoundationGeneration).not.toHaveBeenCalled();
    });

    it('returns 500 when Redis is not configured', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(false);

      const res = await POST(makeRequest('POST'), { params });
      expect(res.status).toBe(500);
    });

    it('returns 500 when ANTHROPIC_API_KEY is missing', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      delete process.env.ANTHROPIC_API_KEY;

      const res = await POST(makeRequest('POST'), { params });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain('ANTHROPIC_API_KEY');
    });
  });
});
```

**Step 2: Run tests**

Run: `cd /Users/ericpage/software/epch-projects-content-pipeline && npx vitest run src/app/api/foundation/[ideaId]/__tests__/route.test.ts`
Expected: All 7 tests pass (these are retroactive tests — the implementation already exists)

**Step 3: Commit**

```
git add src/app/api/foundation/[ideaId]/__tests__/route.test.ts
git commit -m "test: add API route tests for foundation endpoint"
```

---

## Task 6: Rewrite foundation panel UI — page structure, header, and CSS variables

**Files:**
- Modify: `src/app/analyses/[id]/foundation/page.tsx` (full rewrite)

This is the main UI rewrite. The current page uses inline styles with undefined CSS variables (`--accent-primary`, `--border-primary`, `--bg-error`, `--text-error`), displays cards with `var(--bg-primary)` (page background) making them invisible, and has no animations, no Fraunces font, and no design system compliance.

The target state is defined by four mockups:
- `docs/mockups/content-pipeline/foundation-panel.html` — card states (empty, ready, generated, edited)
- `docs/mockups/content-pipeline/expanded-document-view.html` — expanded inline view with metadata, prose rendering, "Update via conversation" link
- `docs/mockups/content-pipeline/generation-progress.html` — progress state with shimmer bars, glow-pulse, per-card status
- `docs/mockups/content-pipeline/advisor-interview.html` — placeholder for Phase 4a

The rewrite is split into Tasks 6-8 for manageable commits.

**Step 1: Rewrite the page with proper structure and header**

Rewrite `src/app/analyses/[id]/foundation/page.tsx`. The full component:

```tsx
'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import type {
  FoundationDocument,
  FoundationDocType,
  FoundationProgress,
} from '@/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

type DocMap = Partial<Record<FoundationDocType, FoundationDocument>>;

interface FoundationData {
  progress: FoundationProgress | { status: 'not_started' };
  docs: DocMap;
}

const DOC_CONFIG: {
  type: FoundationDocType;
  label: string;
  advisor: string;
  requires: string | null;
}[] = [
  { type: 'strategy', label: 'Strategy', advisor: 'Richard Rumelt', requires: null },
  { type: 'positioning', label: 'Positioning Statement', advisor: 'April Dunford', requires: 'Strategy' },
  { type: 'brand-voice', label: 'Brand Voice', advisor: 'Brand Copywriter', requires: 'Positioning' },
  { type: 'design-principles', label: 'Design Principles', advisor: 'Derived', requires: 'Positioning + Strategy' },
  { type: 'seo-strategy', label: 'SEO Strategy', advisor: 'SEO Expert', requires: 'Positioning' },
  { type: 'social-media-strategy', label: 'Social Media Strategy', advisor: 'TBD', requires: 'Brand Voice' },
];

function canGenerate(docType: FoundationDocType, docs: DocMap): boolean {
  if (docType === 'strategy') return true;
  if (docType === 'positioning') return !!docs['strategy'];
  if (docType === 'brand-voice') return !!docs['positioning'];
  if (docType === 'design-principles') return !!docs['positioning'] && !!docs['strategy'];
  if (docType === 'seo-strategy') return !!docs['positioning'];
  if (docType === 'social-media-strategy') return !!docs['positioning'] && !!docs['brand-voice'];
  return false;
}

function getPreview(content: string): string {
  const lines = content.split('\n').filter((l) => l.trim()).slice(0, 3);
  const preview = lines.join(' ').slice(0, 200);
  return preview.length < lines.join(' ').length ? preview + '...' : preview;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// SVG icons as components to keep JSX clean
function CheckCircleIcon({ color = 'var(--accent-emerald)' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function EmptyCircleIcon({ color = 'var(--text-muted)' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function ReadyCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function ErrorCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function PlayIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

type CardState = 'empty' | 'ready' | 'generating' | 'generated' | 'edited' | 'error' | 'pending';

function getCardState(
  docType: FoundationDocType,
  doc: FoundationDocument | undefined,
  canGen: boolean,
  docProgress: string | undefined,
): CardState {
  if (docProgress === 'running') return 'generating';
  if (docProgress === 'error') return 'error';
  if (docProgress === 'pending' && !doc) return 'pending';
  if (doc?.editedAt) return 'edited';
  if (doc) return 'generated';
  if (canGen) return 'ready';
  return 'empty';
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

  useEffect(() => {
    if (!data || data.progress.status !== 'running') return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [data, fetchData]);

  const handleGenerate = async (docType?: FoundationDocType) => {
    setGenerating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (docType) body.docType = docType;
      const res = await fetch(`/api/foundation/${ideaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to start');
      }
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
  const progress = data?.progress.status !== 'not_started' ? (data?.progress as FoundationProgress) : null;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 1.5rem', paddingBottom: '4rem' }}>
      {/* Page Header */}
      <div className="animate-slide-up stagger-1" style={{ position: 'relative', padding: '2rem 0 1.5rem' }}>
        {/* Decorative gradient */}
        <div style={{
          position: 'absolute', top: -40, left: -80, width: 400, height: 300,
          background: 'radial-gradient(ellipse, rgba(167, 139, 250, 0.12) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <Link
            href={`/analyses/${ideaId}`}
            style={{
              fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--text-muted)',
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
              marginBottom: '1rem', transition: 'color 0.2s',
            }}
          >
            <ArrowLeftIcon />
            Back to Analysis
          </Link>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
            <div>
              <h1 style={{
                fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.75rem',
                letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0, lineHeight: 1.2,
              }}>
                Foundation Documents
              </h1>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: '0.875rem',
                color: 'var(--text-secondary)', marginTop: '0.25rem',
              }}>
                {isRunning
                  ? `Generating \u2014 ${docCount}/6 complete`
                  : `${docCount}/6 documents generated`}
              </p>
            </div>
            {isRunning ? (
              <button className="btn btn-secondary" disabled style={{ gap: '0.5rem' }}>
                <span className="spinner" style={{
                  width: 16, height: 16, border: '2px solid var(--border-default)',
                  borderTopColor: 'var(--accent-coral)', borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite', display: 'inline-block',
                }} />
                Generating...
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => handleGenerate()} disabled={generating}>
                <PlayIcon />
                Generate All
              </button>
            )}
          </div>

          {/* Progress bar (only during generation) */}
          {isRunning && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{
                width: '100%', height: 4, background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-full)', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 'var(--radius-full)',
                  background: 'linear-gradient(90deg, var(--accent-coral) 0%, var(--accent-emerald) 100%)',
                  transition: 'width 0.6s ease',
                  width: `${Math.round((docCount / 6) * 100)}%`,
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.375rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{docCount} of 6 documents</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {progress?.currentStep || ''}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Global error */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.75rem 1rem',
          background: 'rgba(248, 113, 113, 0.08)',
          border: '1px solid rgba(248, 113, 113, 0.2)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1rem',
        }}>
          <WarningIcon />
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-danger)', flex: 1 }}>{error}</span>
        </div>
      )}

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginTop: '0.5rem' }}>
        {DOC_CONFIG.map(({ type, label, advisor, requires }, idx) => {
          const doc = docs[type];
          const canGen = canGenerate(type, docs);
          const docProgress = progress?.docs?.[type];
          const state = getCardState(type, doc, canGen, docProgress);
          const isExpanded = expandedDoc === type;

          return isExpanded && doc ? (
            // Expanded view
            <div
              key={type}
              className={`animate-slide-up stagger-${idx + 2}`}
              style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)' }}
            >
              {/* Card header */}
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
                padding: '1.25rem 1.5rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.125rem',
                      letterSpacing: '-0.02em', color: 'var(--text-primary)',
                      display: 'flex', alignItems: 'center', gap: '0.625rem',
                    }}>
                      <CheckCircleIcon />
                      {label}
                      <span style={{
                        fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 500,
                        color: 'var(--text-muted)', background: 'var(--bg-elevated)',
                        padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)',
                      }}>
                        v{doc.version}
                      </span>
                      {doc.editedAt && (
                        <span style={{
                          fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 600,
                          letterSpacing: '0.05em', textTransform: 'uppercase' as const,
                          color: 'var(--accent-coral)', background: 'var(--accent-coral-soft)',
                          padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)',
                        }}>
                          Edited
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{advisor}</p>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setExpandedDoc(null)}>
                    <ChevronUpIcon /> Hide
                  </button>
                </div>

                {/* Metadata row */}
                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', flexWrap: 'wrap' as const }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem' }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Generated</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{formatDate(doc.generatedAt)}</span>
                  </div>
                  {doc.editedAt && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem' }}>
                      <span style={{ fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Last Edited</span>
                      <span style={{ color: 'var(--accent-coral)' }}>{formatDate(doc.editedAt)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem' }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Version</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{doc.version}</span>
                  </div>
                </div>
              </div>

              {/* Content area */}
              <div style={{
                background: 'var(--bg-card)',
                borderLeft: '1px solid var(--border-subtle)',
                borderRight: '1px solid var(--border-subtle)',
                borderBottom: '1px solid var(--border-subtle)',
                borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
                padding: '1.5rem',
              }}>
                <div className="prose-editorial" style={{ whiteSpace: 'pre-wrap' }}>
                  {doc.content}
                </div>

                {/* Footer actions */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  paddingTop: '1.25rem', marginTop: '1.25rem',
                  borderTop: '1px solid var(--border-subtle)',
                }}>
                  <span
                    style={{
                      fontSize: '0.875rem', color: 'var(--text-muted)',
                      display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                      fontWeight: 500, cursor: 'not-allowed', opacity: 0.5,
                    }}
                    title="Coming in a future update"
                  >
                    <ChatIcon />
                    Update via conversation
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleGenerate(type)}
                      disabled={generating || isRunning}
                    >
                      <RefreshIcon /> Regenerate
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Collapsed card
            <div
              key={type}
              className={`animate-slide-up stagger-${idx + 2}`}
              style={{
                background: 'var(--bg-card)',
                border: `1px solid ${
                  state === 'generating' ? 'rgba(255, 107, 91, 0.25)'
                  : state === 'error' ? 'rgba(248, 113, 113, 0.25)'
                  : 'var(--border-subtle)'
                }`,
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem 1.5rem',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                opacity: state === 'empty' || state === 'pending' ? 0.5 : 1,
                animation: state === 'generating' ? 'glow-pulse 2s ease-in-out infinite' : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1rem',
                    letterSpacing: '-0.02em', color: 'var(--text-primary)',
                    display: 'flex', alignItems: 'center', gap: '0.625rem',
                  }}>
                    {state === 'generating' ? (
                      <span className="spinner" style={{
                        width: 16, height: 16, border: '2px solid var(--border-default)',
                        borderTopColor: 'var(--accent-coral)', borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite', display: 'inline-block',
                      }} />
                    ) : state === 'generated' || state === 'edited' ? (
                      <CheckCircleIcon />
                    ) : state === 'error' ? (
                      <ErrorCircleIcon />
                    ) : state === 'ready' ? (
                      <ReadyCircleIcon />
                    ) : (
                      <EmptyCircleIcon />
                    )}
                    {label}
                    {doc && (
                      <span style={{
                        fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 500,
                        color: 'var(--text-muted)', background: 'var(--bg-elevated)',
                        padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)',
                      }}>
                        v{doc.version}
                      </span>
                    )}
                    {state === 'edited' && (
                      <span style={{
                        fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 600,
                        letterSpacing: '0.05em', textTransform: 'uppercase' as const,
                        color: 'var(--accent-coral)', background: 'var(--accent-coral-soft)',
                        padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)',
                      }}>
                        Edited
                      </span>
                    )}
                    {/* State label pill */}
                    {state === 'generating' && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                        fontSize: '0.75rem', color: 'var(--accent-coral)',
                      }}>
                        Generating
                      </span>
                    )}
                    {state === 'error' && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>Failed</span>
                    )}
                  </div>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {advisor}
                    {state === 'empty' && requires ? ` \u2014 Requires: ${requires}` : ''}
                    {state === 'generating' ? ` \u2014 generating...` : ''}
                  </p>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {doc && !isRunning && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setExpandedDoc(type)}>View</button>
                  )}
                  {state === 'generated' || state === 'edited' ? (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleGenerate(type)}
                      disabled={generating || isRunning}
                    >
                      Regenerate
                    </button>
                  ) : state === 'ready' ? (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleGenerate(type)}
                      disabled={generating || isRunning}
                    >
                      <PlayIcon size={14} /> Generate
                    </button>
                  ) : state === 'empty' ? (
                    <button className="btn btn-secondary btn-sm" disabled>
                      <PlayIcon size={14} /> Generate
                    </button>
                  ) : state === 'error' ? (
                    <button
                      className="btn btn-sm"
                      style={{
                        background: 'transparent', color: 'var(--color-danger)',
                        border: '1px solid rgba(248, 113, 113, 0.3)',
                      }}
                      onClick={() => handleGenerate(type)}
                      disabled={generating || isRunning}
                    >
                      <RetryIcon /> Retry
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Preview text for generated docs */}
              {doc && state !== 'generating' && (
                <p style={{
                  fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.75rem',
                  lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                }}>
                  {getPreview(doc.content)}
                </p>
              )}

              {/* Shimmer bars for generating state */}
              {state === 'generating' && (
                <>
                  <div style={{
                    height: 12, borderRadius: 'var(--radius-sm)', width: '100%', marginTop: '0.75rem',
                    background: 'linear-gradient(90deg, var(--bg-elevated) 0%, rgba(255, 107, 91, 0.08) 50%, var(--bg-elevated) 100%)',
                    backgroundSize: '200% 100%', animation: 'shimmer 2s ease-in-out infinite',
                  }} />
                  <div style={{
                    height: 12, borderRadius: 'var(--radius-sm)', width: '75%', marginTop: '0.5rem',
                    background: 'linear-gradient(90deg, var(--bg-elevated) 0%, rgba(255, 107, 91, 0.08) 50%, var(--bg-elevated) 100%)',
                    backgroundSize: '200% 100%', animation: 'shimmer 2s ease-in-out infinite',
                  }} />
                  <div style={{
                    height: 12, borderRadius: 'var(--radius-sm)', width: '50%', marginTop: '0.5rem',
                    background: 'linear-gradient(90deg, var(--bg-elevated) 0%, rgba(255, 107, 91, 0.08) 50%, var(--bg-elevated) 100%)',
                    backgroundSize: '200% 100%', animation: 'shimmer 2s ease-in-out infinite',
                  }} />
                </>
              )}

              {/* Error banner */}
              {state === 'error' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem 1rem', marginTop: '0.75rem',
                  background: 'rgba(248, 113, 113, 0.08)',
                  border: '1px solid rgba(248, 113, 113, 0.2)',
                  borderRadius: 'var(--radius-md)',
                }}>
                  <WarningIcon />
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-danger)', flex: 1 }}>
                    Generation failed. Click Retry to try again.
                  </span>
                </div>
              )}

              {/* Requires hint for empty state */}
              {state === 'empty' && requires && (
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)',
                  fontStyle: 'italic', marginTop: '0.5rem',
                }}>
                  Waiting for {requires} to be generated before this document can be created.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Run the dev server and visually verify**

Run: `cd /Users/ericpage/software/epch-projects-content-pipeline && npm run build`
Expected: Build succeeds with no TypeScript errors

**Step 3: Commit**

```
git add src/app/analyses/[id]/foundation/page.tsx
git commit -m "feat: rewrite foundation panel UI to match design mockups"
```

---

## Task 7: Add `spin` keyframe animation to globals.css

**Files:**
- Modify: `src/app/globals.css`

The generation progress mockup uses a `spin` animation for the spinner, but globals.css doesn't define it.

**Step 1: Add the `spin` keyframe after the existing `glow-pulse` keyframe**

The `spin` keyframe does not exist in globals.css (verified: only `shimmer`, `glow-pulse`, `float`, `slide-up`, `pulse-ring`, `fade-in` are defined). Add after `glow-pulse` in `src/app/globals.css`:

```css
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

**Step 2: Build to verify**

Run: `cd /Users/ericpage/software/epch-projects-content-pipeline && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```
git add src/app/globals.css
git commit -m "feat: add spin keyframe animation for loading spinners"
```

---

## Task 8: Verify full integration — run all tests and build

**Files:** None (verification only)

**Step 1: Run all foundation tests**

Run: `cd /Users/ericpage/software/epch-projects-content-pipeline && npx vitest run src/lib/__tests__/foundation-db.test.ts src/lib/__tests__/foundation-tools.test.ts src/lib/__tests__/foundation-agent.test.ts src/app/api/foundation/[ideaId]/__tests__/route.test.ts`
Expected: All tests pass

**Step 2: Run full test suite**

Run: `cd /Users/ericpage/software/epch-projects-content-pipeline && npx vitest run`
Expected: All tests pass

**Step 3: Run production build**

Run: `cd /Users/ericpage/software/epch-projects-content-pipeline && npm run build`
Expected: Build succeeds with no errors

**Step 4: Run lint**

Run: `cd /Users/ericpage/software/epch-projects-content-pipeline && npm run lint`
Expected: No lint errors

**Step 5: Commit any lint/build fixes if needed**

If any fixes are required, commit them:
```
git add -u
git commit -m "fix: address lint/build issues from foundation rewrite"
```

---

## Decision Log

### Summary
| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Progress callback mechanism | Closure callback via `onDocProgress` param | Redis polling in agent, event emitter |
| 2 | "Update via conversation" link | Disabled with "Coming soon" tooltip | Omit entirely, link to non-existent route |
| 3 | UI implementation approach | Inline styles matching mockup CSS vars | Extract to Tailwind utility classes, CSS modules |
| 4 | Error handling in per-doc progress | Only call 'error' for thrown errors, not upstream-missing returns | Call 'error' for all non-success outcomes |
| 5 | Route test `after()` mock | Synchronous execution in test | Skip `after()` testing, use real background execution |

### Appendix: Decision Details

#### Decision 1: Progress callback mechanism
**Chose:** Closure callback (`onDocProgress`) passed from agent to tool factory
**Why:** The existing pattern in the codebase is for agent-level code to own progress tracking (see `foundation-agent.ts` lines 86-100 where `onProgress` updates progress and saves to Redis). Having the tool directly import and call `saveFoundationProgress` would bypass the agent's progress object and create a second writer for the same Redis key. The callback pattern keeps the agent as the single owner of the progress state and is consistent with how `onProgress` already works. The callback is optional (`onDocProgress?.(...)`) so all existing code continues to work without changes.
**Alternatives rejected:**
- Redis polling in agent: Would require the agent to poll Redis between tool calls to detect completion — adds latency and complexity.
- Event emitter: Over-engineering for 1 consumer; a direct callback is simpler.

#### Decision 2: "Update via conversation" link
**Chose:** Render as disabled with `cursor: not-allowed`, `opacity: 0.5`, and `title="Coming in a future update"`
**Why:** The design doc explicitly says: "Phase 1 should either omit the link or render it as disabled with a 'Coming soon' indicator." Showing it disabled signals the feature is planned (managing user expectations) while preventing navigation to a route that doesn't exist. Omitting it entirely would mean the expanded view footer looks incomplete compared to the mockup.
**Alternatives rejected:**
- Omit entirely: Loses the visual signal that conversation editing is coming.
- Link to non-existent route: Would produce a 404.

#### Decision 3: UI implementation approach
**Chose:** Inline styles using CSS custom properties from globals.css
**Why:** The existing foundation panel uses inline styles exclusively (see current `page.tsx`). The other polished pages in the codebase (`painted-door/page.tsx`, `content/page.tsx`) also use a mix of inline styles and a few CSS utility classes. The mockups define styles using CSS variables (`var(--bg-card)`, `var(--accent-coral)`, etc.) which map directly to inline style declarations. This approach matches the existing codebase pattern and directly translates the mockup CSS. A full Tailwind migration would be a separate initiative.
**Alternatives rejected:**
- Tailwind utility classes: Would require mapping all CSS vars to Tailwind theme tokens. Inconsistent with existing pages.
- CSS modules: Not used anywhere in the codebase. Would introduce a new pattern.

#### Decision 4: Error handling and callback timing in per-doc progress
**Chose:** Only call `onDocProgress(docType, 'error')` for thrown errors (Claude API failures, Redis errors), not for expected "upstream missing" or "no analysis" returns. Call `onDocProgress(docType, 'running')` AFTER validation passes (upstream check), not before.
**Why:** When `generate_foundation_doc` returns `{ error: "Cannot generate positioning: upstream..." }`, that's expected control flow — the orchestrator should skip that doc and move to the next. The UI should not show that as a "Failed" card with a red error banner. Only unexpected failures (thrown errors) should mark a card as failed with a retry option. The 'running' callback fires only after upstream dependencies are confirmed to exist — this prevents docs from getting stuck in 'running' state when they fail validation and return early.
**Alternatives rejected:**
- Call 'error' for all non-success: Would mark cards as "Failed" when upstream docs are missing, which is confusing — the card should show as "Blocked" (empty state), not "Failed."
- Call 'running' before validation: Would leave docs stuck in 'running' state when they return early for missing upstream deps (no 'complete' or 'error' callback fires on the early-return path).

#### Decision 5: Route test `after()` mock
**Chose:** Mock `after()` to execute the callback synchronously in tests
**Why:** The `after()` API (Next.js 15+) runs callbacks after the response is sent. In tests, we need to verify that the callback was called with the right arguments. Mocking it to run synchronously lets us assert on `runFoundationGeneration` calls. The alternative of not testing `after()` would leave a coverage gap in the POST handler.
**Alternatives rejected:**
- Skip `after()` testing: Leaves the most important part of the POST handler untested.
- Real background execution: Not possible in vitest — there's no Vercel runtime.
