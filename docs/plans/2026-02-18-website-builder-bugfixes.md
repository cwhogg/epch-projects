# Website Builder Bugfixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Fix 4 interconnected bugs in the website builder agent: step advancement never updates (bugs 3+4), tool state lost between API calls (bug 3), repos always created fresh on rebuild (bug 2), and advisor responses lack distinct chat bubbles (bug 1).

**Source Design Doc:** `docs/plans/2026-02-17-interactive-website-builder.md` (original feature)

**Architecture:** Backend streams Claude responses through a ReadableStream. An agentic loop (max 15 rounds) in `runAgentStream` calls tools and streams text deltas. Session state (`BuildSession` with `currentStep`, `steps[]`, `artifacts`) is stored in Redis. The frontend accumulates chunks into messages and processes `__SIGNAL__` markers at stream end to determine actions: checkpoint (pause for user), continue (auto-fire next), poll (deployment), complete. The core bug is that `session.currentStep` is set to 0 on mode_select and **never incremented anywhere** — confirmed by grep across entire `src/`. This means signals always report step 0 and tool state resets every API call.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Anthropic SDK (streaming), Upstash Redis, Vitest

---

### ✅ Task 1: Export `determineStreamEndSignal` and add unit tests

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/route.ts:339` (add export)
- Test: `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`

**Step 1: Export `determineStreamEndSignal`**

In `route.ts`, change line 339 from:
```typescript
function determineStreamEndSignal(session: BuildSession): StreamEndSignal {
```
to:
```typescript
export function determineStreamEndSignal(session: BuildSession): StreamEndSignal {
```

**Step 2: Write failing tests**

Add to the bottom of `route.test.ts`:

```typescript
import { determineStreamEndSignal } from '../route';
import { WEBSITE_BUILD_STEPS } from '@/types';

function makeBuildSession(overrides: Partial<BuildSession> = {}): BuildSession {
  return {
    ideaId: 'idea-1',
    mode: 'interactive',
    currentStep: 0,
    steps: WEBSITE_BUILD_STEPS.map((s) => ({ name: s.name, status: 'pending' as const })),
    artifacts: {},
    createdAt: '2026-02-17T00:00:00Z',
    updatedAt: '2026-02-17T00:00:00Z',
    ...overrides,
  };
}

describe('determineStreamEndSignal', () => {
  it('returns checkpoint for interactive mode at checkpoint step', () => {
    const session = makeBuildSession({ currentStep: 0 }); // step 0 IS a checkpoint
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('checkpoint');
    expect(signal).toHaveProperty('step', 0);
  });

  it('returns continue for interactive mode at non-checkpoint step', () => {
    const session = makeBuildSession({ currentStep: 1 }); // step 1 is NOT a checkpoint
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('continue');
    expect(signal).toHaveProperty('step', 1);
  });

  it('returns continue for autonomous mode even at checkpoint step', () => {
    const session = makeBuildSession({ mode: 'autonomous', currentStep: 0 });
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('continue');
  });

  it('returns poll for deploy step (step 6)', () => {
    const session = makeBuildSession({ currentStep: 6 });
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('poll');
    expect(signal).toHaveProperty('pollUrl', '/api/painted-door/idea-1');
  });

  it('returns complete when last step is complete', () => {
    const session = makeBuildSession({ currentStep: 7 });
    session.steps[7].status = 'complete';
    session.artifacts.siteUrl = 'https://example.vercel.app';
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('complete');
    if (signal.action === 'complete') {
      expect(signal.result.siteUrl).toBe('https://example.vercel.app');
    }
  });

  it('does not return complete when last step is NOT complete', () => {
    const session = makeBuildSession({ currentStep: 7 });
    // step 7 status is still 'pending'
    const signal = determineStreamEndSignal(session);
    expect(signal.action).not.toBe('complete');
  });
});
```

Also add the `BuildSession` import at the top alongside the existing imports:
```typescript
import type { BuildSession } from '@/types';
```

**Step 3: Run tests to verify they pass**

Run: `npm test -- src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`
Expected: All new tests PASS (since `determineStreamEndSignal` already exists — we're just adding tests for it, not changing behavior)

**Step 4: Commit**

```bash
git add src/app/api/painted-door/\[id\]/chat/route.ts src/app/api/painted-door/\[id\]/chat/__tests__/route.test.ts
git commit -m "test: add unit tests for determineStreamEndSignal"
```

---

### Task 2: Create `advanceSessionStep` helper with tests

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/route.ts` (add new exported function)
- Test: `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`

**Step 1: Write failing tests**

Add to route.test.ts:

```typescript
import { advanceSessionStep } from '../route';

describe('advanceSessionStep', () => {
  it('advances step when tool maps to higher step', () => {
    const session = makeBuildSession({ currentStep: 0 });
    advanceSessionStep(session, ['design_brand']);
    expect(session.currentStep).toBe(1);
    expect(session.steps[0].status).toBe('complete');
    expect(session.steps[1].status).toBe('complete');
    expect(session.steps[2].status).toBe('active');
  });

  it('skips intermediate steps when tool maps to much higher step', () => {
    const session = makeBuildSession({ currentStep: 0 });
    advanceSessionStep(session, ['assemble_site_files']);
    expect(session.currentStep).toBe(3);
    for (let i = 0; i <= 3; i++) {
      expect(session.steps[i].status).toBe('complete');
    }
    expect(session.steps[4].status).toBe('active');
  });

  it('does not move backward', () => {
    const session = makeBuildSession({ currentStep: 3 });
    advanceSessionStep(session, ['get_idea_context']); // step 0
    expect(session.currentStep).toBe(3); // unchanged
  });

  it('ignores unknown tools', () => {
    const session = makeBuildSession({ currentStep: 0 });
    advanceSessionStep(session, ['update_file', 'some_unknown_tool']);
    expect(session.currentStep).toBe(0); // unchanged
  });

  it('uses highest step when multiple tools called in one round', () => {
    const session = makeBuildSession({ currentStep: 0 });
    advanceSessionStep(session, ['get_idea_context', 'design_brand']);
    expect(session.currentStep).toBe(1); // design_brand is higher
  });

  it('consult_advisor only advances when currentStep >= 4', () => {
    const session = makeBuildSession({ currentStep: 2 });
    advanceSessionStep(session, ['consult_advisor']);
    expect(session.currentStep).toBe(2); // unchanged — too early

    const session2 = makeBuildSession({ currentStep: 4 });
    advanceSessionStep(session2, ['consult_advisor']);
    expect(session2.currentStep).toBe(5); // advances past Pressure Test
  });

  it('marks last step active when advancing to second-to-last', () => {
    const session = makeBuildSession({ currentStep: 5 });
    advanceSessionStep(session, ['push_files']);
    expect(session.currentStep).toBe(6);
    expect(session.steps[7].status).toBe('active');
  });

  it('does not set active beyond steps array bounds', () => {
    const session = makeBuildSession({ currentStep: 6 });
    advanceSessionStep(session, ['finalize_site']);
    expect(session.currentStep).toBe(7);
    expect(session.steps[7].status).toBe('complete');
    // No step 8 to mark active — should not throw
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`
Expected: FAIL — `advanceSessionStep` is not exported from route.ts

**Step 3: Implement `advanceSessionStep`**

Add to `route.ts` before `determineStreamEndSignal` (around line 338):

```typescript
const TOOL_COMPLETES_STEP: Record<string, number> = {
  get_idea_context: 0,        // Extract Ingredients
  design_brand: 1,            // Design Brand Identity
  // Step 2 (Write Hero) has no tool — advances via frontend continue
  assemble_site_files: 3,     // Assemble Page
  evaluate_brand: 4,          // Pressure Test
  validate_code: 4,           // Pressure Test
  consult_advisor: 5,         // Advisor Review (gated: currentStep >= 4)
  create_repo: 6,             // Build & Deploy
  push_files: 6,              // Build & Deploy
  create_vercel_project: 6,   // Build & Deploy
  trigger_deploy: 6,          // Build & Deploy
  check_deploy_status: 6,     // Build & Deploy
  verify_site: 7,             // Verify
  finalize_site: 7,           // Verify
};

/**
 * Advance session step based on which tools were called this round.
 * Mutates session in place. Only moves forward, never backward.
 */
export function advanceSessionStep(
  session: BuildSession,
  toolNames: string[],
): void {
  let maxStep = session.currentStep;
  for (const name of toolNames) {
    const step = TOOL_COMPLETES_STEP[name];
    if (step === undefined) continue;
    if (name === 'consult_advisor' && session.currentStep < 4) continue;
    if (step > maxStep) maxStep = step;
  }

  if (maxStep > session.currentStep) {
    for (let i = 0; i <= maxStep; i++) {
      if (session.steps[i]) session.steps[i].status = 'complete';
    }
    session.currentStep = maxStep;
    if (maxStep + 1 < session.steps.length && session.steps[maxStep + 1]) {
      session.steps[maxStep + 1].status = 'active';
    }
  }
}
```

Also add the `BuildSession` import to the existing imports at the top of route.ts (line 18):
```typescript
import type { BuildMode, BuildSession, ChatMessage, ChatRequestBody, StreamEndSignal, ToolDefinition } from '@/types';
```
(`BuildSession` is already in the import — verify before adding.)

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`
Expected: All `advanceSessionStep` tests PASS

**Step 5: Commit**

```bash
git add src/app/api/painted-door/\[id\]/chat/route.ts src/app/api/painted-door/\[id\]/chat/__tests__/route.test.ts
git commit -m "feat: add advanceSessionStep helper with tool-to-step mapping"
```

---

### Task 3: Wire step advancement into `runAgentStream` and handle `body.step`

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/route.ts:112-187` (POST handler) and `route.ts:245-318` (runAgentStream)

**Step 1: Wire `advanceSessionStep` into `runAgentStream`**

In `runAgentStream`, after the tool execution block (after `Promise.all` at ~line 305, before building `currentMessages`), add:

```typescript
    // Advance session step based on tools called this round
    const toolNamesCalled = toolUseBlocks.map((t) => t.name);
    advanceSessionStep(session, toolNamesCalled);
```

This goes right after line 305 (the closing of `Promise.all`) and before line 308 (building `currentMessages`).

**Step 2: Add `body.step` advancement in POST handler**

In the POST handler, after the `body.type === 'continue'` block (after line 187), add session advancement logic. Insert after loading the session (~line 161) and before assembling the system prompt (~line 190):

Find this block (around lines 159-163):
```typescript
  // Load or verify session exists
  const session = await getBuildSession(ideaId);
  if (!session) {
    return Response.json({ error: 'No build session found. Start with mode_select.' }, { status: 400 });
  }
```

After it, add:
```typescript
  // Advance session from frontend continue signal
  if (body.type === 'continue' && body.step !== undefined && body.step > session.currentStep) {
    for (let i = 0; i <= body.step; i++) {
      if (session.steps[i]) session.steps[i].status = 'complete';
    }
    session.currentStep = body.step;
    if (body.step + 1 < session.steps.length && session.steps[body.step + 1]) {
      session.steps[body.step + 1].status = 'active';
    }
    await saveBuildSession(ideaId, session);
  }
```

**Step 3: Write tests for the wired behavior**

Add to route.test.ts:

```typescript
describe('step advancement via tool calls', () => {
  beforeEach(() => vi.clearAllMocks());

  async function setupForToolTest(currentStep: number) {
    const { getIdeaFromDb } = await import('@/lib/db');
    (getIdeaFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'idea-1', name: 'Test', description: 'Test', targetUser: 'devs', problemSolved: 'testing',
    });

    const { getBuildSession, saveBuildSession } = await import('@/lib/painted-door-db');
    const steps = WEBSITE_BUILD_STEPS.map((s) => ({ name: s.name, status: 'pending' as const }));
    for (let i = 0; i < currentStep; i++) steps[i].status = 'complete';
    if (steps[currentStep]) steps[currentStep].status = 'active';

    const session = {
      ideaId: 'idea-1',
      mode: 'interactive' as const,
      currentStep,
      steps,
      artifacts: {},
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    };
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue(session);
    return { session, saveBuildSession: saveBuildSession as ReturnType<typeof vi.fn> };
  }

  it('advances session when get_idea_context tool is called', async () => {
    const { saveBuildSession } = await setupForToolTest(0);

    // Mock tool that returns get_idea_context
    const { createWebsiteTools } = await import('@/lib/agent-tools/website');
    (createWebsiteTools as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        name: 'get_idea_context',
        description: 'mock',
        input_schema: { type: 'object', properties: {}, required: [] },
        execute: vi.fn().mockResolvedValue({ success: true }),
      },
    ]);

    // First round: tool call; Second round: text only
    let callCount = 0;
    mockMessagesStream.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        const events = (async function* () {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Extracting...' } };
        })();
        return {
          [Symbol.asyncIterator]: () => events,
          finalMessage: () => Promise.resolve({
            content: [
              { type: 'text', text: 'Extracting...' },
              { type: 'tool_use', id: 'tool-1', name: 'get_idea_context', input: {} },
            ],
          }),
        };
      }
      const events = (async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Done.' } };
      })();
      return {
        [Symbol.asyncIterator]: () => events,
        finalMessage: () => Promise.resolve({
          content: [{ type: 'text', text: 'Done.' }],
        }),
      };
    });

    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'user', content: 'Start' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    await readStream(response);

    // Session should have been saved with currentStep = 0 (get_idea_context completes step 0)
    const savedCalls = saveBuildSession.mock.calls;
    const lastSaved = savedCalls[savedCalls.length - 1][1];
    expect(lastSaved.currentStep).toBe(0);
    expect(lastSaved.steps[0].status).toBe('complete');
  });
});
```

**Step 4: Run tests**

Run: `npm test -- src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/app/api/painted-door/\[id\]/chat/route.ts src/app/api/painted-door/\[id\]/chat/__tests__/route.test.ts
git commit -m "feat: wire step advancement into agent loop and body.step handler"
```

---

### Task 4: Make `createWebsiteTools` async with preloading

**Files:**
- Modify: `src/lib/agent-tools/website.ts:265` (change signature, add preload)
- Modify: `src/app/api/painted-door/[id]/chat/route.ts:199` (await the call)
- Modify: `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts:71` (fix mock)

**Step 1: Fix test mock first (prevents breakage)**

In `route.test.ts` line 71, change:
```typescript
  createWebsiteTools: vi.fn().mockReturnValue([]),
```
to:
```typescript
  createWebsiteTools: vi.fn().mockResolvedValue([]),
```

**Step 2: Change `createWebsiteTools` signature and add preloading**

In `website.ts`, change line 265 from:
```typescript
export function createWebsiteTools(ideaId: string): ToolDefinition[] {
```
to:
```typescript
export async function createWebsiteTools(ideaId: string): Promise<ToolDefinition[]> {
```

Move the closure state declarations (lines 267-277) before the `return [` and add preloading between them:

```typescript
export async function createWebsiteTools(ideaId: string): Promise<ToolDefinition[]> {
  // Shared mutable state across tool calls within a single run
  let idea: ProductIdea | null = null;
  let ctx: ContentContext | null = null;
  let brand: BrandIdentity | null = null;
  let allFiles: Record<string, string> = {};
  let siteSlug = '';
  let siteId = '';
  let repo: { owner: string; name: string; url: string } | null = null;
  let vercelProjectId = '';
  let siteUrl = '';
  let lastDeploymentId: string | null = null;
  let pushCount = 0;

  // Best-effort preload from database — errors leave state as null
  try {
    idea = await getIdeaFromDb(ideaId);
    if (idea) {
      ctx = await buildContentContext(ideaId);
      siteSlug = slugify(idea.name);
      siteId = `pd-${siteSlug}`;
    }
  } catch { /* continue with null — tools will fetch on demand */ }

  try {
    const existingSite = await getPaintedDoorSite(ideaId);
    if (existingSite) {
      brand = existingSite.brand || null;
      if (existingSite.repoOwner && existingSite.repoName) {
        repo = { owner: existingSite.repoOwner, name: existingSite.repoName, url: existingSite.repoUrl };
      }
      vercelProjectId = existingSite.vercelProjectId || '';
      siteUrl = existingSite.siteUrl || '';
    }
  } catch { /* continue with null — tools will create fresh */ }

  return [
```

Note: `getIdeaFromDb` is imported from `@/lib/db` (line 5), `buildContentContext` from `@/lib/content-agent` (line 3), `getPaintedDoorSite` from `@/lib/painted-door-db` (line 8), `slugify` from `../utils` (line 12). All already imported.

**Step 3: Update call site in route.ts**

In `route.ts`, change line 199 from:
```typescript
  const websiteTools = createWebsiteTools(ideaId);
```
to:
```typescript
  const websiteTools = await createWebsiteTools(ideaId);
```

**Step 4: Run tests**

Run: `npm test -- src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`
Expected: All tests PASS (mock returns promise, await resolves it)

**Step 5: Run full test suite to check for other callers**

Run: `npm test`
Expected: All tests PASS. If any other files call `createWebsiteTools` synchronously, they'll need updating.

**Step 6: Commit**

```bash
git add src/lib/agent-tools/website.ts src/app/api/painted-door/\[id\]/chat/route.ts src/app/api/painted-door/\[id\]/chat/__tests__/route.test.ts
git commit -m "feat: make createWebsiteTools async with database preloading"
```

---

### Task 5: Add repo and Vercel project reuse

**Files:**
- Modify: `src/lib/agent-tools/website.ts:554-575` (create_repo) and `website.ts:629-656` (create_vercel_project)

**Step 1: Modify `create_repo` execute function**

Replace the execute function at line 563-574:

```typescript
      execute: async () => {
        if (!brand) return { error: 'Call design_brand first' };

        // Reuse existing repo if preloaded or found in DB
        if (repo) {
          return {
            success: true,
            reused: true,
            owner: repo.owner,
            name: repo.name,
            url: repo.url,
          };
        }

        // Check DB as fallback (in case preload missed it)
        try {
          const existingSite = await getPaintedDoorSite(ideaId);
          if (existingSite?.repoOwner && existingSite?.repoName) {
            repo = { owner: existingSite.repoOwner, name: existingSite.repoName, url: existingSite.repoUrl };
            return {
              success: true,
              reused: true,
              owner: repo.owner,
              name: repo.name,
              url: repo.url,
            };
          }
        } catch { /* fall through to create new */ }

        repo = await createGitHubRepo(siteSlug, `${brand.siteName} — ${brand.tagline}`);

        return {
          success: true,
          owner: repo.owner,
          name: repo.name,
          url: repo.url,
        };
      },
```

**Step 2: Modify `create_vercel_project` execute function**

Replace the execute function at line 637-655:

```typescript
      execute: async () => {
        if (!repo) return { error: 'Call create_repo first' };

        // Reuse existing Vercel project if preloaded
        if (vercelProjectId) {
          return {
            success: true,
            reused: true,
            projectId: vercelProjectId,
          };
        }

        const result = await createVercelProject(repo.owner, repo.name, siteId);
        vercelProjectId = result.projectId;

        // Update site state
        const existingSite = await getPaintedDoorSite(ideaId);
        if (existingSite) {
          existingSite.vercelProjectId = vercelProjectId;
          existingSite.status = 'deploying';
          await savePaintedDoorSite(existingSite);
        }

        return {
          success: true,
          projectId: vercelProjectId,
        };
      },
```

**Step 3: Run tests**

Run: `npm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/lib/agent-tools/website.ts
git commit -m "feat: reuse existing GitHub repo and Vercel project on rebuild"
```

---

### Task 6: Update ChatMessage type and inject advisor markers in stream

**Files:**
- Modify: `src/types/index.ts:551` (simplify advisorConsultation type)
- Modify: `src/app/api/painted-door/[id]/chat/route.ts` (inject markers after tool execution)

**Step 1: Update ChatMessage metadata type**

In `types/index.ts`, change line 551 from:
```typescript
    advisorConsultation?: { advisorId: string; advisorName: string; question: string };
```
to:
```typescript
    advisorConsultation?: { advisorId: string; advisorName: string };
```

**Step 2: Add advisor marker injection in `runAgentStream`**

In `route.ts`, add this import at the top (alongside existing imports from `@/lib/advisors/registry`):
```typescript
import { advisorRegistry } from '@/lib/advisors/registry';
```
(Check if already imported — it's imported at line 2 in route.ts for the system prompt. Confirmed: already imported.)

In `runAgentStream`, after the `advanceSessionStep` call and before building `currentMessages`, inject advisor markers for any `consult_advisor` tool calls:

```typescript
    // Inject advisor markers for consult_advisor tool results
    for (let i = 0; i < toolUseBlocks.length; i++) {
      if (toolUseBlocks[i].name === 'consult_advisor' && !toolResults[i].is_error) {
        const advisorId = toolUseBlocks[i].input.advisorId as string;
        const advisor = advisorRegistry.find((a) => a.id === advisorId);
        const advisorName = advisor?.name || advisorId;
        const marker = `\n<<<ADVISOR_START>>>:${JSON.stringify({ advisorId, advisorName })}\n${toolResults[i].content}\n<<<ADVISOR_END>>>\n`;
        controller.enqueue(encoder.encode(marker));
        assistantText += marker;
      }
    }
```

**Step 3: Add paragraph breaks between tool rounds**

In `runAgentStream`, right before the next `stream = getAnthropic().messages.stream(...)` call (at the top of the for loop, after the tool results are appended to `currentMessages`), add:

```typescript
    // Add paragraph break between tool rounds for readability
    if (assistantText.length > 0 && !assistantText.endsWith('\n\n')) {
      controller.enqueue(encoder.encode('\n\n'));
      assistantText += '\n\n';
    }
```

**Step 4: Write test for advisor marker injection**

Add to route.test.ts:

```typescript
describe('advisor marker injection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('injects advisor markers for consult_advisor tool calls', async () => {
    const { getIdeaFromDb } = await import('@/lib/db');
    (getIdeaFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'idea-1', name: 'Test', description: 'Test', targetUser: 'devs', problemSolved: 'testing',
    });

    const { getBuildSession } = await import('@/lib/painted-door-db');
    const steps = WEBSITE_BUILD_STEPS.map((s) => ({ name: s.name, status: 'pending' as const }));
    steps[0].status = 'complete';
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ideaId: 'idea-1',
      mode: 'autonomous',
      currentStep: 4, // Past Pressure Test so consult_advisor can advance
      steps,
      artifacts: {},
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });

    const { createConsultAdvisorTool } = await import('@/lib/agent-tools/website-chat');
    (createConsultAdvisorTool as ReturnType<typeof vi.fn>).mockReturnValue({
      name: 'consult_advisor',
      description: 'mock',
      input_schema: { type: 'object', properties: {}, required: [] },
      execute: vi.fn().mockResolvedValue('Shirin says: reduce cognitive load on the CTA.'),
    });

    let callCount = 0;
    mockMessagesStream.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        const events = (async function* () {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Consulting Shirin...' } };
        })();
        return {
          [Symbol.asyncIterator]: () => events,
          finalMessage: () => Promise.resolve({
            content: [
              { type: 'text', text: 'Consulting Shirin...' },
              { type: 'tool_use', id: 'tool-1', name: 'consult_advisor', input: { advisorId: 'shirin-oreizy', question: 'Review CTA' } },
            ],
          }),
        };
      }
      const events = (async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Based on her advice...' } };
      })();
      return {
        [Symbol.asyncIterator]: () => events,
        finalMessage: () => Promise.resolve({
          content: [{ type: 'text', text: 'Based on her advice...' }],
        }),
      };
    });

    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'user', content: 'Review the CTA' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    const text = await readStream(response);

    expect(text).toContain('<<<ADVISOR_START>>>');
    expect(text).toContain('shirin-oreizy');
    expect(text).toContain('Shirin Oreizy');
    expect(text).toContain('reduce cognitive load');
    expect(text).toContain('<<<ADVISOR_END>>>');
  });
});
```

**Step 5: Run tests**

Run: `npm test -- src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/types/index.ts src/app/api/painted-door/\[id\]/chat/route.ts src/app/api/painted-door/\[id\]/chat/__tests__/route.test.ts
git commit -m "feat: inject advisor identity markers into stream for distinct chat bubbles"
```

---

### Task 7: Create and test `parseStreamSegments` utility

**Files:**
- Create: `src/lib/parse-advisor-segments.ts`
- Create: `src/lib/__tests__/parse-advisor-segments.test.ts`

Note: The existing `src/lib/__tests__/parse-stream.test.ts` tests a different utility. This is a new file for advisor segment parsing.

**Step 1: Write failing tests**

Create `src/lib/__tests__/parse-advisor-segments.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseStreamSegments, type StreamSegment } from '../parse-advisor-segments';

describe('parseStreamSegments', () => {
  it('returns single julian segment when no markers present', () => {
    const segments = parseStreamSegments('Just some regular text from Julian.');
    expect(segments).toEqual([
      { type: 'julian', content: 'Just some regular text from Julian.' },
    ]);
  });

  it('splits text with one advisor consultation', () => {
    const text = [
      'Let me consult Shirin.',
      '<<<ADVISOR_START>>>:{"advisorId":"shirin-oreizy","advisorName":"Shirin Oreizy"}',
      'Reduce cognitive load on the CTA.',
      '<<<ADVISOR_END>>>',
      'Based on her advice, I\'ll simplify.',
    ].join('\n');

    const segments = parseStreamSegments(text);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ type: 'julian', content: 'Let me consult Shirin.' });
    expect(segments[1]).toEqual({
      type: 'advisor',
      content: 'Reduce cognitive load on the CTA.',
      advisorId: 'shirin-oreizy',
      advisorName: 'Shirin Oreizy',
    });
    expect(segments[2]).toEqual({ type: 'julian', content: "Based on her advice, I'll simplify." });
  });

  it('handles multiple advisor consultations', () => {
    const text = [
      'Consulting two advisors.',
      '<<<ADVISOR_START>>>:{"advisorId":"shirin-oreizy","advisorName":"Shirin Oreizy"}',
      'Shirin feedback.',
      '<<<ADVISOR_END>>>',
      'Now asking Oli.',
      '<<<ADVISOR_START>>>:{"advisorId":"oli-gardner","advisorName":"Oli Gardner"}',
      'Oli feedback.',
      '<<<ADVISOR_END>>>',
      'Final thoughts.',
    ].join('\n');

    const segments = parseStreamSegments(text);
    expect(segments).toHaveLength(5);
    expect(segments[0].type).toBe('julian');
    expect(segments[1]).toMatchObject({ type: 'advisor', advisorId: 'shirin-oreizy' });
    expect(segments[2].type).toBe('julian');
    expect(segments[3]).toMatchObject({ type: 'advisor', advisorId: 'oli-gardner' });
    expect(segments[4].type).toBe('julian');
  });

  it('filters out empty segments', () => {
    const text = [
      '<<<ADVISOR_START>>>:{"advisorId":"shirin-oreizy","advisorName":"Shirin Oreizy"}',
      'Advisor text only.',
      '<<<ADVISOR_END>>>',
    ].join('\n');

    const segments = parseStreamSegments(text);
    // Leading empty julian segment should be filtered
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('advisor');
  });

  it('handles malformed JSON in marker gracefully', () => {
    const text = 'Before\n<<<ADVISOR_START>>>:not-json\nSome text\n<<<ADVISOR_END>>>\nAfter';
    const segments = parseStreamSegments(text);
    // Should return the whole text as a single julian segment (graceful fallback)
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('julian');
  });

  it('handles incomplete markers (missing END) gracefully', () => {
    const text = 'Before\n<<<ADVISOR_START>>>:{"advisorId":"x","advisorName":"X"}\nText without end';
    const segments = parseStreamSegments(text);
    // Should return the whole text as a single julian segment
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('julian');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/__tests__/parse-advisor-segments.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `parseStreamSegments`**

Create `src/lib/parse-advisor-segments.ts`:

```typescript
export type StreamSegment =
  | { type: 'julian'; content: string }
  | { type: 'advisor'; content: string; advisorId: string; advisorName: string };

const ADVISOR_START = '<<<ADVISOR_START>>>';
const ADVISOR_END = '<<<ADVISOR_END>>>';

export function parseStreamSegments(text: string): StreamSegment[] {
  // Quick check: if no markers, return as single julian segment
  if (!text.includes(ADVISOR_START)) {
    return text.trim() ? [{ type: 'julian', content: text.trim() }] : [];
  }

  const segments: StreamSegment[] = [];

  try {
    let remaining = text;

    while (remaining.length > 0) {
      const startIdx = remaining.indexOf(ADVISOR_START);
      if (startIdx === -1) {
        // No more markers — rest is julian text
        const trimmed = remaining.trim();
        if (trimmed) segments.push({ type: 'julian', content: trimmed });
        break;
      }

      // Text before the marker is julian
      const before = remaining.slice(0, startIdx).trim();
      if (before) segments.push({ type: 'julian', content: before });

      // Find the JSON payload on the same line as ADVISOR_START
      const afterStart = remaining.slice(startIdx + ADVISOR_START.length);
      const colonIdx = afterStart.indexOf(':');
      if (colonIdx !== 0) {
        // Malformed — return whole text as julian
        return text.trim() ? [{ type: 'julian', content: text.trim() }] : [];
      }

      const jsonLine = afterStart.slice(1).split('\n')[0];
      let advisorId: string;
      let advisorName: string;
      try {
        const parsed = JSON.parse(jsonLine);
        advisorId = parsed.advisorId;
        advisorName = parsed.advisorName;
      } catch {
        // Malformed JSON — return whole text as julian
        return text.trim() ? [{ type: 'julian', content: text.trim() }] : [];
      }

      // Find the end marker
      const endIdx = afterStart.indexOf(ADVISOR_END);
      if (endIdx === -1) {
        // Missing end marker — return whole text as julian
        return text.trim() ? [{ type: 'julian', content: text.trim() }] : [];
      }

      // Extract advisor content (between first newline after JSON and end marker)
      const contentStart = afterStart.indexOf('\n', 1) + 1;
      const advisorContent = afterStart.slice(contentStart, endIdx).trim();

      segments.push({
        type: 'advisor',
        content: advisorContent,
        advisorId,
        advisorName,
      });

      remaining = afterStart.slice(endIdx + ADVISOR_END.length);
    }
  } catch {
    // Any unexpected error — return whole text as julian
    return text.trim() ? [{ type: 'julian', content: text.trim() }] : [];
  }

  return segments;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/__tests__/parse-advisor-segments.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/lib/parse-advisor-segments.ts src/lib/__tests__/parse-advisor-segments.test.ts
git commit -m "feat: add parseStreamSegments utility for advisor bubble splitting"
```

---

### Task 8: Update frontend `handleSignal` and add streaming guard

**Files:**
- Modify: `src/app/website/[id]/build/page.tsx:104-230`

**Step 1: Replace `updateStepStatus` to mark all intermediate steps**

In `page.tsx`, replace `updateStepStatus` (lines 104-116) with a version that marks all steps up to the target:

```typescript
  function updateStepStatus(stepIndex: number, status: BuildStep['status']) {
    setSteps((prev) => {
      const updated = [...prev];
      if (status === 'complete') {
        // Mark all steps from 0 through stepIndex as complete
        for (let i = 0; i <= stepIndex; i++) {
          if (updated[i]) updated[i] = { ...updated[i], status: 'complete' };
        }
      } else if (updated[stepIndex]) {
        updated[stepIndex] = { ...updated[stepIndex], status };
      }
      // Mark next step as active if we completed one
      if (status === 'complete' && stepIndex + 1 < updated.length && updated[stepIndex + 1]?.status !== 'complete') {
        updated[stepIndex + 1] = { ...updated[stepIndex + 1], status: 'active' };
      }
      return updated;
    });
  }
```

**Step 2: Add streaming guard ref**

After the existing refs (around line 42), add:

```typescript
  const streamingRef = useRef(false);
```

**Step 3: Add guard to `streamResponse`**

At the top of `streamResponse` (line 120), add:

```typescript
  async function streamResponse(body: ChatRequestBody) {
    if (streamingRef.current) return; // prevent concurrent streams
    streamingRef.current = true;
```

At the end, in the finally block or before each return, clear it. The cleanest approach: wrap the body in try/finally:

```typescript
  async function streamResponse(body: ChatRequestBody) {
    if (streamingRef.current) return;
    streamingRef.current = true;
    setClientState('streaming');
    setError(null);

    try {
      // ... existing fetch and streaming logic (lines 124-198) ...
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setClientState('waiting_for_user');
    } finally {
      streamingRef.current = false;
    }
  }
```

Note: the existing try/catch at lines 124-202 already handles errors. Move the `setClientState('streaming')` and `setError(null)` inside, and wrap with the new try/finally that manages the ref.

**Step 4: Run linter and build**

Run: `npm run lint && npm run build`
Expected: No errors

**Step 5: Commit**

```bash
git add src/app/website/\[id\]/build/page.tsx
git commit -m "fix: mark all intermediate steps complete and add streaming guard"
```

---

### Task 9: Add post-stream advisor bubble parsing and ChatBubble rendering

**Files:**
- Modify: `src/app/website/[id]/build/page.tsx` (import parser, add post-stream split, update ChatBubble)

**Step 1: Import `parseStreamSegments`**

Add to the imports at the top of `page.tsx`:

```typescript
import { parseStreamSegments } from '@/lib/parse-advisor-segments';
```

**Step 2: Add post-stream segment splitting**

In `streamResponse`, after the signal is stripped and the clean text is set (around line 188, after `setMessages` updates the clean text), add segment splitting:

After this block (lines 180-188):
```typescript
      const signalMatch = fullText.match(/\n__SIGNAL__:(.+)$/);
      if (signalMatch) {
        const cleanText = fullText.replace(/\n__SIGNAL__:.+$/, '');
```

Before `handleSignal`, add:

```typescript
        // Split into advisor segments for distinct bubbles
        const segments = parseStreamSegments(cleanText);
        if (segments.length > 1) {
          // Replace the single assistant message with multiple messages
          setMessages((prev) => {
            const withoutLast = prev.slice(0, -1); // remove placeholder
            const newMessages = segments.map((seg) => ({
              role: 'assistant' as const,
              content: seg.content,
              timestamp: new Date().toISOString(),
              ...(seg.type === 'advisor' ? {
                metadata: {
                  advisorConsultation: { advisorId: seg.advisorId, advisorName: seg.advisorName },
                },
              } : {}),
            }));
            return [...withoutLast, ...newMessages];
          });
        } else {
          // No advisor markers — just set clean text (strip markers if any)
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: cleanText };
            }
            return updated;
          });
        }
```

Remove the existing `setMessages` block that sets `cleanText` (lines 181-188) since it's now handled by the segment splitting above.

**Step 3: Update `ChatBubble` component for advisor rendering**

In the `ChatBubble` component (around line 713), update the assistant branch to check for `advisorConsultation`:

```typescript
function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      // ... existing user bubble (unchanged) ...
    );
  }

  const isAdvisor = !!message.metadata?.advisorConsultation;
  const advisorName = message.metadata?.advisorConsultation?.advisorName || '';
  const initials = isAdvisor
    ? advisorName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'JS';
  const displayName = isAdvisor ? advisorName : 'Julian Shapiro';
  const avatarGradient = isAdvisor
    ? 'linear-gradient(135deg, #38bdf8, #2dd4bf)' // blue-teal for advisors
    : 'linear-gradient(135deg, #f97316, #ef4444)'; // coral for Julian

  return (
    <div className="flex gap-3">
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
        style={{ background: avatarGradient }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-zinc-300">{displayName}</span>
          {isAdvisor && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-400 font-medium">
              Advisor
            </span>
          )}
        </div>
        <div className="text-sm text-zinc-300 leading-relaxed prose prose-invert prose-sm max-w-none">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
```

Adapt the above to match the existing JSX structure of ChatBubble (preserve existing class names, card wrapper, etc.). The key changes are:
1. Dynamic `initials` (advisor first+last initials vs "JS")
2. Dynamic `displayName` and `avatarGradient`
3. "Advisor" badge for advisor messages

**Step 4: Run build to verify**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/app/website/\[id\]/build/page.tsx
git commit -m "feat: render advisor responses as distinct chat bubbles with unique avatars"
```

---

### Task 10: Final verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 2: Run linter**

Run: `npm run lint`
Expected: No errors

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Manual smoke test**

Run: `npm run dev`

Test interactive mode:
1. Navigate to `/website/{id}/build` for an idea with foundation docs
2. Select "Build with me" (interactive) mode
3. Verify: Sidebar shows "Extract Ingredients" as active
4. Wait for Julian to finish → verify sidebar advances to step 1
5. Say "continue" → verify sidebar advances through subsequent steps
6. If advisor is consulted, verify: advisor response appears as distinct bubble with blue-teal avatar and "Advisor" badge

Test autonomous mode:
1. Navigate to `/website/{id}/build` for a different idea
2. Select "You've got this" (autonomous) mode
3. Verify: Sidebar progresses through all 8 steps without loops
4. Verify: No "Let me start from the beginning" repetition

Test rebuild (if existing site exists):
1. Navigate to `/website/{id}/build` for an idea with an existing live site
2. Start a build → verify `create_repo` returns `{ reused: true }` in the agent's narration

**Step 5: Commit any remaining fixes**

If smoke testing reveals issues, fix and commit each individually.

---

## Decision Log

### Summary

| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Step tracking mechanism | Auto-infer from tool calls | Explicit calls from agent, frontend-only tracking |
| 2 | Advisor bubble timing | Post-stream parsing | Real-time splitting during streaming |
| 3 | Advisor marker format | `<<<ADVISOR_START>>>` delimiters | `__ADVISOR_START__` underscores, JSON-only markers |
| 4 | consult_advisor step gate | Only advance when currentStep >= 4 | Always advance, never advance |
| 5 | Tool state preloading | Best-effort with try/catch | Required (fail on error), lazy load on first tool |
| 6 | `advanceSessionStep` location | Exported from route.ts | Separate utility file, inline only |

### Appendix: Decision Details

#### Decision 1: Step tracking — auto-infer from tool calls
**Chose:** Map tool names to step indices; scan tools called each round and advance session.
**Why:** The agent already calls specific tools at each step (e.g., `design_brand` during step 1, `assemble_site_files` during step 3). Inferring from tool calls requires zero changes to agent prompts and works automatically even if the agent skips steps or calls tools out of order. The only non-tool step (Write Hero, step 2) advances via the frontend `continue` signal with `body.step`.
**Alternatives rejected:**
- Explicit calls from agent: Would require modifying system prompts and adding a `set_step` tool. Fragile — agent might forget to call it.
- Frontend-only tracking: Can't track what happens inside the agent loop (multiple tools in one stream response).

#### Decision 2: Advisor bubble timing — post-stream parsing
**Chose:** Accumulate raw text during streaming, split into segments after stream completes.
**Why:** During streaming, chunk boundaries are unpredictable — a marker like `<<<ADVISOR_START>>>` could be split across two chunks, causing parse failures. Post-stream parsing operates on the complete text, avoiding chunk boundary issues entirely. Trade-off: during streaming, advisor text appears embedded in Julian's bubble; after stream completes, it splits into distinct bubbles. This is a brief visual transition.
**Alternatives rejected:**
- Real-time splitting: Would require buffering chunks until markers are complete, significantly complicating streaming logic. Risk of markers flashing as raw text during the brief window before parsing.

#### Decision 3: Advisor marker format — `<<<>>>` delimiters
**Chose:** `<<<ADVISOR_START>>>:{"advisorId":"...","advisorName":"..."}` with `<<<ADVISOR_END>>>`.
**Why:** Triple angle brackets are extremely unlikely to appear in natural LLM text or markdown. The JSON payload on the same line as START carries all metadata needed for bubble rendering.
**Alternatives rejected:**
- `__ADVISOR_START__` underscores: Higher collision risk with markdown bold (`__text__`) or Python dunder patterns.
- JSON-only markers: Would require parsing the entire stream as structured data, breaking the plain-text streaming model.

#### Decision 4: consult_advisor step gate — currentStep >= 4
**Chose:** `consult_advisor` only advances the session step when `currentStep >= 4` (past Pressure Test).
**Why:** The agent can consult advisors at any step (e.g., asking Shirin about hero copy at step 2). Without the gate, an early advisor call would jump `currentStep` from 2 to 5, skipping Assemble Page and Pressure Test. The gate ensures advisor calls only advance the step during the dedicated Advisor Review phase (step 5).
**Alternatives rejected:**
- Always advance: Would cause premature step jumping on early advisor calls.
- Never advance: Would require a separate mechanism to detect Advisor Review completion.

#### Decision 5: Tool state preloading — best-effort with try/catch
**Chose:** Preload idea, brand, repo, and Vercel project from database at tool creation time, wrapped in try/catch.
**Why:** On session resume (each API call creates fresh tools), preloaded state means the agent doesn't need to re-call `design_brand` or `create_repo` just to populate closure variables. Best-effort means a Redis timeout doesn't block the entire build — tools fall back to their existing "call X first" guards.
**Alternatives rejected:**
- Required preloading (fail on error): A Redis blip would block the entire build even though tools have their own guards.
- Lazy load on first tool: Would require each tool to individually check the database, adding complexity across 16 tools.

#### Decision 6: `advanceSessionStep` location — exported from route.ts
**Chose:** Define and export from route.ts alongside `determineStreamEndSignal`.
**Why:** Both functions operate on `BuildSession` and are used exclusively by the chat route. Co-locating them keeps the codebase simple. Exporting enables direct unit testing (the existing test file already imports from `../route`).
**Alternatives rejected:**
- Separate utility file: Over-abstraction for two functions used by one route.
- Inline only: Can't unit test without exporting; would need integration tests only.

---

## Verification

1. `npm test` — all tests pass (unit tests for `determineStreamEndSignal`, `advanceSessionStep`, `parseStreamSegments`, advisor marker injection, existing tests unchanged)
2. `npm run lint` — no errors
3. `npm run build` — build succeeds
4. Manual: interactive mode build → sidebar advances through all 8 steps
5. Manual: autonomous mode build → no "start from the beginning" loop
6. Manual: rebuild for existing site → repo reused
7. Manual: advisor consultation → distinct chat bubble with blue-teal avatar

---

## Next Steps

**Recommendation:** Option A (Interactive execution) — this plan has 10 tasks with judgment calls in the frontend rendering (Task 9) and integration wiring (Tasks 3, 6, 8) that benefit from human review at checkpoints.

### Option A: Interactive execution
Copy into a new Claude Code session:
> Use the /aligned:using-git-worktrees skill to create a worktree for branch `fix/website-builder-bugs`. Once the worktree is ready and tests pass, use the /aligned:executing-plans skill to execute the plan at `docs/plans/2026-02-18-website-builder-bugfixes.md`. Note: save the plan to that path and commit before starting execution.

### Option B: Ralph loop execution
First create the worktree, then run from it:
```bash
cd /Users/ericpage/software/epch-projects && git worktree add .worktrees/website-builder-bugs -b fix/website-builder-bugs
cd .worktrees/website-builder-bugs && npm install && ln -sf ../../.env.local .env.local
rm -f .ralph-done && while :; do claude -p "$(cat docs/ralph_loops/EXECUTE-PLAN.md)

Plan: docs/plans/2026-02-18-website-builder-bugfixes.md
Worktree: $(pwd)" && [ -f .ralph-done ] && rm .ralph-done && break; done
```
