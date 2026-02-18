# Interactive Website Builder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Replace the fire-and-forget website generation pipeline with an interactive, advisor-driven chat experience led by Julian Shapiro using his Landing Page Assembly framework, with foundation documents as the source of truth.

**Source Design Doc:** `docs/plans/2026-02-17-interactive-website-builder-design.md`

**Architecture:** A new `/website/[id]/build` page hosts a chat-first UI where Julian Shapiro leads site building through 8 framework-driven steps. A streaming chat API route runs an agent loop with the existing 16 website tools plus a new `consult_advisor` tool. The existing content critique pipeline handles Step 6 review. Two modes: interactive (checkpoint pauses) and autonomous (narrated, no pauses).

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Anthropic SDK (streaming), Upstash Redis, Vercel serverless

**Task Dependencies:**
- Task 5 requires Tasks 1-4 (uses types, Redis storage, and consult_advisor tool)
- Task 6 requires Task 5 (adds POST handler to the route scaffolded in Task 5)
- Task 7 requires Task 6 (replaces the scaffolded streaming with full agent loop)
- Task 13 requires Task 3 (imports `getBuildSession` added in Task 3)
- Task 15 must follow Task 13 (both modify `src/app/api/painted-door/[id]/route.ts`)
- Tasks 9-11 require Tasks 5-7 (UI depends on the chat API being functional)

---

## ✅ Task 1: Extract Landing Page Assembly Framework into Standalone File

**Files:**
- Create: `src/lib/frameworks/prompts/landing-page-assembly/prompt.md`
- Modify: `src/lib/frameworks/registry.ts`

The design doc says to extract Julian's embedded framework (lines 87-137 of `julian-shapiro.md`) into its own framework directory. The website recipe already references `authorFramework: 'landing-page-assembly'` in `src/lib/content-recipes.ts:24` but the framework directory doesn't exist — `getFrameworkPrompt('landing-page-assembly')` currently returns `null`.

**Step 1: Read Julian's prompt to identify exact framework boundaries**

Read `src/lib/advisors/prompts/julian-shapiro.md` lines 85-137. The Landing Page Assembly framework starts after a heading like `## Landing Page Assembly` or similar. Extract everything from the framework heading through the end of Phase 4 and failure modes.

**Step 2: Create the framework prompt file**

Create `src/lib/frameworks/prompts/landing-page-assembly/prompt.md` containing the extracted framework content. Keep it as-is from Julian's prompt — do not rewrite. The framework loader (`framework-loader.ts`) reads `prompt.md` from the directory, optionally strips YAML front matter, and returns the content.

**Step 3: Register the framework**

Add to `FRAMEWORK_REGISTRY` in `src/lib/frameworks/registry.ts`:

```typescript
{
  id: 'landing-page-assembly',
  displayName: 'Landing Page Assembly',
  advisors: ['julian-shapiro'],
  description:
    'Build conversion-focused landing pages in 4 phases: Extract Core Ingredients, Write the Hero (50% of effort), Assemble Full Page, and Pressure-Test. Treats landing page copy as an engineering problem where Purchase Rate = Desire − (Labor + Confusion).',
  contextDocs: ['positioning', 'brand-voice', 'seo-strategy'],
},
```

**Step 4: Verify framework loading works**

Run: `npm test -- --run src/lib/__tests__/critique-tools.test.ts`

The critique tools tests already mock `getFrameworkPrompt` to return `null` for `'landing-page-assembly'`. Existing tests should still pass. The new framework file means `getFrameworkPrompt('landing-page-assembly')` will return real content in production.

**Step 5: Commit**

```bash
git add src/lib/frameworks/prompts/landing-page-assembly/prompt.md src/lib/frameworks/registry.ts
git commit -m "feat: extract Landing Page Assembly framework into standalone prompt file"
```

---

## ✅ Task 2: Add Types for Chat Session, Conversation, and Stream Signals

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add new types at the end of the file**

Add at the end of `src/types/index.ts` (after the last existing type, around line 505 — the file is long, `PaintedDoorProgress` is in the middle, not the end):

```typescript
// Website Builder Chat Types

export type BuildMode = 'interactive' | 'autonomous';

export interface BuildStep {
  name: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  detail?: string;
  substeps?: { name: string; status: 'pending' | 'active' | 'complete' | 'error' }[];
}

export const WEBSITE_BUILD_STEPS: { name: string; checkpoint: boolean }[] = [
  { name: 'Extract Ingredients', checkpoint: true },
  { name: 'Design Brand Identity', checkpoint: false },
  { name: 'Write Hero', checkpoint: true },
  { name: 'Assemble Page', checkpoint: true },
  { name: 'Pressure Test', checkpoint: false },
  { name: 'Advisor Review', checkpoint: true },
  { name: 'Build & Deploy', checkpoint: false },
  { name: 'Verify', checkpoint: false },
];

export interface BuildSession {
  ideaId: string;
  mode: BuildMode;
  currentStep: number;
  steps: BuildStep[];
  artifacts: {
    ingredients?: string;
    brandIdentity?: string;
    heroContent?: string;
    pageContent?: string;
    pressureTestResults?: string;
    reviewResults?: string;
    siteUrl?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: {
    advisorConsultation?: { advisorId: string; advisorName: string; question: string };
    stepTransition?: { from: number; to: number };
  };
}

export type StreamEndSignal =
  | { action: 'checkpoint'; step: number; prompt: string }
  | { action: 'continue'; step: number }
  | { action: 'poll'; step: number; pollUrl: string }
  | { action: 'complete'; result: { siteUrl: string; repoUrl: string } };

export interface ChatRequestBody {
  type: 'mode_select' | 'user' | 'continue';
  mode?: BuildMode;
  content?: string;
  step?: number;
}
```

**Step 2: Run type check**

Run: `npm run build` (or `npx tsc --noEmit` if faster)

Verify no type errors introduced.

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add types for website builder chat session, messages, and stream signals"
```

---

## ✅ Task 3: Add Redis Storage for Build Sessions and Conversation History

**Files:**
- Modify: `src/lib/painted-door-db.ts`
- Create: `src/lib/__tests__/painted-door-chat-db.test.ts`

**Step 1: Write failing tests**

Create `src/lib/__tests__/painted-door-chat-db.test.ts`:

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
  saveBuildSession,
  getBuildSession,
  deleteBuildSession,
  saveConversationHistory,
  getConversationHistory,
  deleteConversationHistory,
} from '../painted-door-db';

describe('Build Session Storage', () => {
  beforeEach(() => vi.clearAllMocks());

  const session = {
    ideaId: 'idea-1',
    mode: 'interactive' as const,
    currentStep: 0,
    steps: [{ name: 'Extract Ingredients', status: 'pending' as const }],
    artifacts: {},
    createdAt: '2026-02-17T00:00:00Z',
    updatedAt: '2026-02-17T00:00:00Z',
  };

  it('saves build session with 4-hour TTL', async () => {
    await saveBuildSession('idea-1', session);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'build_session:idea-1',
      JSON.stringify(session),
      { ex: 14400 },
    );
  });

  it('retrieves build session', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(session));
    const result = await getBuildSession('idea-1');
    expect(result).toEqual(session);
  });

  it('returns null for missing session', async () => {
    mockRedis.get.mockResolvedValue(null);
    const result = await getBuildSession('missing');
    expect(result).toBeNull();
  });

  it('deletes build session', async () => {
    await deleteBuildSession('idea-1');
    expect(mockRedis.del).toHaveBeenCalledWith('build_session:idea-1');
  });

  it('handles Redis error on save', async () => {
    mockRedis.set.mockRejectedValue(new Error('Connection lost'));
    await expect(saveBuildSession('idea-1', session)).rejects.toThrow('Connection lost');
  });

  it('handles Redis error on get', async () => {
    mockRedis.get.mockRejectedValue(new Error('Connection lost'));
    await expect(getBuildSession('idea-1')).rejects.toThrow('Connection lost');
  });
});

describe('Conversation History Storage', () => {
  beforeEach(() => vi.clearAllMocks());

  const messages = [
    { role: 'assistant' as const, content: 'Hello', timestamp: '2026-02-17T00:00:00Z' },
    { role: 'user' as const, content: 'Hi', timestamp: '2026-02-17T00:01:00Z' },
  ];

  it('saves conversation history with 4-hour TTL', async () => {
    await saveConversationHistory('idea-1', messages);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'chat_history:idea-1',
      JSON.stringify(messages),
      { ex: 14400 },
    );
  });

  it('retrieves conversation history', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(messages));
    const result = await getConversationHistory('idea-1');
    expect(result).toEqual(messages);
  });

  it('returns empty array for missing history', async () => {
    mockRedis.get.mockResolvedValue(null);
    const result = await getConversationHistory('missing');
    expect(result).toEqual([]);
  });

  it('deletes conversation history', async () => {
    await deleteConversationHistory('idea-1');
    expect(mockRedis.del).toHaveBeenCalledWith('chat_history:idea-1');
  });

  it('handles Redis error on save', async () => {
    mockRedis.set.mockRejectedValue(new Error('Connection lost'));
    await expect(saveConversationHistory('idea-1', messages)).rejects.toThrow('Connection lost');
  });

  it('handles Redis error on get', async () => {
    mockRedis.get.mockRejectedValue(new Error('Connection lost'));
    await expect(getConversationHistory('idea-1')).rejects.toThrow('Connection lost');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/__tests__/painted-door-chat-db.test.ts`

Expected: FAIL — functions not exported from `painted-door-db.ts`.

**Step 3: Implement the storage functions**

Add to the end of `src/lib/painted-door-db.ts`:

```typescript
import type { BuildSession, ChatMessage } from '@/types';

// Build session storage — 4-hour TTL (longer than old progress, covers long builds)
const BUILD_SESSION_TTL = 14400;

export async function saveBuildSession(ideaId: string, session: BuildSession): Promise<void> {
  const r = getRedis();
  await r.set(`build_session:${ideaId}`, JSON.stringify(session), { ex: BUILD_SESSION_TTL });
}

export async function getBuildSession(ideaId: string): Promise<BuildSession | null> {
  const r = getRedis();
  const raw = await r.get(`build_session:${ideaId}`);
  return raw ? parseValue<BuildSession>(raw) : null;
}

export async function deleteBuildSession(ideaId: string): Promise<void> {
  const r = getRedis();
  await r.del(`build_session:${ideaId}`);
}

// Conversation history storage — 4-hour TTL
export async function saveConversationHistory(ideaId: string, messages: ChatMessage[]): Promise<void> {
  const r = getRedis();
  await r.set(`chat_history:${ideaId}`, JSON.stringify(messages), { ex: BUILD_SESSION_TTL });
}

export async function getConversationHistory(ideaId: string): Promise<ChatMessage[]> {
  const r = getRedis();
  const raw = await r.get(`chat_history:${ideaId}`);
  return raw ? parseValue<ChatMessage[]>(raw) : [];
}

export async function deleteConversationHistory(ideaId: string): Promise<void> {
  const r = getRedis();
  await r.del(`chat_history:${ideaId}`);
}
```

Note: `getRedis` and `parseValue` are already imported at the top of `painted-door-db.ts`.

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/lib/__tests__/painted-door-chat-db.test.ts`

Expected: All 12 tests PASS.

**Step 5: Run existing painted-door tests to check no regressions**

Run: `npm test -- --run`

Expected: All existing tests still pass.

**Step 6: Commit**

```bash
git add src/lib/painted-door-db.ts src/lib/__tests__/painted-door-chat-db.test.ts
git commit -m "feat: add Redis storage for build sessions and conversation history"
```

---

## ✅ Task 4: Build the `consult_advisor` Tool

**Files:**
- Create: `src/lib/agent-tools/website-chat.ts`
- Create: `src/lib/__tests__/consult-advisor.test.ts`

**Step 1: Write failing tests**

Create `src/lib/__tests__/consult-advisor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({ messages: { create: mockCreate } }),
}));

vi.mock('@/lib/config', () => ({
  CLAUDE_MODEL: 'claude-test-model',
}));

vi.mock('@/lib/advisors/prompt-loader', () => ({
  getAdvisorSystemPrompt: vi.fn((id: string) => {
    if (id === 'oli-gardner') return 'You are Oli Gardner, conversion expert.';
    if (id === 'unknown') throw new Error('Unknown advisor: unknown');
    return `You are ${id}.`;
  }),
}));

vi.mock('@/lib/db', () => ({
  getFoundationDoc: vi.fn().mockResolvedValue(null),
  // NOTE: getAllFoundationDocs returns Partial<Record<FoundationDocType, FoundationDocument>>, not an array
  getAllFoundationDocs: vi.fn().mockResolvedValue({}),
}));

import { createConsultAdvisorTool } from '../agent-tools/website-chat';

describe('consult_advisor tool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls Anthropic with advisor prompt and question', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Oli says: improve your CTA placement.' }],
    });

    const tool = createConsultAdvisorTool('idea-1');
    const result = await tool.execute({
      advisorId: 'oli-gardner',
      question: 'How should I place CTAs?',
      context: 'Current hero: "Build better products"',
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toContain('You are Oli Gardner');
    expect(callArgs.messages[0].content).toContain('How should I place CTAs?');
    expect(callArgs.messages[0].content).toContain('Current hero:');
    expect(result).toContain('Oli says: improve your CTA placement.');
  });

  it('returns error string for unknown advisor', async () => {
    const tool = createConsultAdvisorTool('idea-1');
    const result = await tool.execute({
      advisorId: 'unknown',
      question: 'test',
    });
    expect(result).toContain('Error');
    expect(result).toContain('unknown');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('handles Anthropic API failure gracefully', async () => {
    mockCreate.mockRejectedValue(new Error('Rate limit exceeded'));

    const tool = createConsultAdvisorTool('idea-1');
    const result = await tool.execute({
      advisorId: 'oli-gardner',
      question: 'test question',
    });

    expect(result).toContain('Error');
    expect(result).toContain('Rate limit');
  });

  it('includes foundation doc context when available', async () => {
    const { getAllFoundationDocs } = await import('@/lib/db');
    (getAllFoundationDocs as ReturnType<typeof vi.fn>).mockResolvedValue({
      positioning: { type: 'positioning', content: 'We are positioned as...', generatedAt: '2026-02-17' },
    });

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Based on your positioning...' }],
    });

    const tool = createConsultAdvisorTool('idea-1');
    await tool.execute({
      advisorId: 'oli-gardner',
      question: 'Review my hero section',
    });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('positioning');
    expect(callArgs.messages[0].content).toContain('We are positioned as...');
  });

  it('has correct tool definition schema', () => {
    const tool = createConsultAdvisorTool('idea-1');
    expect(tool.name).toBe('consult_advisor');
    expect(tool.input_schema.properties).toHaveProperty('advisorId');
    expect(tool.input_schema.properties).toHaveProperty('question');
    expect(tool.input_schema.required).toContain('advisorId');
    expect(tool.input_schema.required).toContain('question');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/__tests__/consult-advisor.test.ts`

Expected: FAIL — `createConsultAdvisorTool` doesn't exist.

**Step 3: Implement the tool**

Create `src/lib/agent-tools/website-chat.ts`:

**Important:** Use the canonical `ToolDefinition` from `@/types` — do NOT define a local interface. The canonical type has `execute: (input) => Promise<unknown>` and `input_schema: Record<string, unknown>`, which is what `createWebsiteTools` also uses.

```typescript
import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';
import { getAnthropic } from '@/lib/anthropic';
import { CLAUDE_MODEL } from '@/lib/config';
import { getAllFoundationDocs } from '@/lib/db';
import type { ToolDefinition } from '@/types';

export function createConsultAdvisorTool(ideaId: string): ToolDefinition {
  return {
    name: 'consult_advisor',
    description:
      'Consult a specialist advisor for their expert opinion on a specific question. ' +
      'Use this when a decision falls outside your core expertise. ' +
      'The advisor receives the question along with relevant foundation documents.',
    input_schema: {
      type: 'object',
      properties: {
        advisorId: {
          type: 'string',
          description: 'The advisor ID to consult (e.g. "oli-gardner", "shirin-oreizy", "joanna-wiebe")',
        },
        question: {
          type: 'string',
          description: 'The specific question to ask the advisor',
        },
        context: {
          type: 'string',
          description: 'Optional build context to include (e.g. current hero copy, brand identity)',
        },
      },
      required: ['advisorId', 'question'],
    },
    execute: async (input) => {
      const advisorId = input.advisorId as string;
      const question = input.question as string;
      const context = input.context as string | undefined;

      try {
        const advisorPrompt = getAdvisorSystemPrompt(advisorId);

        // Load foundation docs for context
        // NOTE: getAllFoundationDocs returns Partial<Record<FoundationDocType, FoundationDocument>>, not an array
        const foundationDocsRecord = await getAllFoundationDocs(ideaId);
        const foundationContext = Object.values(foundationDocsRecord)
          .filter((doc): doc is NonNullable<typeof doc> => doc !== null && doc !== undefined)
          .map((doc) => `## ${doc.type} (updated ${doc.editedAt || doc.generatedAt})\n${doc.content}`)
          .join('\n\n---\n\n');

        let userMessage = `Question: ${question}`;
        if (context) {
          userMessage += `\n\nBuild context:\n${context}`;
        }
        if (foundationContext) {
          userMessage += `\n\nFoundation documents for reference:\n${foundationContext}`;
        }

        const response = await getAnthropic().messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 2048,
          system: advisorPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });

        const text = response.content
          .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
          .map((block) => block.text)
          .join('\n');

        return text || '(No response from advisor)';
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error consulting advisor "${advisorId}": ${message}`;
      }
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/lib/__tests__/consult-advisor.test.ts`

Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/agent-tools/website-chat.ts src/lib/__tests__/consult-advisor.test.ts
git commit -m "feat: add consult_advisor tool for website builder chat agent"
```

---

## ✅ Task 5: Build the Chat API Route — System Prompt Assembly

**Files:**
- Create: `src/app/api/painted-door/[id]/chat/route.ts`
- Create: `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`

This is the core backend task. Split into sub-tasks for manageability. This task covers system prompt assembly and route scaffolding.

**Step 1: Write failing tests for system prompt assembly**

Create `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
const mockStream = {
  [Symbol.asyncIterator]: vi.fn(),
};

const mockMessagesStream = vi.fn().mockReturnValue(mockStream);

vi.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({ messages: { stream: mockMessagesStream } }),
}));

vi.mock('@/lib/config', () => ({
  CLAUDE_MODEL: 'claude-test-model',
}));

vi.mock('@/lib/advisors/prompt-loader', () => ({
  getAdvisorSystemPrompt: vi.fn().mockReturnValue('You are Julian Shapiro, The Growth Writer.'),
}));

vi.mock('@/lib/frameworks/framework-loader', () => ({
  getFrameworkPrompt: vi.fn().mockReturnValue('## Landing Page Assembly\nPhase 1: Extract...'),
}));

vi.mock('@/lib/db', () => ({
  getIdeaFromDb: vi.fn().mockResolvedValue({
    id: 'idea-1',
    name: 'Test Product',
    description: 'A test product',
    targetUser: 'developers',
    problemSolved: 'testing',
  }),
  // NOTE: getAllFoundationDocs returns Partial<Record<FoundationDocType, FoundationDocument>>, not an array
  getAllFoundationDocs: vi.fn().mockResolvedValue({
    strategy: { type: 'strategy', content: 'Strategy content', generatedAt: '2026-02-17' },
    positioning: { type: 'positioning', content: 'Positioning content', generatedAt: '2026-02-17' },
    'brand-voice': { type: 'brand-voice', content: 'Brand voice content', generatedAt: '2026-02-17' },
    'design-principles': { type: 'design-principles', content: 'Design principles content', generatedAt: '2026-02-17' },
    'seo-strategy': { type: 'seo-strategy', content: 'SEO strategy content', generatedAt: '2026-02-17' },
  }),
}));

vi.mock('@/lib/content-context', () => ({
  buildContentContext: vi.fn().mockResolvedValue({
    ideaName: 'Test Product',
    ideaDescription: 'A test product',
    targetUser: 'developers',
    problemSolved: 'testing',
    topKeywords: [{ keyword: 'testing tool', intentType: 'commercial' }],
    competitors: 'Competitor A, Competitor B',
  }),
}));

vi.mock('@/lib/painted-door-db', () => ({
  getBuildSession: vi.fn().mockResolvedValue(null),
  saveBuildSession: vi.fn(),
  getConversationHistory: vi.fn().mockResolvedValue([]),
  saveConversationHistory: vi.fn(),
  getPaintedDoorSite: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/advisors/registry', () => ({
  advisorRegistry: [
    { id: 'oli-gardner', name: 'Oli Gardner', role: 'critic', evaluationExpertise: 'Conversion' },
    { id: 'joanna-wiebe', name: 'Joanna Wiebe', role: 'critic', evaluationExpertise: 'Copy' },
    { id: 'shirin-oreizy', name: 'Shirin Oreizy', role: 'critic', evaluationExpertise: 'Behavioral' },
  ],
}));

// Import after mocks
import { assembleSystemPrompt } from '../route';

describe('assembleSystemPrompt', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes Julian Shapiro advisor prompt', async () => {
    const prompt = await assembleSystemPrompt('idea-1', 'interactive');
    expect(prompt).toContain('Julian Shapiro');
  });

  it('includes Landing Page Assembly framework', async () => {
    const prompt = await assembleSystemPrompt('idea-1', 'interactive');
    expect(prompt).toContain('Landing Page Assembly');
  });

  it('includes all foundation documents', async () => {
    const prompt = await assembleSystemPrompt('idea-1', 'interactive');
    expect(prompt).toContain('Strategy content');
    expect(prompt).toContain('Positioning content');
    expect(prompt).toContain('Brand voice content');
    expect(prompt).toContain('Design principles content');
    expect(prompt).toContain('SEO strategy content');
  });

  it('includes idea analysis context', async () => {
    const prompt = await assembleSystemPrompt('idea-1', 'interactive');
    expect(prompt).toContain('Test Product');
    expect(prompt).toContain('developers');
  });

  it('includes mode instruction for interactive', async () => {
    const prompt = await assembleSystemPrompt('idea-1', 'interactive');
    expect(prompt).toContain('checkpoint');
    expect(prompt).toContain('pause');
  });

  it('includes mode instruction for autonomous', async () => {
    const prompt = await assembleSystemPrompt('idea-1', 'autonomous');
    expect(prompt).not.toContain('pause');
    expect(prompt).toContain('narrat');
  });

  it('includes available advisor roster', async () => {
    const prompt = await assembleSystemPrompt('idea-1', 'interactive');
    expect(prompt).toContain('oli-gardner');
    expect(prompt).toContain('Conversion');
  });

  it('degrades gracefully when foundation docs are missing', async () => {
    const { getAllFoundationDocs } = await import('@/lib/db');
    (getAllFoundationDocs as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const prompt = await assembleSystemPrompt('idea-1', 'interactive');
    expect(prompt).toContain('Julian Shapiro');
    // Should note what's missing
    expect(prompt).toContain('No foundation documents');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`

Expected: FAIL — module doesn't exist.

**Step 3: Implement system prompt assembly**

Create `src/app/api/painted-door/[id]/chat/route.ts`:

```typescript
import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';
import { advisorRegistry } from '@/lib/advisors/registry';
import { getAnthropic } from '@/lib/anthropic';
import { CLAUDE_MODEL } from '@/lib/config';
import { buildContentContext } from '@/lib/content-context';
import { getAllFoundationDocs, getIdeaFromDb } from '@/lib/db';
import { getFrameworkPrompt } from '@/lib/frameworks/framework-loader';
import {
  getBuildSession,
  getConversationHistory,
  getPaintedDoorSite,
  saveBuildSession,
  saveConversationHistory,
} from '@/lib/painted-door-db';
import type { BuildMode, BuildSession, BuildStep, ChatMessage, ChatRequestBody, StreamEndSignal } from '@/types';
import { WEBSITE_BUILD_STEPS } from '@/types'; // runtime value, NOT a type — must use value import

export const maxDuration = 300;

export async function assembleSystemPrompt(
  ideaId: string,
  mode: BuildMode,
): Promise<string> {
  // 1. Julian's advisor prompt
  const advisorPrompt = getAdvisorSystemPrompt('julian-shapiro');

  // 2. Landing Page Assembly framework
  const framework = getFrameworkPrompt('landing-page-assembly');

  // 3. Foundation documents
  // NOTE: getAllFoundationDocs returns Partial<Record<FoundationDocType, FoundationDocument>>, not an array
  const foundationDocsRecord = await getAllFoundationDocs(ideaId);
  const nonNullDocs = Object.values(foundationDocsRecord).filter(
    (d): d is NonNullable<typeof d> => d !== null && d !== undefined
  );

  let foundationSection: string;
  if (nonNullDocs.length === 0) {
    foundationSection = 'No foundation documents are available yet. Note which documents would be helpful and proceed with the information you have.';
  } else {
    foundationSection = nonNullDocs
      .map((doc) => `### ${doc.type} (updated ${doc.editedAt || doc.generatedAt})\n${doc.content}`)
      .join('\n\n');
  }

  // 4. Idea analysis / content context
  const ctx = await buildContentContext(ideaId);
  const idea = await getIdeaFromDb(ideaId);
  let ideaSection = '';
  if (idea) {
    ideaSection = `### Product\n- **Name:** ${idea.name}\n- **Description:** ${idea.description}\n- **Target User:** ${idea.targetUser}\n- **Problem Solved:** ${idea.problemSolved}`;
    if (idea.url) ideaSection += `\n- **URL:** ${idea.url}`;
  }
  if (ctx) {
    ideaSection += `\n\n### Keywords\n${ctx.topKeywords.map((k) => `- ${k.keyword} (${k.intentType})`).join('\n')}`;
    ideaSection += `\n\n### Competitors\n${ctx.competitors}`;
  }

  // 5. Current site state (for regeneration)
  const existingSite = await getPaintedDoorSite(ideaId);
  let siteSection = '';
  if (existingSite?.status === 'live') {
    siteSection = `\n\n## Existing Site\nThis is a REBUILD. An existing site is live at ${existingSite.siteUrl}.\nReview what exists and propose targeted changes vs. a full rebuild where appropriate.`;
  }

  // 6. Mode instruction
  const modeInstruction = mode === 'interactive'
    ? `## Mode: Interactive ("Build with me")
You are in interactive mode. At the end of steps 1 (Extract Ingredients), 3 (Write Hero), 4 (Assemble Page), and 6 (Advisor Review), you MUST pause and present your work for user feedback before continuing. At each checkpoint, summarize what you've done and ask for the user's input.

When you finish a checkpoint step, end your message by describing what you've completed and what you'd like feedback on.`
    : `## Mode: Autonomous ("You've got this")
You are in autonomous mode. Run through all 8 steps without pausing. Narrate your progress as you go — the user is watching the chat in real time. Do not wait for user input between steps.`;

  // 7. Advisor roster
  const advisorsWithExpertise = advisorRegistry.filter((a) => a.evaluationExpertise);
  const advisorRoster = advisorsWithExpertise
    .map((a) => `- **${a.id}** (${a.name}): ${a.evaluationExpertise}`)
    .join('\n');

  return `${advisorPrompt}

${framework ? `## FRAMEWORK\n${framework}\n` : ''}
---

## Your Task

You are building a landing page for a product. Follow your Landing Page Assembly framework through all 8 steps. Use the foundation documents below as your source of truth — never contradict what's already decided. Fill gaps where docs don't specify exact values.

${modeInstruction}

## Foundation Documents
${foundationSection}

## Product & Analysis
${ideaSection}
${siteSection}

## Available Advisors for Consultation
Use the consult_advisor tool when a decision falls outside your core expertise.
${advisorRoster}

## Build Tools
You have access to all website build tools (design_brand, assemble_site_files, create_repo, push_files, etc.) plus consult_advisor. Use them when you reach the appropriate step.

## Output
Respond conversationally — this is a chat, not a report. When you use a tool, explain what you're doing and why. When consulting an advisor, share their key insights with the user.`;
}

// POST handler and streaming logic will be added in the next task
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`

Expected: All 8 tests PASS.

**Step 5: Commit**

```bash
git add src/app/api/painted-door/[id]/chat/route.ts src/app/api/painted-door/[id]/chat/__tests__/route.test.ts
git commit -m "feat: implement system prompt assembly for website builder chat API"
```

---

## ✅ Task 6: Build the Chat API Route — Streaming Agent Loop

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/route.ts`
- Modify: `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`

This task adds the POST handler with the streaming agent loop: receiving messages, running the agent loop with tool execution, streaming narration to the client, and emitting stream end signals.

**Step 1: Add tests for the POST handler**

Append to `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`:

```typescript
import { POST } from '../route';

// Helper to read a streaming response to completion
async function readStream(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

describe('POST /api/painted-door/[id]/chat', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 for missing type field', async () => {
    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    expect(response.status).toBe(400);
  });

  it('returns 404 for unknown idea', async () => {
    const { getIdeaFromDb } = await import('@/lib/db');
    (getIdeaFromDb as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'mode_select', mode: 'interactive' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    expect(response.status).toBe(404);
  });

  it('creates build session on mode_select', async () => {
    // Restore idea mock
    const { getIdeaFromDb } = await import('@/lib/db');
    (getIdeaFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'idea-1', name: 'Test', description: 'Test', targetUser: 'devs', problemSolved: 'testing',
    });

    // Mock streaming to immediately close
    const events = (async function* () {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello!' } };
    })();
    mockMessagesStream.mockReturnValue({ [Symbol.asyncIterator]: () => events });

    const { saveBuildSession } = await import('@/lib/painted-door-db');

    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'mode_select', mode: 'interactive' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(saveBuildSession).toHaveBeenCalled();
  });

  it('returns 400 for mode_select without mode', async () => {
    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'mode_select' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    expect(response.status).toBe(400);
  });

  it('handles request body parse failure', async () => {
    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    expect(response.status).toBe(400);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`

Expected: FAIL — POST not exported.

**Step 3: Implement the POST handler**

Add to `src/app/api/painted-door/[id]/chat/route.ts` (after the `assembleSystemPrompt` function):

```typescript
import { NextRequest } from 'next/server';
import { createWebsiteTools } from '@/lib/agent-tools/website';
import { createConsultAdvisorTool } from '@/lib/agent-tools/website-chat';
import { WEBSITE_BUILD_STEPS } from '@/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: ideaId } = await params;

  // Parse request body
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.type) {
    return Response.json({ error: 'Missing type field' }, { status: 400 });
  }

  // Validate idea exists
  const idea = await getIdeaFromDb(ideaId);
  if (!idea) {
    return Response.json({ error: 'Idea not found' }, { status: 404 });
  }

  // Handle mode selection — initialize session
  if (body.type === 'mode_select') {
    if (!body.mode) {
      return Response.json({ error: 'Missing mode for mode_select' }, { status: 400 });
    }

    const session: BuildSession = {
      ideaId,
      mode: body.mode,
      currentStep: 0,
      steps: WEBSITE_BUILD_STEPS.map((s) => ({
        name: s.name,
        status: 'pending' as const,
      })),
      artifacts: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveBuildSession(ideaId, session);
    await saveConversationHistory(ideaId, []);
  }

  // Load or verify session exists
  const session = await getBuildSession(ideaId);
  if (!session) {
    return Response.json({ error: 'No build session found. Start with mode_select.' }, { status: 400 });
  }

  // Build conversation messages
  const history = await getConversationHistory(ideaId);

  // Add new user message to history
  if (body.type === 'user' && body.content) {
    history.push({
      role: 'user',
      content: body.content,
      timestamp: new Date().toISOString(),
    });
  } else if (body.type === 'mode_select') {
    history.push({
      role: 'user',
      content: `I choose "${session.mode === 'interactive' ? 'Build with me' : "You've got this"}" mode. Let's begin!`,
      timestamp: new Date().toISOString(),
    });
  } else if (body.type === 'continue') {
    history.push({
      role: 'user',
      content: `Continue to the next step (step ${(body.step ?? session.currentStep) + 1}).`,
      timestamp: new Date().toISOString(),
    });
  }

  // Assemble system prompt
  const systemPrompt = await assembleSystemPrompt(ideaId, session.mode);

  // Convert history to Anthropic message format (last 40 messages to stay within context)
  const anthropicMessages = history.slice(-40).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // Create tools array: existing 16 website tools + consult_advisor
  const websiteTools = createWebsiteTools(ideaId);
  const consultTool = createConsultAdvisorTool(ideaId);
  const allTools = [...websiteTools, consultTool];

  // Convert tools to Anthropic tool format
  const anthropicTools = allTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  // Stream the agent loop
  const stream = getAnthropic().messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: anthropicMessages,
    tools: anthropicTools,
  });

  // For the initial streaming response, we stream text deltas to the client.
  // Tool calls are handled in the agent loop — when a tool_use block is detected,
  // we execute it server-side and continue the loop.
  // This first pass streams only the text content. Full agent loop with tool execution
  // will be implemented in the next iteration.
  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let assistantText = '';

        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(event.delta.text));
              assistantText += event.delta.text;
            }
          }

          // Save assistant message to history
          if (assistantText) {
            history.push({
              role: 'assistant',
              content: assistantText,
              timestamp: new Date().toISOString(),
            });
            await saveConversationHistory(ideaId, history);
          }

          // Update session
          session.updatedAt = new Date().toISOString();
          await saveBuildSession(ideaId, session);

          controller.close();
        } catch (error) {
          console.error('[chat] Stream error:', error);
          controller.error(error);
        }
      },
    }),
    {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    },
  );
}
```

Note: This is the initial scaffolding. The full agent loop with tool execution and stream end signals will be implemented in Task 7. This task establishes the streaming pattern and request handling.

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/app/api/painted-door/[id]/chat/route.ts src/app/api/painted-door/[id]/chat/__tests__/route.test.ts
git commit -m "feat: add POST handler with streaming for website builder chat API"
```

---

## ✅ Task 7: Implement Agent Loop with Tool Execution and Stream End Signals

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/route.ts`
- Modify: `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`

This task replaces the simple streaming pass-through with a full agent loop that executes tool calls server-side and emits stream end signals.

**Step 1: Add tests for agent loop behavior**

Append to test file:

```typescript
describe('Agent loop with tool execution', () => {
  beforeEach(() => vi.clearAllMocks());

  it('appends stream end signal as final JSON line', async () => {
    // Restore default mocks
    const { getIdeaFromDb } = await import('@/lib/db');
    (getIdeaFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'idea-1', name: 'Test', description: 'Test', targetUser: 'devs', problemSolved: 'testing',
    });

    const { getBuildSession } = await import('@/lib/painted-door-db');
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ideaId: 'idea-1',
      mode: 'interactive',
      currentStep: 0,
      steps: [{ name: 'Extract Ingredients', status: 'active' }],
      artifacts: {},
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });

    const events = (async function* () {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Work done.' } };
    })();
    mockMessagesStream.mockReturnValue({ [Symbol.asyncIterator]: () => events });

    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'user', content: 'Looks good, continue' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    const text = await readStream(response);

    // Should contain the text content
    expect(text).toContain('Work done.');
    // Should end with a JSON signal line
    const lastLine = text.trim().split('\n').pop()!;
    // Signal is appended as \n__SIGNAL__:{json}
    if (lastLine.startsWith('__SIGNAL__:')) {
      const signal = JSON.parse(lastLine.replace('__SIGNAL__:', ''));
      expect(signal).toHaveProperty('action');
    }
  });
});
```

**Step 2: Run tests to verify failing**

Run: `npm test -- --run src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`

**Step 3: Refactor the streaming response to include agent loop**

Replace the `ReadableStream` section of the POST handler with the full agent loop. The agent loop alternates between streaming text responses and non-streaming tool execution rounds.

Extract a helper function `runAgentStream` that encapsulates the loop:

```typescript
async function runAgentStream(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string | Anthropic.ContentBlock[] }[],
  tools: ToolDefinition[],
  session: BuildSession,
  ideaId: string,
  history: ChatMessage[],
): Promise<void> {
  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  const MAX_TOOL_ROUNDS = 15;
  let currentMessages = [...messages];
  let assistantText = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Stream the text response to the client
    const stream = getAnthropic().messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: currentMessages,
      tools: anthropicTools,
    });

    // Collect full response (text + tool_use blocks)
    const contentBlocks: Anthropic.ContentBlock[] = [];
    let roundText = '';

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        controller.enqueue(encoder.encode(event.delta.text));
        roundText += event.delta.text;
      }
      // Collect content blocks from the message event
      if (event.type === 'message_delta') {
        // stop_reason available here
      }
    }

    // Get the full message to check for tool_use blocks
    const finalMessage = await stream.finalMessage();
    assistantText += roundText;

    // Check for tool calls
    const toolUseBlocks = finalMessage.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (toolUseBlocks.length === 0) {
      // No tool calls — agent is done for this request
      break;
    }

    // Execute tool calls in parallel (matching agent-runtime.ts pattern)
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (toolCall) => {
        const tool = tools.find((t) => t.name === toolCall.name);
        if (!tool) {
          return {
            type: 'tool_result' as const,
            tool_use_id: toolCall.id,
            content: `Error: Unknown tool "${toolCall.name}"`,
            is_error: true,
          };
        }
        try {
          const result = await tool.execute(toolCall.input as Record<string, unknown>);
          // All tool results must be stringified for Anthropic's tool_result content
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
          return {
            type: 'tool_result' as const,
            tool_use_id: toolCall.id,
            content: resultStr,
          };
        } catch (error) {
          return {
            type: 'tool_result' as const,
            tool_use_id: toolCall.id,
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            is_error: true,
          };
        }
      }),
    );

    // Add assistant message + tool results to conversation for next round
    currentMessages = [
      ...currentMessages,
      { role: 'assistant' as const, content: finalMessage.content },
      { role: 'user' as const, content: toolResults },
    ];
  }

  // Save assistant text to history
  if (assistantText) {
    history.push({
      role: 'assistant',
      content: assistantText,
      timestamp: new Date().toISOString(),
    });
    await saveConversationHistory(ideaId, history);
  }

  // Determine and emit stream end signal
  const signal = determineStreamEndSignal(session);
  controller.enqueue(encoder.encode(`\n__SIGNAL__:${JSON.stringify(signal)}`));

  session.updatedAt = new Date().toISOString();
  await saveBuildSession(ideaId, session);
  controller.close();
}

function determineStreamEndSignal(session: BuildSession): StreamEndSignal {
  const stepConfig = WEBSITE_BUILD_STEPS[session.currentStep];

  // Build complete
  if (session.currentStep >= WEBSITE_BUILD_STEPS.length - 1 &&
      session.steps[session.currentStep]?.status === 'complete') {
    return {
      action: 'complete',
      result: {
        siteUrl: session.artifacts.siteUrl || '',
        repoUrl: '',
      },
    };
  }

  // Deploy step — use polling
  if (session.currentStep === 6) { // Build & Deploy
    return {
      action: 'poll',
      step: session.currentStep,
      pollUrl: `/api/painted-door/${session.ideaId}`,
    };
  }

  // Checkpoint in interactive mode
  if (session.mode === 'interactive' && stepConfig?.checkpoint) {
    return {
      action: 'checkpoint',
      step: session.currentStep,
      prompt: `Step ${session.currentStep + 1} complete. Review and provide feedback, or say "continue" to proceed.`,
    };
  }

  // Auto-continue
  return { action: 'continue', step: session.currentStep };
}
```

Then update the POST handler's streaming section to call `runAgentStream`.

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`

**Step 5: Run full test suite**

Run: `npm test -- --run`

**Step 6: Commit**

```bash
git add src/app/api/painted-door/[id]/chat/route.ts src/app/api/painted-door/[id]/chat/__tests__/route.test.ts
git commit -m "feat: implement agent loop with tool execution and stream end signals"
```

---

## ✅ Task 8: Extract Shared Critique Service

**Files:**
- Modify: `src/lib/agent-tools/critique.ts`
- Create: `src/lib/critique-service.ts`
- Modify: `src/lib/__tests__/critique-tools.test.ts`

The design doc says to extract critique tools into a shared service so both `content-critique-agent.ts` and the website builder can use them. The current implementation has these tools tightly coupled to the closure state of `createCritiqueTools` in `src/lib/agent-tools/critique.ts`.

**Note — design doc drift:** The design doc names `content-critique-agent.ts` as the file to modify. The actual implementation to extract is in `agent-tools/critique.ts`, which holds the tool definitions and `runSingleCritic`. The agent file (`content-critique-agent.ts`) orchestrates the agent loop but doesn't own the critique logic.

**Step 1: Identify the shared interface**

Read `src/lib/agent-tools/critique.ts` to understand what state the tools need. Key shared pieces:
- `runSingleCritic(advisor, draft, recipe, ideaId)` (line 57) — runs one critic LLM call, stateless
- `applyEditorRubric(critiques, minAggregateScore, previousAvgScore)` — from `editor-decision.ts`, stateless

**Closure state that MUST stay in `createCritiqueTools`** (not extracted):
- `previousAvgScore` — used by oscillation guard, per-agent-run state
- `previousRoundCritiques` — used by `findFixedItems` for do-not-regress list
- `accumulatedFixedItems`, `accumulatedWellScored` — accumulate across rounds
- `selectedCritics` — cached after first selection

The shared service extracts only the stateless functions. The critique tools continue to manage their closure state internally but delegate the actual LLM calls and rubric application to the shared service.

The website builder needs to:
1. Invoke critique with the website recipe's 4 named critics
2. Get structured results (per-critic scores, issues, verdicts)
3. Apply editor rubric for approve/revise decision

**Step 2: Create the shared service**

Create `src/lib/critique-service.ts` that exports:

```typescript
export interface CritiqueResult {
  advisorId: string;
  advisorName: string;
  score: number;
  pass: boolean;
  issues: { severity: string; description: string }[];
  strengths: string[];
  error?: string;
}

export interface CritiqueRoundResult {
  critiques: CritiqueResult[];
  avgScore: number;
  decision: 'approve' | 'revise';
  brief: string;
}

export async function runCritiqueRound(
  draft: string,
  recipeKey: string,
  ideaId: string,
  previousAvgScore?: number,
): Promise<CritiqueRoundResult>
```

This function:
1. Loads the recipe from `content-recipes.ts`
2. Resolves named critics from the advisor registry
3. Runs critics with `pLimit(2)` via `Promise.allSettled`
4. Applies `applyEditorRubric` from `editor-decision.ts`
5. Returns structured results

Extract `runSingleCritic` from `critique.ts` into the shared service as a private function.

**Step 3: Update critique.ts to use the shared service**

The `run_critiques` and `editor_decision` tools in `critique.ts` should delegate to the shared service instead of implementing the logic inline. This preserves backward compatibility — the tools still work the same way, they just call through to the shared service.

**Step 4: Write tests for the shared service**

Test file: `src/lib/__tests__/critique-service.test.ts`

Key scenarios:
- Runs all named critics for the website recipe
- Returns structured results with scores and issues
- Handles individual critic failures gracefully (Promise.allSettled)
- Applies editor rubric correctly
- Oscillation guard works (previousAvgScore > current → approve)
- Error when recipe not found
- Error when all critics fail (should still return a result with score 0)

**Step 5: Run all critique-related tests**

Run: `npm test -- --run src/lib/__tests__/critique`

Verify: All existing critique tests still pass, plus new service tests.

**Step 6: Commit**

```bash
git add src/lib/critique-service.ts src/lib/agent-tools/critique.ts src/lib/__tests__/critique-service.test.ts src/lib/__tests__/critique-tools.test.ts
git commit -m "refactor: extract shared critique service for use by website builder and critique agent"
```

---

## ✅ Task 9: Build the Chat UI Page — Mode Selection

**Files:**
- Create: `src/app/website/[id]/build/page.tsx`

Reference mockups: `docs/mockups/website-builder-chat/mode-selection.html` and `docs/mockups/website-builder-chat/layout.html`

**Step 1: Create the build page with mode selection**

Create `src/app/website/[id]/build/page.tsx` as a `'use client'` page.

The initial state shows Julian's introduction message and two mode selection cards:

```
+-----------------------------------------------------------+
|  <- Back to Sites          [Idea Name] Site Builder        |
+-----------------------------------------------------------+
|                                                            |
|  Julian's avatar + intro message:                          |
|  "I've reviewed your foundation documents..."              |
|                                                            |
|  Two mode cards side-by-side:                              |
|  [Build with me]    [You've got this]                      |
|  Interactive ~30min  Autonomous ~5min                       |
|                                                            |
|  Step preview pills:                                       |
|  Extract → Brand → Hero → Assemble → Test → Review →      |
|  Deploy → Verify                                           |
+-----------------------------------------------------------+
```

Key implementation details:
- Fetch idea name on mount via `GET /api/ideas` or extract from URL params
- Mode selection sends `POST /api/painted-door/{id}/chat` with `{ type: 'mode_select', mode: '...' }`
- After mode selection, transition to the chat layout (Task 10)
- Use Tailwind for styling — match the mockup's warm cream background `#FAF9F7`, coral accent `#ff6b5b`
- Back button links to `/website/${ideaId}`

State management:
```typescript
const [mode, setMode] = useState<BuildMode | null>(null);
const [ideaName, setIdeaName] = useState('');
const [loading, setLoading] = useState(true);
```

**Step 2: Verify the page renders**

Run: `npm run build`

The build should succeed with the new page.

**Step 3: Commit**

```bash
git add src/app/website/[id]/build/page.tsx
git commit -m "feat: add website builder build page with mode selection"
```

---

## ✅ Task 10: Build the Chat UI Page — Chat Panel and Progress Sidebar

**Files:**
- Modify: `src/app/website/[id]/build/page.tsx`

Reference mockups: `docs/mockups/website-builder-chat/layout.html` and `docs/mockups/website-builder-chat/advisor-review.html`

**Step 1: Implement the chat panel**

After mode selection, the page transitions to the two-column layout:
- **Left (75%):** Scrollable chat message list with input at the bottom
- **Right (25%):** Progress sidebar with 8 steps

Chat panel implementation:
- Messages array in state: `ChatMessage[]`
- Each message renders differently based on role:
  - `assistant`: white card bubble, left-aligned
  - `user`: coral gradient bubble, right-aligned
- Auto-scroll to bottom on new messages
- Input textarea with send button
- Status line showing current step info

Streaming implementation:
- On send: POST to `/api/painted-door/${ideaId}/chat`
- Read the streaming response using `ReadableStream` + `TextDecoder`
- Append text chunks to the current assistant message in real-time
- When stream ends, check for `__SIGNAL__:{json}` in the final content
- Parse the signal and update client state machine accordingly

Client state machine:
```typescript
type ClientState = 'mode_select' | 'streaming' | 'waiting_for_user' | 'polling' | 'done';
```

- `streaming`: disable input, show typing indicator
- `waiting_for_user`: enable input (checkpoint reached)
- `polling`: show "Deploying..." indicator, poll `GET /api/painted-door/${ideaId}` every 3s
- `done`: show completion card with site URL

**Step 2: Implement the progress sidebar**

8 steps with status indicators:
- `pending`: numbered grey circle
- `active`: coral spinner with glow animation
- `complete`: emerald checkmark
- `error`: red X

Step 7 (Build & Deploy) expands to show infrastructure substeps when active.

Progress bar at top showing percentage complete.

**Step 3: Implement advisor consultation cards**

When the assistant message contains advisor consultation results, render them as visually distinct inline cards:
- Colored left border (different color per advisor)
- Advisor name and domain
- Quote/response text
- These appear in-line within the chat flow

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Commit**

```bash
git add src/app/website/[id]/build/page.tsx
git commit -m "feat: implement chat panel with streaming and progress sidebar"
```

---

## ✅ Task 11: Build the Chat UI Page — Auto-Continuation and Polling

**Files:**
- Modify: `src/app/website/[id]/build/page.tsx`

**Step 1: Implement signal handling**

When a stream ends with a signal, the client acts based on the signal type:

```typescript
function handleSignal(signal: StreamEndSignal) {
  switch (signal.action) {
    case 'checkpoint':
      setClientState('waiting_for_user');
      // Input enabled, show checkpoint prompt hint
      break;
    case 'continue':
      // Auto-send continuation
      sendMessage({ type: 'continue', step: signal.step });
      break;
    case 'poll':
      setClientState('polling');
      startPolling(signal.pollUrl);
      break;
    case 'complete':
      setClientState('done');
      setSiteResult(signal.result);
      break;
  }
}
```

**Step 2: Implement polling for deploy**

```typescript
function startPolling(pollUrl: string) {
  pollRef.current = setInterval(async () => {
    const res = await fetch(pollUrl);
    const data = await res.json();
    if (data.status === 'complete' || data.status === 'error') {
      clearInterval(pollRef.current!);
      if (data.status === 'complete') {
        sendMessage({ type: 'continue', step: session.currentStep });
      } else {
        setClientState('waiting_for_user');
      }
    }
  }, 3000);
}
```

Clean up interval on unmount.

**Step 3: Implement resumability**

On page load, check for existing session:
- `GET /api/painted-door/${ideaId}/chat/session` (or load from existing build session endpoint)
- If session exists: load conversation history, set correct client state, show progress
- If no session: show mode selection

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Commit**

```bash
git add src/app/website/[id]/build/page.tsx
git commit -m "feat: implement auto-continuation, polling, and session resumability"
```

---

## ✅ Task 12: Update Website Detail Page with Build/Rebuild Buttons

**Files:**
- Modify: `src/app/website/[id]/page.tsx`

**Step 1: Read the current page**

Read `src/app/website/[id]/page.tsx` to understand the current auto-trigger behavior and UI.

**Step 2: Remove auto-trigger behavior**

> **Behavior change:** `/website/[id]` no longer auto-starts site generation on page load. Users must explicitly click "Build Site" to begin. Any bookmarked flows or external links that relied on auto-trigger will now show a static page with a button instead.

The current `useEffect` (lines 77-114) automatically POSTs to trigger generation when `status === 'not_started'`. Remove this auto-trigger logic. The page should just display status without auto-starting anything.

**Step 3: Add Build/Rebuild buttons**

Replace the auto-trigger with explicit navigation buttons:

- **New site (not started):** Show a "Build Site" button that navigates to `/website/${ideaId}/build`
- **Existing live site:** Show a "Rebuild Site" button that navigates to `/website/${ideaId}/build`
- **Currently building (has active session):** Show a "Continue Building" button that navigates to `/website/${ideaId}/build`

Keep the existing progress display for backward compatibility with in-progress old-style builds.

**Step 4: Keep existing functionality**

Preserve:
- The progress step display (for legacy in-progress builds)
- Brand identity preview
- Completion card with site URL and signup count
- Polling for status updates (for legacy builds)

**Step 5: Verify build**

Run: `npm run build`

**Step 6: Commit**

```bash
git add src/app/website/[id]/page.tsx
git commit -m "feat: replace auto-trigger with Build/Rebuild navigation buttons"
```

---

## ✅ Task 13: Update Painted Door API Route for Chat Integration

**Files:**
- Modify: `src/app/api/painted-door/[id]/route.ts`

**Step 1: Read the current route**

Read `src/app/api/painted-door/[id]/route.ts`.

**Step 2: Keep existing POST for backward compatibility but update for chat flow**

The existing POST handler triggers `runPaintedDoorAgentAuto` via `after()`. For the chat-driven flow, the chat route (`/api/painted-door/[id]/chat`) handles the agent loop. The existing route should:

- Keep the GET handler for polling (used by both old and new flows)
- Keep the PATCH handler for repairs
- Keep the PUT handler for file updates
- Keep the DELETE handler for teardown

The POST handler can stay as-is for now — it's the fallback for any non-chat-driven builds. The chat route is the new entry point.

**Step 3: Add a GET endpoint for build session status**

Add to the GET handler: if a `build_session` exists in Redis, include it in the response so the detail page can show "Continue Building" when appropriate.

```typescript
// In the GET handler, after existing logic:
const buildSession = await getBuildSession(id);
if (buildSession) {
  return Response.json({
    ...existingResponse,
    buildSession: {
      mode: buildSession.mode,
      currentStep: buildSession.currentStep,
      steps: buildSession.steps,
    },
  });
}
```

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Run existing tests**

Run: `npm test -- --run`

**Step 6: Commit**

```bash
git add src/app/api/painted-door/[id]/route.ts
git commit -m "feat: update painted-door API route with build session status"
```

---

## ✅ Task 14: Update `buildBrandIdentityPrompt` to Use Foundation Docs

**Files:**
- Modify: `src/lib/painted-door-prompts.ts`

**Step 1: Read the current implementation**

Read `src/lib/painted-door-prompts.ts`. The current `buildBrandIdentityPrompt` generates brand identity from scratch using only idea analysis and SEO context. It ignores foundation documents entirely.

**Step 2: Add foundation document parameters**

Update the function signature to accept foundation documents:

```typescript
export function buildBrandIdentityPrompt(
  idea: ProductIdea,
  ctx: ContentContext,
  visualOnly = false,
  foundationDocs?: { type: string; content: string }[],
): string
```

When `foundationDocs` is provided, inject their content into the prompt with instructions to derive brand identity from them:

- Colors from `design-principles`
- Copy tone from `brand-voice`
- Keywords from `seo-strategy`
- Value prop from `positioning`
- Target audience from `strategy`

Add a section like:

```
## Foundation Documents (Source of Truth)
These strategic documents have already been finalized. Derive the brand identity from them.
Do not contradict any decisions made in these documents.

${foundationDocs.map(d => `### ${d.type}\n${d.content}`).join('\n\n')}
```

When `foundationDocs` is not provided (backward compatibility), the prompt works as before.

**Step 3: Verify existing tests**

Run: `npm test -- --run`

The change is backward-compatible (optional parameter with default). Existing callers that don't pass foundation docs continue to work.

**Step 4: Commit**

```bash
git add src/lib/painted-door-prompts.ts
git commit -m "feat: update buildBrandIdentityPrompt to accept and use foundation documents"
```

---

## ✅ Task 15: Remove Dead Code — V2 Agent and Auto-Switcher

**Files:**
- Modify: `src/lib/painted-door-agent.ts`

**Step 1: Read the file**

Read `src/lib/painted-door-agent.ts` fully.

**Step 2: Remove dead code**

The design doc specifies removing:
- `runPaintedDoorAgentV2` (lines ~393-543) — the AGENT_V2 agentic pipeline, never used in production
- `runPaintedDoorAgentAuto` (lines ~549-554) — the env var switcher

Keep `runPaintedDoorAgent` (V1, lines ~148-320) for now — it's the fallback used by the existing POST route. The chat-driven flow replaces it, but the V1 pipeline should remain until the chat flow is verified in production.

After removal:
- Update the existing `POST` handler in `src/app/api/painted-door/[id]/route.ts` to call `runPaintedDoorAgent` directly instead of `runPaintedDoorAgentAuto`
- Remove the `TOOL_TO_STEP` mapping and other V2-only code
- Remove unused imports (e.g., `runAgent`, `resumeAgent`, `getActiveRunId` if only used by V2)

**Step 3: Verify build and tests**

Run: `npm run build && npm test -- --run`

**Step 4: Commit**

```bash
git add src/lib/painted-door-agent.ts src/app/api/painted-door/[id]/route.ts
git commit -m "refactor: remove dead V2 agent code and auto-switcher from painted-door-agent"
```

---

## ✅ Task 16: Integration Testing — Full Chat Flow and API Route Tests

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`
- Create: `src/app/api/painted-door/[id]/__tests__/route.test.ts`

**Step 1: Add integration-level tests for the chat route**

Add tests that verify the full flow. **These are skeleton descriptions — implement full test bodies with mocks, assertions, and error paths for each:**

- `mode_select creates session and streams Julian intro` — POST with `{ type: 'mode_select', mode: 'interactive' }`, verify session created in Redis, first message streamed, history saved
- `user message appends to history and streams response` — setup existing session + history, send user message, verify message added to history, response streamed
- `continue message resumes agent at correct step` — setup session at step 1, send continue, verify step advances
- `conversation history persists across requests` — verify messages accumulate correctly across multiple requests
- `handles Redis failure during stream gracefully` — mock Redis to fail on `saveConversationHistory`, verify stream completes but error is logged (error path test — MANDATORY per mock testing rules)
- `handles Anthropic API failure gracefully` — mock stream to throw, verify response includes error information (error path test — MANDATORY per mock testing rules)

**Step 2: Add tests for the modified `/api/painted-door/[id]` route**

Create `src/app/api/painted-door/[id]/__tests__/route.test.ts` covering:
- GET returns `buildSession` data when a session exists in Redis
- GET returns normal progress data when no session exists
- POST still calls `runPaintedDoorAgent` (V1, not V2 or auto-switcher) — verify the import was updated
- Error paths: Redis failure on `getBuildSession` (MANDATORY mock error test)

**Step 2: Run tests**

Run: `npm test -- --run src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`

**Step 3: Commit**

```bash
git add src/app/api/painted-door/[id]/chat/__tests__/route.test.ts
git commit -m "test: add integration tests for full website builder chat flow"
```

---

## Task 17: End-to-End Verification and Build Check

**Step 1: Run the full test suite**

Run: `npm test -- --run`

All tests must pass.

**Step 2: Run the build**

Run: `npm run build`

Build must succeed with no errors.

**Step 3: Run the linter**

Run: `npm run lint`

Must pass with no errors.

**Step 4: Verify all new files are tracked**

Check `git status` in the worktree to see all new/modified files.

**Step 5: Commit any remaining changes**

If any files were missed in previous commits:

```bash
git add <files>
git commit -m "chore: final cleanup for interactive website builder"
```

---

## Task 18: Update Architecture Documentation

**Files:**
- Modify: `docs/architecture.md`

**Step 1: Read the current architecture doc**

Read `docs/architecture.md`.

**Step 2: Add the new route and components**

Update the following sections:

**Pages section:** Add entry for `/website/[id]/build` — Interactive chat-driven site builder with mode selection, progress sidebar.

**API Routes section:** Add entry for `/api/painted-door/[id]/chat` — POST streaming chat with agent loop for website building.

**Module Dependency Map:** Add `website-chat` to the Tools section, showing it depends on `S_ADVISORS` (prompt-loader) and `L_ANTHROPIC`.

**Website flow in Primary User Flows:** Update the Website subgraph to show the new chat-driven flow:
```
D1 → D1a["User clicks Build Website"]
D1a → D1b["/website/[id]/build"]
D1b → D1c["Mode selection"]
D1c → D1d["Chat-driven agent loop"]
D1d → D4
```

**Quick Reference tables:** Add the new page and API route entries.

**Step 3: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: update architecture reference with interactive website builder components"
```

---

## Decision Log

### Summary
| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Streaming approach for chat | Text streaming with `__SIGNAL__` suffix | SSE events, JSON-LD streaming |
| 2 | Session state storage | Redis with 4-hour TTL | Client-side state, database |
| 3 | Conversation history strategy | Server-side in Redis, last 40 messages to Anthropic | Client-managed (like foundation chat), full history |
| 4 | Tool execution in agent loop | Inline non-streaming tool calls between streamed responses | Agent runtime's runAgent, separate tool execution endpoint |
| 5 | Critique pipeline integration | Extract shared service, both agents call it | Duplicate critique logic, use agent-to-agent events |
| 6 | V1 pipeline preservation | Keep V1 as fallback, remove V2 and auto-switcher | Remove all old code immediately, keep all three |
| 7 | Task ordering | UI last (after all backend) | UI first with mock API, parallel frontend/backend |
| 8 | `consult_advisor` input schema | `context: string` (simplified) | `artifacts: string[]` (design doc spec) |
| 9 | V1 pipeline retention | Keep V1, contradicts design doc "Removed" list | Remove V1 as design doc specifies |

### Appendix: Decision Details

#### Decision 1: Streaming approach
**Chose:** Plain text streaming with `__SIGNAL__` JSON suffix
**Why:** The foundation chat already uses plain text streaming via `ReadableStream`. This keeps the pattern consistent. The `__SIGNAL__` suffix is a simple convention — the client strips it from the displayed text and uses it to drive the state machine. SSE would require changing the response content type and adding event parsing on the client. The text streaming approach is simpler and already proven in the codebase.
**Alternatives rejected:**
- SSE events: More complex, requires EventSource on client, not needed for this use case
- JSON-LD streaming: Over-engineered for a chat interface

#### Decision 2: Session state storage
**Chose:** Redis with 4-hour TTL
**Why:** The existing progress tracking pattern (`painted_door_progress:{ideaId}` with 1-hour TTL) establishes the Redis-for-session-state pattern. 4 hours gives enough time for long interactive builds with breaks. The data is ephemeral — if it expires, the user starts a new build.
**Alternatives rejected:**
- Client-side state: Loses progress on page refresh, can't resume across tabs/devices
- Persistent database: Over-engineered for build session data that's only needed during active builds

#### Decision 3: Conversation history strategy
**Chose:** Server-side in Redis, last 40 messages sent to Anthropic
**Why:** Unlike the foundation chat (which sends full history from the client each request), the website builder chat needs server-side persistence for resumability. The 40-message window keeps context costs manageable while preserving enough history for continuity. Foundation chat sends client-managed history because it's a simple edit-focused conversation; the website builder is a multi-step agent that may generate dozens of messages.
**Alternatives rejected:**
- Client-managed: Can't resume across page loads without re-sending everything
- Full history: Could exceed context limits on long builds with many tool calls

#### Decision 4: Tool execution in agent loop
**Chose:** Inline non-streaming tool calls between streamed text responses
**Why:** The agent runtime's `runAgent` function uses non-streaming `messages.create` calls in a loop. The chat API needs streaming for the user-facing narration but non-streaming for tool execution (tools need complete inputs). The hybrid approach streams the text portions and runs tools inline. This avoids the complexity of making the full agent runtime streaming-aware.
**Alternatives rejected:**
- Full agent runtime: Would require making `runAgent` streaming-aware, major refactor
- Separate tool endpoint: Adds HTTP roundtrip overhead per tool call, complicates client

#### Decision 5: Critique pipeline integration
**Chose:** Extract shared service
**Why:** The design doc explicitly calls for this. The current critique tools in `agent-tools/critique.ts` are tightly coupled to the closure state of `createCritiqueTools`. Extracting the core logic (`runSingleCritic`, critic resolution, `applyEditorRubric`) into a shared service lets both the critique agent and the website builder call the same logic without duplicating it.
**Alternatives rejected:**
- Duplicate logic: Violates DRY, leads to drift
- Agent-to-agent events: Too complex for synchronous critique within a chat flow

#### Decision 6: V1 pipeline preservation
**Chose:** Keep V1, remove V2 and auto-switcher
**Why:** V2 was never used in production (`AGENT_V2` env var was never set). Removing it is pure dead code cleanup. V1 stays as a fallback — the existing POST route still works for any non-chat builds. Once the chat flow is verified in production, V1 can be removed in a follow-up.
**Alternatives rejected:**
- Remove all immediately: Too risky, no fallback if chat flow has issues
- Keep everything: Unnecessary complexity, V2 is confirmed dead code

#### Decision 7: Task ordering — backend first
**Chose:** Backend tasks first (types, storage, tools, API), then UI
**Why:** The UI depends on the API shape (response format, streaming protocol, signal format). Building the backend first means the UI can be built against a real API rather than mocks. This also lets us verify the agent loop works correctly before adding the presentation layer.
**Alternatives rejected:**
- UI first with mock: Requires building mocks that may not match the real API, double work
- Parallel: More complex coordination, harder to test incrementally

#### Decision 8: `consult_advisor` input schema simplified
**Chose:** `{ advisorId: string, question: string, context?: string }` — single optional context string
**Why:** The design doc specifies `artifacts: string[]` as the third parameter, intended to select which build artifacts to include. In practice, the agent (Julian) already has full context of the build and can include relevant excerpts in the `context` string. A structured `artifacts` array would require a registry of named artifacts and lookup logic — unnecessary complexity when a free-form context string achieves the same result. **This contradicts the design doc interface.**
**Alternatives rejected:**
- `artifacts: string[]` (design doc spec): Requires building artifact registry and lookup. Over-engineered for an LLM that already has context in its conversation history.

#### Decision 9: V1 pipeline retained (contradicts design doc)
**Chose:** Keep `runPaintedDoorAgent` (V1), only remove V2 and auto-switcher
**Why:** The design doc's "Removed" section lists V1 for removal. We retain it as a production fallback — the existing POST route (`/api/painted-door/[id]`) continues to call V1 for any non-chat builds. If the chat flow encounters issues in production, V1 provides a working path. Once the chat flow is verified, V1 can be removed in a follow-up. **This explicitly contradicts the design doc.**
**Alternatives rejected:**
- Remove V1 as design doc specifies: No fallback if chat flow has issues in production. The chat flow is a fundamentally different architecture (streaming agent loop vs. sequential pipeline), and shipping without a fallback is unnecessarily risky.
