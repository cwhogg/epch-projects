# Foundation Document Conversation Editor

**Date:** 2026-02-17
**Status:** Draft

## Problem

Foundation documents can only be regenerated from scratch. Users have no way to make targeted edits or ask the advisor to refine specific sections. The "Update via conversation" button exists but is disabled.

## Solution

A split-pane editor page where users can directly edit the document (left pane) and converse with the assigned advisor to request AI-driven changes (right pane). Simple, functional, not pretty.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Navigation | New route `/foundation/[id]/edit/[docType]` | Clean separation from the overview page |
| AI edit model | Direct apply (full replacement) | Simple parsing, no merge conflicts, docs are small |
| Persona | Keep advisor persona | Voice consistency with generated content |
| Content drift mitigation | Strong prompting + don't save until user clicks Save | User controls when changes persist |

## Architecture

### New Route

`/foundation/[id]/edit/[docType]/page.tsx` — client component.

On mount:
1. Fetch the foundation doc via GET `/api/foundation/{ideaId}`
2. Extract the specific doc by `docType` param
3. If doc doesn't exist, redirect to `/foundation/{ideaId}`
4. Load the advisor name and label from `DOC_CONFIG` (extracted to shared module — see File Inventory)

### Page Layout

```
+---------------------------------------------------+
| [< Back to overview]              [Save] (dot if unsaved) |
| Strategy — Seth Godin                                     |
+---------------------------+---------------------------+
|                           |                           |
|   Document Editor         |   Advisor Chat            |
|   (textarea, full height) |   (message list)          |
|                           |                           |
|   User edits directly     |   User: "make tone more   |
|   in markdown             |          playful"         |
|                           |                           |
|                           |   Seth Godin: "I've       |
|                           |   loosened up the          |
|                           |   language..."             |
|                           |                           |
|                           |   [Type a message...]     |
+---------------------------+---------------------------+
```

Two-pane flexbox layout. Left pane ~60% width, right pane ~40%. Full viewport height minus toolbar.

### State (all in page component)

```typescript
content: string              // current document markdown (shared: editor + chat can update)
savedContent: string         // last persisted version (for dirty tracking)
previousContent: string      // content before last AI replacement (one-level undo)
messages: ChatMessage[]      // conversation history
isStreaming: boolean         // AI response in progress
isSaving: boolean            // save request in progress
```

`hasUnsavedChanges` derived from `content !== savedContent`.

When the AI applies a document replacement, `previousContent` is set to the current content before overwriting. A "Revert last AI change" button appears when `previousContent !== content`, allowing the user to undo the AI's last edit. This is necessary because programmatic textarea value replacement via React state kills the browser's native Ctrl+Z undo stack.

### Components

**Page** (`page.tsx`): Fetches data, manages state, renders layout.

**DocumentEditor**: `<textarea>` bound to `content` state. Monospace font. Full height. `onChange` updates content in parent.

**AdvisorChat**: Scrollable message list + input. On send, calls the chat API with current content + history. Parses streamed response — conversational text goes to chat bubble, content inside `<updated_document>` tags replaces the editor.

## API

### POST `/api/foundation/[ideaId]/chat`

Streaming endpoint for advisor conversation.

**Request body:**
```typescript
{
  docType: FoundationDocType,
  messages: { role: 'user' | 'assistant', content: string }[],
  currentContent: string
}
```

**Backend logic:**
1. Load advisor system prompt via `getAdvisorSystemPrompt(DOC_ADVISOR_MAP[docType])`
2. Build system message:
   ```
   {advisor system prompt}

   ---

   You are helping the user refine their {docType} document through conversation.

   CURRENT DOCUMENT:
   {currentContent}

   RULES:
   - When the user asks you to change the document, make ONLY the requested changes.
     Do not rewrite, rephrase, or "improve" sections they didn't ask about.
   - After making changes, include the full updated document between <updated_document> tags.
   - If the user asks a question without requesting changes, respond conversationally without tags.
   - Keep your conversational response brief — focus on what you changed and why.
   ```
3. Call Claude streaming API using `anthropic.messages.stream()` (Anthropic SDK streaming helper). This is the first streaming endpoint in this codebase — no existing pattern to follow.
4. Pipe the stream into a `ReadableStream` returned as a `Response`:
   ```typescript
   const stream = anthropic.messages.stream({ model, system, messages, max_tokens });
   return new Response(
     new ReadableStream({
       async start(controller) {
         for await (const event of stream) {
           if (event.type === 'content_block_delta') {
             controller.enqueue(new TextEncoder().encode(event.delta.text));
           }
         }
         controller.close();
       }
     }),
     { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' } }
   );
   ```

**Route config:** `export const maxDuration = 60;` — streaming responses typically complete within 30-60 seconds. Separate from the foundation generation route's 300-second duration.

**Response:** Chunked text stream.

### PATCH `/api/foundation/[ideaId]`

Persists manual or AI-applied edits. Lives in the existing route file (`src/app/api/foundation/[ideaId]/route.ts`). Note: this file has `maxDuration = 300` for the POST handler's background generation. The PATCH handler completes in milliseconds — `maxDuration` applies per-request, not per-handler, so this is fine but worth noting.

**No auth** — consistent with existing GET/POST handlers on this route. This is a two-person app with no public access.

**Request body:**
```typescript
{
  docType: FoundationDocType,
  content: string
}
```

**Backend logic (load-mutate-save — `saveFoundationDoc` is a full object replace, not a merge):**
1. Load existing doc via `getFoundationDoc(ideaId, docType)` — return 404 if not found
2. Mutate the loaded object: `doc.content = body.content`, `doc.editedAt = new Date().toISOString()`, `doc.version += 1`
3. Save the full object via `saveFoundationDoc(ideaId, doc)`
4. Return updated doc

## Streaming Protocol

The AI response is a single text stream. The client parses it as it arrives:

- Text outside `<updated_document>` tags → append to chat message bubble
- Text inside `<updated_document>...</updated_document>` → buffer until closing tag, then set `previousContent = content`, replace editor content with buffer, and set dirty flag

If no `<updated_document>` tags appear (question-only response), the editor content is unchanged.

**Parser edge cases:**
- **Stream ends without closing tag** (disconnect, error): discard the buffer, editor content unchanged, show error in chat ("Response interrupted — document unchanged")
- **Tag split across chunks** (e.g., `<updated_` in one chunk, `document>` in next): accumulate raw text and match tags across chunk boundaries using a simple state machine (outside → inside-tag → inside-content → outside)
- **Multiple `<updated_document>` blocks** in one response: use the last one (unlikely but defensive)

**Message storage for conversation history:** When storing the assistant's response in `messages[]` for the next API round-trip, include only the conversational text — strip the `<updated_document>` block. The current document is already sent separately as `currentContent`, so including it in message history would be redundant and waste tokens.

Full document replacement is used (not diffs) because:
- Documents are small (2-5 KB)
- No diff/merge algorithm needed
- No partial-match failures
- Simple and reliable

Content drift mitigation via system prompt: "make ONLY the requested changes."

## Wiring the Link

In `ExpandedDocCard.tsx`, replace the disabled `<span>` with a Next.js `<Link>` to `/foundation/{ideaId}/edit/{docType}`. Pass `ideaId` as a new prop.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Chat stream fails | Error message in chat, editor unchanged, user can retry |
| Save fails | Inline error toast, `hasUnsavedChanges` stays true, user can retry |
| Navigate away with unsaved changes | `beforeunload` browser confirmation dialog |
| Doc doesn't exist | Redirect to `/foundation/{ideaId}` |
| Long conversations | Cap at last 20 messages sent to API. Oldest messages grayed out in chat UI with note "Earlier messages not sent to advisor" so the user knows context is being truncated |

## Testing

### Unit Tests

- `src/app/api/foundation/[ideaId]/chat/__tests__/route.test.ts`: POST chat endpoint — validates request parsing, advisor prompt loading, error responses (missing doc, missing API key, stream failure)
- `src/app/api/foundation/[ideaId]/__tests__/route.test.ts` (extend existing): Add PATCH handler tests — save logic, version increment, editedAt update, error on missing doc, 404 for nonexistent doc
- `src/lib/__tests__/parse-stream.test.ts`: Stream parser — extracts chat text vs `<updated_document>` content. Tests: no tags (question only), tags present, stream ends without closing tag (buffer discarded), tag split across chunks, multiple tag blocks (last wins), empty document between tags

### API Tests (mocked Redis)

- Full chat flow: send message → receive streamed response → verify response format
- Save flow: PATCH with content → verify `getFoundationDoc` called → verify mutated object passed to `saveFoundationDoc` with incremented version and editedAt
- Dirty tracking: edit → verify unsaved indicator → save → verify indicator cleared

## File Inventory

| File | Action | Purpose |
|------|--------|---------|
| `src/app/foundation/[id]/edit/[docType]/page.tsx` | Create | Editor page with split-pane layout |
| `src/app/api/foundation/[ideaId]/chat/route.ts` | Create | Streaming chat endpoint (`maxDuration = 60`) |
| `src/app/api/foundation/[ideaId]/route.ts` | Add PATCH | Save edits endpoint |
| `src/app/foundation/[id]/ExpandedDocCard.tsx` | Edit | Wire up "Update via conversation" link (add `ideaId` prop) |
| `src/app/foundation/[id]/page.tsx` | Edit | Pass `ideaId` prop to `ExpandedDocCard` |
| `src/app/foundation/[id]/foundation-config.ts` | Create | Extract `DOC_CONFIG` from `page.tsx` to shared module (both overview and edit pages import it) |
| `src/lib/agent-tools/foundation.ts` | Export | Export `DOC_ADVISOR_MAP` for chat endpoint to resolve advisor IDs |
| `src/lib/advisors/prompt-loader.ts` | Read only | Reuse `getAdvisorSystemPrompt()` |
| `src/lib/db.ts` | Read only | Reuse `getFoundationDoc()`, `saveFoundationDoc()` |

## Out of Scope

- Rich text / WYSIWYG editor (textarea is sufficient for v1)
- Conversation history persistence (chat resets on page reload)
- Multi-level undo/redo (single-level "Revert last AI change" is included)
- Collaborative editing
- Mobile-optimized layout
- Authentication (consistent with all existing API routes — two-person app, no public access)
- Rate limiting beyond disabling send button while streaming
