# Foundation Document Conversation Editor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add a split-pane editor page where users can directly edit foundation documents and converse with the assigned advisor to request AI-driven changes.

**Source Design Doc:** `docs/plans/2026-02-17-foundation-conversation-editor-design.md`

**Architecture:** New client-side page at `/foundation/[id]/edit/[docType]` with a textarea (left) and advisor chat (right). Streaming chat endpoint at `/api/foundation/[ideaId]/chat` uses the Anthropic SDK's `.messages.stream()` — the first streaming endpoint in this codebase. A client-side state-machine parser handles `<updated_document>` tag extraction across chunk boundaries. Saves go through a new PATCH handler on the existing foundation route.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Anthropic SDK (streaming) / Upstash Redis

---

## Worktree

All implementation work happens in the existing worktree:
```
/Users/ericpage/software/epch-projects/.worktrees/foundation-conversation-editor
```
Branch: `feature/foundation-conversation-editor`

---

### Task 1: Extract DOC_CONFIG to Shared Module

The foundation overview page (`page.tsx`) defines `DOC_CONFIG` inline. The new edit page also needs this data. Extract it to a shared module.

Additionally, `DOC_ADVISOR_MAP` in `src/lib/agent-tools/foundation.ts` is currently not exported. The chat endpoint needs it to resolve advisor IDs. Add the `export` keyword.

**Files:**
- Create: `src/app/foundation/[id]/foundation-config.ts`
- Modify: `src/app/foundation/[id]/page.tsx` (lines 27-39 — remove `DOC_CONFIG`, add import)
- Modify: `src/lib/agent-tools/foundation.ts` (line 14 — add `export` keyword)

**Step 1: Create the shared config module**

Create `src/app/foundation/[id]/foundation-config.ts`:

```typescript
import type { FoundationDocType } from '@/types';

export interface DocConfigEntry {
  type: FoundationDocType;
  label: string;
  advisor: string;
  requires: string | null;
}

export const DOC_CONFIG: DocConfigEntry[] = [
  { type: 'strategy', label: 'Strategy', advisor: 'Seth Godin', requires: null },
  { type: 'positioning', label: 'Positioning Statement', advisor: 'April Dunford', requires: 'Strategy' },
  { type: 'brand-voice', label: 'Brand Voice', advisor: 'Brand Copywriter', requires: 'Positioning' },
  { type: 'design-principles', label: 'Design Principles', advisor: 'Derived', requires: 'Positioning + Strategy' },
  { type: 'seo-strategy', label: 'SEO Strategy', advisor: 'SEO Expert', requires: 'Positioning' },
  { type: 'social-media-strategy', label: 'Social Media Strategy', advisor: 'TBD', requires: 'Brand Voice' },
];
```

**Step 2: Update page.tsx to import from shared module**

In `src/app/foundation/[id]/page.tsx`:
- Remove the inline `DOC_CONFIG` const declaration and its inline type annotation (lines 27-39). There is no separate named type — just the const with an anonymous inline type.
- Add import: `import { DOC_CONFIG } from './foundation-config';`

**Step 3: Export DOC_ADVISOR_MAP**

In `src/lib/agent-tools/foundation.ts` line 14, change:
```typescript
const DOC_ADVISOR_MAP: Record<FoundationDocType, string> = {
```
to:
```typescript
export const DOC_ADVISOR_MAP: Record<FoundationDocType, string> = {
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 5: Run existing tests**

Run: `npm test`
Expected: All existing tests pass (no regressions from the extraction).

**Step 6: Commit**

```
git add src/app/foundation/[id]/foundation-config.ts src/app/foundation/[id]/page.tsx src/lib/agent-tools/foundation.ts
git commit -m "refactor: extract DOC_CONFIG to shared module and export DOC_ADVISOR_MAP"
```

---

### Task 2: Stream Parser — Write Failing Tests

The stream parser is a state machine that processes chunked text responses and separates conversational text from `<updated_document>` content. This is a pure utility with no dependencies — ideal for writing tests first.

**Files:**
- Create: `src/lib/__tests__/parse-stream.test.ts`

**Step 1: Write test file**

Create `src/lib/__tests__/parse-stream.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { StreamParser } from '@/lib/parse-stream';

describe('StreamParser', () => {
  describe('processChunk', () => {
    it('returns all text as chat when no tags present', () => {
      const parser = new StreamParser();
      const result = parser.processChunk('Hello, I think your strategy looks great.');

      expect(result.chatText).toBe('Hello, I think your strategy looks great.');
      expect(result.documentContent).toBeNull();
    });

    it('extracts document content from complete tags in single chunk', () => {
      const parser = new StreamParser();
      const input = 'Here are my changes:<updated_document>New content here</updated_document>Let me know.';
      const result = parser.processChunk(input);

      expect(result.chatText).toBe('Here are my changes:Let me know.');
      expect(result.documentContent).toBe('New content here');
    });

    it('handles tags split across multiple chunks', () => {
      const parser = new StreamParser();

      const r1 = parser.processChunk('I updated it. <updated_');
      expect(r1.chatText).toBe('I updated it. ');
      expect(r1.documentContent).toBeNull();

      const r2 = parser.processChunk('document>The new');
      expect(r2.chatText).toBe('');
      expect(r2.documentContent).toBeNull();

      const r3 = parser.processChunk(' content</updated_document> Done.');
      expect(r3.chatText).toBe(' Done.');
      expect(r3.documentContent).toBe('The new content');
    });

    it('handles closing tag split across chunks', () => {
      const parser = new StreamParser();

      parser.processChunk('<updated_document>Content here');
      const r2 = parser.processChunk('</updated_');
      expect(r2.documentContent).toBeNull();

      const r3 = parser.processChunk('document>After.');
      expect(r3.documentContent).toBe('Content here');
      expect(r3.chatText).toBe('After.');
    });

    it('uses last document block when multiple blocks present', () => {
      const parser = new StreamParser();
      const input = '<updated_document>First</updated_document>Middle<updated_document>Second</updated_document>End';
      const result = parser.processChunk(input);

      // Both blocks yield documentContent, but the caller should use the last one
      // The parser returns documentContent for each closing tag it encounters
      expect(result.chatText).toBe('MiddleEnd');
      expect(result.documentContent).toBe('Second');
    });

    it('handles empty document between tags', () => {
      const parser = new StreamParser();
      const result = parser.processChunk('Text<updated_document></updated_document>More');

      expect(result.chatText).toBe('TextMore');
      expect(result.documentContent).toBe('');
    });

    it('flushes partial non-matching tag to chat text', () => {
      const parser = new StreamParser();
      const result = parser.processChunk('Check <ul>list</ul> here');

      expect(result.chatText).toBe('Check <ul>list</ul> here');
      expect(result.documentContent).toBeNull();
    });

    it('handles document content with HTML-like content inside', () => {
      const parser = new StreamParser();
      const result = parser.processChunk('<updated_document># Strategy\n\n- Point <strong>one</strong></updated_document>');

      expect(result.documentContent).toBe('# Strategy\n\n- Point <strong>one</strong>');
      expect(result.chatText).toBe('');
    });

    it('handles character-by-character streaming', () => {
      const parser = new StreamParser();
      const fullText = 'Hi<updated_document>Doc</updated_document>End';
      let chatText = '';
      let lastDocContent: string | null = null;

      for (const char of fullText) {
        const r = parser.processChunk(char);
        chatText += r.chatText;
        if (r.documentContent !== null) lastDocContent = r.documentContent;
      }

      expect(chatText).toBe('HiEnd');
      expect(lastDocContent).toBe('Doc');
    });
  });

  describe('finalize', () => {
    it('returns no error when stream completed normally', () => {
      const parser = new StreamParser();
      parser.processChunk('Just chat text.');
      const result = parser.finalize();

      expect(result.error).toBeUndefined();
    });

    it('returns error when stream ends inside document content', () => {
      const parser = new StreamParser();
      parser.processChunk('<updated_document>Partial content');
      const result = parser.finalize();

      expect(result.error).toBe('Response interrupted — document unchanged');
    });

    it('returns error when stream ends during closing tag', () => {
      const parser = new StreamParser();
      parser.processChunk('<updated_document>Content</updated_');
      const result = parser.finalize();

      expect(result.error).toBe('Response interrupted — document unchanged');
    });

    it('returns no error when stream ends during a non-matching open tag', () => {
      const parser = new StreamParser();
      parser.processChunk('Text <updated_');
      const result = parser.finalize();

      // Partial open tag at end of stream is just chat text, not an error
      expect(result.error).toBeUndefined();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/parse-stream.test.ts`
Expected: FAIL — module `@/lib/parse-stream` not found.

**Step 3: Commit**

```
git add src/lib/__tests__/parse-stream.test.ts
git commit -m "test: add failing tests for stream parser"
```

---

### Task 3: Stream Parser — Implementation

**Files:**
- Create: `src/lib/parse-stream.ts`

**Step 1: Implement the stream parser**

Create `src/lib/parse-stream.ts`:

```typescript
const OPEN_TAG = '<updated_document>';
const CLOSE_TAG = '</updated_document>';

type ParserState = 'text' | 'maybe-open' | 'content' | 'maybe-close';

export class StreamParser {
  private state: ParserState = 'text';
  private tagBuffer = '';
  private documentBuffer = '';

  processChunk(chunk: string): { chatText: string; documentContent: string | null } {
    let chatText = '';
    let documentContent: string | null = null;

    for (const char of chunk) {
      switch (this.state) {
        case 'text':
          if (char === '<') {
            this.state = 'maybe-open';
            this.tagBuffer = '<';
          } else {
            chatText += char;
          }
          break;

        case 'maybe-open':
          this.tagBuffer += char;
          if (OPEN_TAG.startsWith(this.tagBuffer)) {
            if (this.tagBuffer === OPEN_TAG) {
              this.state = 'content';
              this.documentBuffer = '';
              this.tagBuffer = '';
            }
          } else {
            chatText += this.tagBuffer;
            this.tagBuffer = '';
            this.state = 'text';
          }
          break;

        case 'content':
          if (char === '<') {
            this.state = 'maybe-close';
            this.tagBuffer = '<';
          } else {
            this.documentBuffer += char;
          }
          break;

        case 'maybe-close':
          this.tagBuffer += char;
          if (CLOSE_TAG.startsWith(this.tagBuffer)) {
            if (this.tagBuffer === CLOSE_TAG) {
              documentContent = this.documentBuffer;
              this.documentBuffer = '';
              this.tagBuffer = '';
              this.state = 'text';
            }
          } else {
            this.documentBuffer += this.tagBuffer;
            this.tagBuffer = '';
            this.state = 'content';
          }
          break;
      }
    }

    return { chatText, documentContent };
  }

  finalize(): { error?: string } {
    if (this.state === 'content' || this.state === 'maybe-close') {
      return { error: 'Response interrupted — document unchanged' };
    }
    return {};
  }
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/parse-stream.test.ts`
Expected: All tests PASS.

**Step 3: Commit**

```
git add src/lib/parse-stream.ts
git commit -m "feat: implement stream parser for updated_document tag extraction"
```

---

### Task 4: PATCH Handler — Write Failing Tests

Add a PATCH handler to the existing foundation route to persist document edits. Write tests first.

**Files:**
- Modify: `src/app/api/foundation/[ideaId]/__tests__/route.test.ts`

**Step 1: Update mocks and imports**

In `src/app/api/foundation/[ideaId]/__tests__/route.test.ts`:

Replace the entire `vi.mock('@/lib/db', ...)` block (lines 5-9) with this expanded version that adds `getFoundationDoc` and `saveFoundationDoc`:

```typescript
vi.mock('@/lib/db', () => ({
  isRedisConfigured: vi.fn(),
  getAllFoundationDocs: vi.fn(),
  getFoundationProgress: vi.fn(),
  getFoundationDoc: vi.fn(),
  saveFoundationDoc: vi.fn(),
}));
```

Update the import line to include the new functions:

```typescript
import { isRedisConfigured, getAllFoundationDocs, getFoundationProgress, getFoundationDoc, saveFoundationDoc } from '@/lib/db';
```

Update the route import to include PATCH:

```typescript
import { GET, POST, PATCH } from '@/app/api/foundation/[ideaId]/route';
```

**Step 2: Add PATCH test cases**

Add a new `describe('PATCH', ...)` block after the existing POST tests:

```typescript
  describe('PATCH', () => {
    it('saves updated content and returns updated doc', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationDoc).mockResolvedValue({
        id: 'strategy',
        ideaId: 'idea-123',
        type: 'strategy',
        content: 'Original content',
        advisorId: 'seth-godin',
        generatedAt: '2026-01-01T00:00:00.000Z',
        editedAt: null,
        version: 1,
      });
      vi.mocked(saveFoundationDoc).mockResolvedValue();

      const res = await PATCH(
        makeRequest('PATCH', { docType: 'strategy', content: 'Updated content' }),
        { params },
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.content).toBe('Updated content');
      expect(body.version).toBe(2);
      expect(body.editedAt).toBeTruthy();
      expect(saveFoundationDoc).toHaveBeenCalledWith('idea-123', expect.objectContaining({
        content: 'Updated content',
        version: 2,
      }));
    });

    it('returns 404 when document does not exist', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationDoc).mockResolvedValue(null);

      const res = await PATCH(
        makeRequest('PATCH', { docType: 'strategy', content: 'Updated' }),
        { params },
      );

      expect(res.status).toBe(404);
    });

    it('returns 400 when docType is missing', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);

      const res = await PATCH(
        makeRequest('PATCH', { content: 'Updated' }),
        { params },
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when content is missing', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);

      const res = await PATCH(
        makeRequest('PATCH', { docType: 'strategy' }),
        { params },
      );

      expect(res.status).toBe(400);
    });

    it('returns 500 when Redis is not configured', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(false);

      const res = await PATCH(
        makeRequest('PATCH', { docType: 'strategy', content: 'Updated' }),
        { params },
      );

      expect(res.status).toBe(500);
    });

    it('returns 500 when saveFoundationDoc throws', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationDoc).mockResolvedValue({
        id: 'strategy',
        ideaId: 'idea-123',
        type: 'strategy',
        content: 'Original',
        advisorId: 'seth-godin',
        generatedAt: '2026-01-01T00:00:00.000Z',
        editedAt: null,
        version: 1,
      });
      vi.mocked(saveFoundationDoc).mockRejectedValue(new Error('Connection lost'));

      const res = await PATCH(
        makeRequest('PATCH', { docType: 'strategy', content: 'Updated' }),
        { params },
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    });

    it('returns 500 when getFoundationDoc throws', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationDoc).mockRejectedValue(new Error('Redis timeout'));

      const res = await PATCH(
        makeRequest('PATCH', { docType: 'strategy', content: 'Updated' }),
        { params },
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    });
  });
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/foundation/[ideaId]/__tests__/route.test.ts`
Expected: FAIL — `PATCH` is not exported from the route module.

**Step 3: Commit**

```
git add src/app/api/foundation/[ideaId]/__tests__/route.test.ts
git commit -m "test: add failing tests for PATCH foundation handler"
```

---

### Task 5: PATCH Handler — Implementation

**Files:**
- Modify: `src/app/api/foundation/[ideaId]/route.ts`

**Step 1: Add imports**

Add `getFoundationDoc` and `saveFoundationDoc` to the import from `@/lib/db`:

```typescript
import { isRedisConfigured, getAllFoundationDocs, getFoundationProgress, getFoundationDoc, saveFoundationDoc } from '@/lib/db';
```

Add the `FoundationDocType` type import:

```typescript
import type { StrategicInputs, FoundationDocType } from '@/types';
```

**Step 2: Add the PATCH handler**

**Behavioral note:** After a successful PATCH, the overview page will show the "Edited" badge on the next poll because setting `editedAt` transitions the card state from `'generated'` to `'edited'` (see `getCardState()` in `page.tsx` line 78: `if (doc?.editedAt) return 'edited'`).

Add after the existing `GET` function (after line 104):

```typescript
// PATCH — save edits to a specific foundation document
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> },
) {
  const { ideaId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  let body: { docType?: FoundationDocType; content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.docType || typeof body.content !== 'string') {
    return NextResponse.json({ error: 'Missing docType or content' }, { status: 400 });
  }

  try {
    const doc = await getFoundationDoc(ideaId, body.docType);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    doc.content = body.content;
    doc.editedAt = new Date().toISOString();
    doc.version += 1;

    await saveFoundationDoc(ideaId, doc);

    return NextResponse.json(doc);
  } catch (error) {
    console.error('Error saving foundation doc:', error);
    return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
  }
}
```

**Step 3: Run tests to verify they pass**

Run: `npx vitest run src/app/api/foundation/[ideaId]/__tests__/route.test.ts`
Expected: All tests PASS (including new PATCH tests and existing GET/POST tests).

**Step 4: Commit**

```
git add src/app/api/foundation/[ideaId]/route.ts
git commit -m "feat: add PATCH handler for saving foundation doc edits"
```

---

### Task 6: Chat API Endpoint — Write Failing Tests

The streaming chat endpoint is the first streaming API route in this codebase.

**Files:**
- Create: `src/app/api/foundation/[ideaId]/chat/__tests__/route.test.ts`

**Step 1: Write test file**

Create `src/app/api/foundation/[ideaId]/chat/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  isRedisConfigured: vi.fn(),
  getFoundationDoc: vi.fn(),
}));

vi.mock('@/lib/anthropic', () => ({
  getAnthropic: vi.fn(),
}));

vi.mock('@/lib/advisors/prompt-loader', () => ({
  getAdvisorSystemPrompt: vi.fn(),
}));

vi.mock('@/lib/agent-tools/foundation', () => ({
  DOC_ADVISOR_MAP: {
    'strategy': 'seth-godin',
    'positioning': 'april-dunford',
    'brand-voice': 'copywriter',
    'design-principles': 'richard-rumelt',
    'seo-strategy': 'seo-expert',
    'social-media-strategy': 'april-dunford',
  },
}));

import { POST } from '@/app/api/foundation/[ideaId]/chat/route';
import { isRedisConfigured, getFoundationDoc } from '@/lib/db';
import { getAnthropic } from '@/lib/anthropic';
import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/foundation/idea-123/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const params = Promise.resolve({ ideaId: 'idea-123' });

function createMockStream(texts: string[]) {
  let index = 0;
  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (index < texts.length) {
            return {
              value: { type: 'content_block_delta', delta: { type: 'text_delta', text: texts[index++] } },
              done: false,
            };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}

async function readStream(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  return text;
}

describe('Foundation Chat API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('streams advisor response for valid request', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getFoundationDoc).mockResolvedValue({
      id: 'strategy', ideaId: 'idea-123', type: 'strategy',
      content: 'Original', advisorId: 'seth-godin',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
    });
    vi.mocked(getAdvisorSystemPrompt).mockReturnValue('You are Seth Godin...');

    const mockStream = createMockStream(['Hello', ' there']);
    vi.mocked(getAnthropic).mockReturnValue({
      messages: { stream: vi.fn().mockReturnValue(mockStream) },
    } as unknown as ReturnType<typeof getAnthropic>);

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Make it more bold' }],
      currentContent: 'Original content',
    }), { params });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');

    const text = await readStream(res);
    expect(text).toBe('Hello there');
  });

  it('calls Anthropic with correct system prompt structure', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getFoundationDoc).mockResolvedValue({
      id: 'strategy', ideaId: 'idea-123', type: 'strategy',
      content: 'Original', advisorId: 'seth-godin',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
    });
    vi.mocked(getAdvisorSystemPrompt).mockReturnValue('You are Seth Godin...');

    const mockStreamFn = vi.fn().mockReturnValue(createMockStream(['OK']));
    vi.mocked(getAnthropic).mockReturnValue({
      messages: { stream: mockStreamFn },
    } as unknown as ReturnType<typeof getAnthropic>);

    await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'My doc content',
    }), { params });

    expect(mockStreamFn).toHaveBeenCalledWith(expect.objectContaining({
      system: expect.stringContaining('You are Seth Godin'),
    }));
    expect(mockStreamFn).toHaveBeenCalledWith(expect.objectContaining({
      system: expect.stringContaining('My doc content'),
    }));
    expect(mockStreamFn).toHaveBeenCalledWith(expect.objectContaining({
      system: expect.stringContaining('<updated_document>'),
    }));
    expect(getAdvisorSystemPrompt).toHaveBeenCalledWith('seth-godin');
  });

  it('returns 400 when docType is missing', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);

    const res = await POST(makeRequest({
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Content',
    }), { params });

    expect(res.status).toBe(400);
  });

  it('returns 400 when messages is missing', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);

    const res = await POST(makeRequest({
      docType: 'strategy',
      currentContent: 'Content',
    }), { params });

    expect(res.status).toBe(400);
  });

  it('returns 400 when currentContent is missing', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
    }), { params });

    expect(res.status).toBe(400);
  });

  it('returns 404 when foundation doc does not exist', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getFoundationDoc).mockResolvedValue(null);

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Content',
    }), { params });

    expect(res.status).toBe(404);
  });

  it('returns 500 when Redis is not configured', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(false);

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Content',
    }), { params });

    expect(res.status).toBe(500);
  });

  it('returns 500 when ANTHROPIC_API_KEY is missing', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getFoundationDoc).mockResolvedValue({
      id: 'strategy', ideaId: 'idea-123', type: 'strategy',
      content: 'Original', advisorId: 'seth-godin',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
    });
    delete process.env.ANTHROPIC_API_KEY;

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Content',
    }), { params });

    expect(res.status).toBe(500);
  });

  it('returns 500 when getFoundationDoc throws', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getFoundationDoc).mockRejectedValue(new Error('Redis error'));

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Content',
    }), { params });

    expect(res.status).toBe(500);
  });

  it('returns 500 when advisor prompt cannot be loaded', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getFoundationDoc).mockResolvedValue({
      id: 'strategy', ideaId: 'idea-123', type: 'strategy',
      content: 'Original', advisorId: 'seth-godin',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
    });
    vi.mocked(getAdvisorSystemPrompt).mockImplementation(() => {
      throw new Error('Unknown advisor: invalid-id');
    });

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Content',
    }), { params });

    expect(res.status).toBe(500);
  });

  it('returns 500 when stream creation fails', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getFoundationDoc).mockResolvedValue({
      id: 'strategy', ideaId: 'idea-123', type: 'strategy',
      content: 'Original', advisorId: 'seth-godin',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
    });
    vi.mocked(getAdvisorSystemPrompt).mockReturnValue('You are Seth Godin...');
    vi.mocked(getAnthropic).mockReturnValue({
      messages: { stream: vi.fn().mockImplementation(() => { throw new Error('API error'); }) },
    } as unknown as ReturnType<typeof getAnthropic>);

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Content',
    }), { params });

    expect(res.status).toBe(500);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/foundation/[ideaId]/chat/__tests__/route.test.ts`
Expected: FAIL — module not found (route doesn't exist yet).

**Step 3: Commit**

```
git add src/app/api/foundation/[ideaId]/chat/__tests__/route.test.ts
git commit -m "test: add failing tests for foundation chat streaming endpoint"
```

---

### Task 7: Chat API Endpoint — Implementation

**Files:**
- Create: `src/app/api/foundation/[ideaId]/chat/route.ts`

**Step 1: Implement the streaming chat endpoint**

**Behavioral note:** Once the `ReadableStream` Response is returned (HTTP 200 headers committed), mid-stream errors cannot change the status code. The `controller.error()` call closes the stream; the client-side `reader.read()` will throw and the UI catches it (Task 8's `handleSend` try/catch). This is an intentional departure from the JSON error response pattern in non-streaming routes — it is structural to how HTTP streaming works.

Create `src/app/api/foundation/[ideaId]/chat/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured, getFoundationDoc } from '@/lib/db';
import { getAnthropic } from '@/lib/anthropic';
import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';
import { DOC_ADVISOR_MAP } from '@/lib/agent-tools/foundation';
import { CLAUDE_MODEL } from '@/lib/config';
import type { FoundationDocType } from '@/types';

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> },
) {
  const { ideaId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  let body: {
    docType?: FoundationDocType;
    messages?: { role: 'user' | 'assistant'; content: string }[];
    currentContent?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.docType || !body.messages || typeof body.currentContent !== 'string') {
    return NextResponse.json({ error: 'Missing docType, messages, or currentContent' }, { status: 400 });
  }

  try {
    const doc = await getFoundationDoc(ideaId, body.docType);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const advisorId = DOC_ADVISOR_MAP[body.docType];
    const advisorPrompt = getAdvisorSystemPrompt(advisorId);

    const systemPrompt = `${advisorPrompt}

---

You are helping the user refine their ${body.docType} document through conversation.

CURRENT DOCUMENT:
${body.currentContent}

RULES:
- When the user asks you to change the document, make ONLY the requested changes. Do not rewrite, rephrase, or "improve" sections they didn't ask about.
- After making changes, include the full updated document between <updated_document> tags.
- If the user asks a question without requesting changes, respond conversationally without tags.
- Keep your conversational response brief — focus on what you changed and why.`;

    const stream = getAnthropic().messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: body.messages,
    });

    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            for await (const event of stream) {
              if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                controller.enqueue(new TextEncoder().encode(event.delta.text));
              }
            }
            controller.close();
          } catch (error) {
            console.error('Stream error:', error);
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
  } catch (error) {
    console.error('Error in foundation chat:', error);
    return NextResponse.json({ error: 'Failed to start conversation' }, { status: 500 });
  }
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run src/app/api/foundation/[ideaId]/chat/__tests__/route.test.ts`
Expected: All tests PASS.

**Step 3: Run all tests to verify no regressions**

Run: `npm test`
Expected: All tests pass.

**Step 4: Commit**

```
git add src/app/api/foundation/[ideaId]/chat/route.ts
git commit -m "feat: add streaming chat endpoint for foundation document editing"
```

---

### Task 8: Editor Page — Layout, Document Editor, and Save

Build the editor page with the split-pane layout, document editing textarea, toolbar with save, and unsaved changes warning.

**Design note:** The stream parser routes document content to `result.documentContent` and conversational text to `result.chatText`. Only `chatText` is stored in `messages[]`, satisfying the design requirement to strip `<updated_document>` blocks from conversation history. The current document is sent separately as `currentContent` on each API call, so including it in message history would be redundant and waste tokens.

**Files:**
- Create: `src/app/foundation/[id]/edit/[docType]/page.tsx`

**Step 1: Create the editor page**

Create `src/app/foundation/[id]/edit/[docType]/page.tsx`:

```typescript
'use client';

import { useEffect, useState, useCallback, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { FoundationDocument, FoundationDocType } from '@/types';
import { DOC_CONFIG } from '../../foundation-config';
import { StreamParser } from '@/lib/parse-stream';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface PageProps {
  params: Promise<{ id: string; docType: string }>;
}

const MAX_MESSAGES_TO_SEND = 20;

export default function FoundationEditorPage({ params }: PageProps) {
  const { id: ideaId, docType: docTypeParam } = use(params);
  const router = useRouter();
  const docType = docTypeParam as FoundationDocType;
  const config = DOC_CONFIG.find((c) => c.type === docType);

  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [previousContent, setPreviousContent] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatInput, setChatInput] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const hasUnsavedChanges = content !== savedContent;

  // Fetch foundation doc on mount
  useEffect(() => {
    async function fetchDoc() {
      try {
        const res = await fetch(`/api/foundation/${ideaId}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        const doc: FoundationDocument | undefined = data.docs?.[docType];
        if (!doc) {
          router.replace(`/foundation/${ideaId}`);
          return;
        }
        setContent(doc.content);
        setSavedContent(doc.content);
      } catch {
        setError('Failed to load document');
      } finally {
        setLoading(false);
      }
    }
    fetchDoc();
  }, [ideaId, docType, router]);

  // Warn on navigate away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/foundation/${ideaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docType, content }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSavedContent(content);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [ideaId, docType, content]);

  const handleSend = useCallback(async () => {
    const message = chatInput.trim();
    if (!message || isStreaming) return;

    setChatInput('');
    const userMessage: ChatMessage = { role: 'user', content: message };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsStreaming(true);
    setError(null);

    // Send only last N messages to API
    const messagesToSend = updatedMessages.slice(-MAX_MESSAGES_TO_SEND);

    try {
      const res = await fetch(`/api/foundation/${ideaId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docType, messages: messagesToSend, currentContent: content }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Chat request failed');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      const parser = new StreamParser();
      let chatText = '';

      // Add placeholder assistant message
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const result = parser.processChunk(chunk);
        chatText += result.chatText;

        // Update assistant message in real-time
        const currentChatText = chatText;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: currentChatText };
          return updated;
        });

        // If document content arrived, update editor
        if (result.documentContent !== null) {
          setContent((currentContent) => {
            setPreviousContent(currentContent);
            return result.documentContent!;
          });
        }
      }

      const finalResult = parser.finalize();
      if (finalResult.error) {
        chatText += `\n\n_${finalResult.error}_`;
        const finalChatText = chatText;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: finalChatText };
          return updated;
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get response';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `_Error: ${errorMsg}. Please try again._` },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }, [chatInput, isStreaming, messages, ideaId, docType, content]);

  const handleRevert = useCallback(() => {
    if (previousContent !== null) {
      setContent(previousContent);
      setPreviousContent(null);
    }
  }, [previousContent]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading...</span>
      </div>
    );
  }

  const truncationIndex = messages.length > MAX_MESSAGES_TO_SEND
    ? messages.length - MAX_MESSAGES_TO_SEND
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 8rem)' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.75rem 0', borderBottom: '1px solid var(--border-subtle)',
        marginBottom: '0.75rem', flexShrink: 0,
      }}>
        <div>
          <Link
            href={`/foundation/${ideaId}`}
            style={{
              fontSize: '0.8125rem', color: 'var(--text-muted)', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
            }}
          >
            ← Back to overview
          </Link>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.25rem',
            letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: '0.25rem 0 0',
          }}>
            {config?.label || docType} — {config?.advisor || 'Advisor'}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {previousContent !== null && previousContent !== content && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleRevert}
              style={{ fontSize: '0.8125rem' }}
            >
              Revert last AI change
            </button>
          )}
          {error && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>{error}</span>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
          >
            {isSaving ? 'Saving...' : 'Save'}
            {hasUnsavedChanges && !isSaving && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--accent-coral)', display: 'inline-block',
              }} />
            )}
          </button>
        </div>
      </div>

      {/* Split panes */}
      <div style={{ flex: 1, display: 'flex', gap: '1rem', minHeight: 0 }}>
        {/* Left pane — Document Editor */}
        <div style={{ flex: '0 0 60%', display: 'flex', flexDirection: 'column' }}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{
              flex: 1, width: '100%', resize: 'none',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              fontSize: '0.8125rem', lineHeight: 1.6,
              padding: '1rem', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)', background: 'var(--bg-card)',
              color: 'var(--text-primary)', outline: 'none',
            }}
            spellCheck={false}
          />
        </div>

        {/* Right pane — Advisor Chat */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
          background: 'var(--bg-card)', overflow: 'hidden',
        }}>
          {/* Messages */}
          <div
            ref={chatContainerRef}
            style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}
          >
            {messages.length === 0 && (
              <p style={{
                color: 'var(--text-muted)', fontSize: '0.8125rem',
                textAlign: 'center', paddingTop: '2rem',
              }}>
                Ask {config?.advisor || 'the advisor'} to help refine your document.
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{ marginBottom: '1rem' }}>
                {truncationIndex > 0 && i === 0 && i < truncationIndex && (
                  <div style={{
                    fontSize: '0.6875rem', color: 'var(--text-muted)',
                    textAlign: 'center', padding: '0.5rem', marginBottom: '0.5rem',
                    background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
                  }}>
                    Earlier messages not sent to advisor
                  </div>
                )}
                <div style={{
                  fontSize: '0.8125rem',
                  color: i < truncationIndex ? 'var(--text-muted)' : 'var(--text-primary)',
                  opacity: i < truncationIndex ? 0.6 : 1,
                }}>
                  <span style={{
                    fontWeight: 600, fontSize: '0.6875rem',
                    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
                    color: msg.role === 'user' ? 'var(--accent-coral)' : 'var(--text-muted)',
                  }}>
                    {msg.role === 'user' ? 'You' : config?.advisor || 'Advisor'}
                  </span>
                  <div style={{ marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                    {isStreaming && i === messages.length - 1 && msg.role === 'assistant' && (
                      <span style={{
                        display: 'inline-block', width: 6, height: 14,
                        background: 'var(--text-muted)', marginLeft: 2,
                        animation: 'pulse 1s ease-in-out infinite',
                      }} />
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            style={{
              display: 'flex', gap: '0.5rem', padding: '0.75rem',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={isStreaming ? 'Waiting for response...' : 'Type a message...'}
              disabled={isStreaming}
              style={{
                flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.8125rem',
                border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={isStreaming || !chatInput.trim()}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```
git add src/app/foundation/[id]/edit/[docType]/page.tsx
git commit -m "feat: add foundation document conversation editor page"
```

---

### Task 9: Wire Up Link in ExpandedDocCard

Replace the disabled "Update via conversation" `<span>` with a `<Link>` to the edit page. Add `ideaId` as a prop.

**Files:**
- Modify: `src/app/foundation/[id]/ExpandedDocCard.tsx` (lines 8-21 props, lines 101-111 span)
- Modify: `src/app/foundation/[id]/page.tsx` (line 258 — pass `ideaId` prop)

**Step 1: Add ideaId prop to ExpandedDocCard**

In `src/app/foundation/[id]/ExpandedDocCard.tsx`:

Add the import for Link:
```typescript
import Link from 'next/link';
```

Add `ideaId: string;` to the `ExpandedDocCardProps` interface (after line 9):
```typescript
interface ExpandedDocCardProps {
  ideaId: string;
  type: FoundationDocType;
  // ... rest unchanged
}
```

Add `ideaId` to the destructured props (line 23):
```typescript
export default function ExpandedDocCard({
  ideaId, type, label, advisor, doc, idx, generating, isRunning,
  // ... rest unchanged
```

**Step 2: Replace the disabled span with a Link**

Replace the `<span>` block (lines 101-111) with:

```typescript
          <Link
            href={`/foundation/${ideaId}/edit/${type}`}
            style={{
              fontSize: '0.875rem', color: 'var(--accent-coral)',
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              fontWeight: 500, textDecoration: 'none',
            }}
          >
            <ChatIcon />
            Update via conversation
          </Link>
```

**Step 3: Pass ideaId in page.tsx**

In `src/app/foundation/[id]/page.tsx`, find the `<ExpandedDocCard` JSX (around line 258) and add the `ideaId` prop:

```typescript
            <ExpandedDocCard
              key={type}
              ideaId={ideaId}
              type={type}
              // ... rest unchanged
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 5: Run all tests**

Run: `npm test`
Expected: All tests pass.

**Step 6: Commit**

```
git add src/app/foundation/[id]/ExpandedDocCard.tsx src/app/foundation/[id]/page.tsx
git commit -m "feat: wire up Update via conversation link to editor page"
```

---

### Task 10: Integration Verification and Architecture Doc Update

**Files:**
- Modify: `docs/architecture.md`

**Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass.

**Step 3: Run lint**

Run: `npm run lint`
Expected: No lint errors.

**Step 4: Update architecture doc — API Routes table**

In `docs/architecture.md`, find the API Routes section's Foundation row (around line 696). Add a new row after it:

```markdown
| Foundation Chat | `/api/foundation/[ideaId]/chat` | POST | Streaming advisor conversation for document editing |
```

Also update the existing Foundation row to include PATCH:

```markdown
| Foundation | `/api/foundation/[ideaId]` | POST, GET, PATCH | POST triggers generation; GET returns docs + progress; PATCH saves edits |
```

**Step 5: Update architecture doc — Pages table**

In the Pages section, find the Foundation Tab entry. Note: its path is stale — `src/app/analyses/[id]/foundation/page.tsx` should be `src/app/foundation/[id]/page.tsx`. Correct it, then add a new row after it:

```markdown
| Foundation Editor | `src/app/foundation/[id]/edit/[docType]/page.tsx` | Split-pane document editor with advisor chat |
```

**Step 6: Update architecture doc — Mermaid diagram**

In the API Routes subgraph in the High-Level Architecture Mermaid diagram, add:

```mermaid
API_FOUNDATION_CHAT["/api/foundation/[ideaId]/chat<br/>POST streaming chat"]
```

In the Client subgraph, add:

```mermaid
FOUNDATION_EDIT["/foundation/[id]/edit/[docType]<br/>Document editor"]
```

**Step 7: Commit**

```
git add docs/architecture.md
git commit -m "docs: update architecture doc with foundation editor route and page"
```

---

## Decision Log

### Summary

| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Stream parser location | `src/lib/parse-stream.ts` (shared lib) | Inline in page component, app-level utility |
| 2 | Editor page structure | Single page.tsx with inline sections | Separate DocumentEditor.tsx and AdvisorChat.tsx files |
| 3 | DOC_CONFIG extraction | Named export from sibling module | Move to `src/lib/` shared, keep inline and duplicate |
| 4 | Chat state management | React useState in page component | useReducer, context, external state library |
| 5 | Streaming response format | Raw text stream (not SSE) | Server-Sent Events, JSON chunks |

### Appendix: Decision Details

#### Decision 1: Stream parser as shared lib module
**Chose:** `src/lib/parse-stream.ts`
**Why:** The stream parser is a pure utility with no framework dependencies. Placing it in `src/lib/` follows the existing codebase pattern where utilities live (e.g., `llm-utils.ts`, `utils.ts`). This makes it independently testable and potentially reusable if other streaming endpoints are added later.
**Alternatives rejected:**
- Inline in page component: Would make the page file very large and the parser untestable in isolation.
- App-level utility: No precedent for utilities in `src/app/` in this codebase.

#### Decision 2: Single page.tsx with inline sections
**Chose:** Single file for the editor page
**Why:** The design doc explicitly says "Simple, functional, not pretty." The DocumentEditor is essentially just a textarea, and the AdvisorChat is a message list + input. Neither is complex enough to warrant separate files. All state lives in the page component. This matches the design doc's architecture description where the page manages everything. If the components grow in complexity, they can be extracted later.
**Alternatives rejected:**
- Separate component files: The existing pattern (ExpandedDocCard, CollapsedDocCard) uses separate files. A single file is chosen for v1 simplicity — all state lives in the page component so extraction would require prop drilling. Refactoring into separate files is straightforward if the components grow.

#### Decision 3: DOC_CONFIG extraction to sibling module
**Chose:** `src/app/foundation/[id]/foundation-config.ts`
**Why:** Both the overview page and the edit page need DOC_CONFIG. Extracting it to a file in the same directory keeps it co-located with its consumers and follows the "move shared code to nearest common ancestor" pattern. The design doc explicitly specifies this approach.
**Alternatives rejected:**
- Move to `src/lib/`: DOC_CONFIG is presentation-layer data (labels, display names). It doesn't belong in the lib layer alongside data access and business logic.
- Duplicate in both files: Violates DRY — changes would need to be made in two places.

#### Decision 4: useState for chat state
**Chose:** React useState hooks in the page component
**Why:** The state shape is simple (content, messages, flags). There are no complex state transitions that would benefit from useReducer. The design doc specifies state as simple variables in the page component. Adding useReducer or context would be over-engineering for a single-page feature with 6 state variables.
**Alternatives rejected:**
- useReducer: Would add ceremony without benefit for this simple state shape.
- External state library: No state management library is used anywhere in this codebase.

#### Decision 5: Raw text stream (not SSE)
**Chose:** Raw text stream with `text/plain` content type
**Why:** The design doc specifies this approach — `ReadableStream` with `TextEncoder` piping text deltas directly. SSE adds protocol overhead (event framing, `data:` prefixes) that isn't needed when the stream is a single text response. The client reads via `response.body.getReader()` which works naturally with raw text. This is also the simplest approach for the first streaming endpoint in the codebase.
**Alternatives rejected:**
- Server-Sent Events: Adds unnecessary protocol complexity. SSE is designed for multiple event types and reconnection, neither of which is needed here.
- JSON chunks: Would require framing each chunk as JSON and parsing on the client, adding complexity with no benefit for a text stream.
