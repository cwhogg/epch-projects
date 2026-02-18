# Interactive Website Builder — Design Document

**Date:** 2026-02-17
**Status:** Draft

## Problem

The current website generation pipeline ignores foundation documents entirely — `buildBrandIdentityPrompt()` generates brand identity from scratch using only idea analysis, discarding the work already done in positioning, brand-voice, design-principles, and seo-strategy. The resulting sites don't reflect the strategic decisions made in the foundation documents, requiring manual regeneration cycles that still produce misaligned results.

## Summary

Replace the current fire-and-forget painted door site generation (and its simple "Regenerate" button) with an interactive, advisor-driven chat experience. Julian Shapiro leads the build using his Landing Page Assembly framework, consulting specialist advisors as independent sub-agents during the process. The existing content critique pipeline evaluates the site before deploy.

The user chooses their involvement level upfront: **"Build with me"** (pauses at creative checkpoints) or **"You've got this"** (autonomous with narration). Foundation documents are the source of truth — the advisor never re-asks what's already decided.

## Decision Log

| # | Decision | Rationale | Alternatives Considered |
|---|----------|-----------|------------------------|
| 1 | Julian Shapiro as project lead | Already mapped as `authorAdvisor` for the `website` recipe in `content-recipes.ts`. Has the Landing Page Assembly framework — a 4-phase structured methodology for building conversion-focused landing pages. | Generic "Website Builder" persona (rejected — loses personality and framework structure), Oli Gardner (rejected — he's a critic, not a builder) |
| 2 | Chat-first UI, progress secondary | User preference. The experience is conversational, not a dashboard. Progress sidebar provides orientation without dominating. | Chat overlay on existing progress page (rejected — progress page is the wrong primary frame), Live preview split (rejected — adds complexity, preview isn't useful until late in the build) |
| 3 | Advisor-as-tools + existing critique pipeline for review | Two-layer advisor integration. During the build, Julian consults specialists on-demand via independent LLM calls. Before deploy, Step 6 invokes the existing content critique pipeline (`content-critique-agent.ts`) which already handles parallel critic dispatch, structured scoring, editor decisions, oscillation guards, and revision loops using the same `namedCritics` from the website recipe. | Sequential consultation only (rejected — no quality gate), Building a new review mechanism (rejected — duplicates existing critique pipeline), Round-table at every step (rejected — too slow) |
| 4 | Foundation docs as source of truth | Brand identity, voice, design direction, SEO keywords are already decided in foundation documents. The website builder derives from them, never contradicts or re-asks. | Generate brand from scratch (current behavior — rejected, ignores foundation work), Hybrid (rejected — creates confusion about what's settled) |
| 5 | Hybrid streaming: segmented streams + polling for infrastructure | Vercel serverless functions have execution time limits (up to 300s). A full build with GitHub + Vercel deploy can take 2-5 minutes. Segmented streams keep each request within limits. Infrastructure waits use polling (already implemented). Client auto-continues when deploy completes. | Single long-lived stream (rejected — fragile with Vercel timeouts and network interruptions), Full polling (rejected — breaks the conversational feel) |
| 6 | Framework-driven progress steps | Julian's 4-phase Landing Page Assembly framework maps naturally to the creative phases. Infrastructure collapses into a single step. 8 steps total with 4 checkpoints in interactive mode. | Current 8-step pipeline (rejected — infrastructure-centric, doesn't reflect creative process), Freeform with no steps (rejected — loses the structured methodology) |
| 7 | Replace both initial generation and regeneration | Single entry point for all site building. For new builds, Julian starts fresh. For regeneration, he reviews what exists and proposes targeted changes vs. full rebuild. | Regenerate only (rejected — inconsistent experience), Separate flows (rejected — unnecessary duplication) |
| 8 | No authentication on chat endpoint | Intentional for now. This is an internal app with two collaborators. The existing painted-door API routes have no auth either. | Adding auth (deferred — not needed at current scale) |

## Architecture

### Core Components

```
/website/[id]/build (page)
    ↓
Mode selection: "Build with me" | "You've got this"
    ↓
/api/painted-door/[id]/chat (POST, streaming)
    ↓
Agent loop: Julian Shapiro persona + Landing Page Assembly framework
    ↓
Tools: existing 16 website tools + consult_advisor
    ↓
Streaming narration → client chat panel
    ↓
Progress updates → client sidebar
```

### System Prompt Assembly

The chat API route assembles Julian's system prompt with:

1. **Julian Shapiro's advisor prompt** (`src/lib/advisors/prompts/julian-shapiro.md`)
2. **Landing Page Assembly framework** (embedded in Julian's prompt, lines 87-137)
3. **All available foundation documents:**
   - `strategy` — target audience, competitive positioning
   - `positioning` — unique attributes, value proposition, market category
   - `brand-voice` — tone, vocabulary, personality, writing examples
   - `design-principles` — color direction, typography, visual patterns
   - `seo-strategy` — primary/secondary keywords, meta description guidance
   - `social-media-strategy` — available but not primary
4. **Idea analysis** — product name, description, target user, problem, competitors, keywords
5. **Current site state** (if regenerating) — existing brand identity, site URL, deployed content
6. **Mode instruction** — whether to pause at checkpoints or run autonomously
7. **Available advisor roster** — which advisors can be consulted and their domains

### Agent Loop

Each user message (or auto-continue trigger) starts a streaming agent loop:

1. Claude responds with text (streamed to client as chat) or tool calls (executed server-side)
2. Tool results feed back into Claude, loop continues
3. Loop ends when the agent hits: a checkpoint (interactive mode), an infrastructure wait (deploy polling), or completion
4. Client either waits for user input, polls for deploy status, or auto-continues

This is the Foundation chat model extended with multi-tool agent capabilities and auto-continuation.

### The `consult_advisor` Tool

Added to the website agent tool set alongside the existing 16 tools.

**Input:**
```typescript
{
  advisorId: string;        // e.g. "oli-gardner"
  question: string;         // specific question for the advisor
  artifacts: string[];      // which build artifacts to include
}
```

**Execution:**
1. Load advisor's `.md` prompt via `prompt-loader.ts` (cached)
2. Assemble context: advisor prompt + relevant foundation docs + specified artifacts + question
3. Independent `messages.create()` call (not streaming — it's a tool call)
4. Return advisor's response as structured text

**Julian's system prompt guidance:** *"You can consult any advisor for their specialist opinion. Prefer consulting when a decision falls outside your core expertise (e.g., SEO keyword density → seo-expert, behavioral friction → shirin-oreizy, conversion design → oli-gardner)."*

All advisors in `src/lib/advisors/prompts/` (14 total) are available for consultation.

### Conversation & Session State

Stored in Redis (extends existing `painted-door-db.ts`):

- **Conversation history** — messages array, persists across checkpoint pauses
- **Build session** — mode selection, current step, build artifacts (brand identity, page content, assembled files)
- **Progress** — existing progress tracking, extended with the 8 framework-driven steps

Resumability: if the user leaves and returns, conversation + progress reload. Julian picks up where he left off.

## Progress Steps

8 steps mapping Julian's framework phases to the build pipeline:

| # | Step | Source | Checkpoint (interactive)? | Description |
|---|------|--------|--------------------------|-------------|
| 1 | Extract Ingredients | Julian Phase 1 | Yes | Load foundation docs, extract value props, hooks, features, social proof signals, brand voice constraints, SEO keywords |
| 2 | Design Brand Identity | New | No | Colors, typography, visual direction derived from design-principles + brand-voice. Advisor consultations happen here. |
| 3 | Write Hero | Julian Phase 2 | Yes | Fully descriptive header, hook, subheader, narrative CTA. 50% of creative effort. |
| 4 | Assemble Page | Julian Phase 3 | Yes | Social proof strip, feature blocks (3-6), objection handling, repeated CTA, full page narrative |
| 5 | Pressure Test | Julian Phase 4 | No | Self-audit: desire check, labor check, confusion check, specificity audit |
| 6 | Advisor Review | Recipe critics | Yes | Parallel independent reviews from Oli Gardner, Joanna Wiebe, Shirin Oreizy, Copywriter. Synthesized feedback. Revisions applied. |
| 7 | Build & Deploy | Infrastructure | No | Template assembly, code validation, GitHub repo, Vercel project, deploy. Narrated, auto-polled. Expands to substeps in sidebar. |
| 8 | Verify | Infrastructure | No | Live site accessibility check, publish target registration, final confirmation |

**Interactive mode ("Build with me"):** Steps 1, 3, 4, 6 are checkpoints — Julian pauses, presents his work, and waits for user input before continuing.

**Autonomous mode ("You've got this"):** Same steps, same narration, no pauses. Julian runs straight through.

## Final Review Panel (Step 6)

Mandatory quality gate before deploy. **Reuses the existing content critique pipeline** (`content-critique-agent.ts`) rather than building a parallel review mechanism.

**Critics:** Oli Gardner (conversion), Joanna Wiebe (copy), Shirin Oreizy (behavioral science), Copywriter (brand voice) — from `namedCritics` on the `website` recipe in `content-recipes.ts`.

**How it integrates with the existing pipeline:**

The existing `content-critique-agent.ts` already provides:
- Parallel critic dispatch with `pLimit(2)` concurrency
- Structured evaluations (score 1-5, pass/fail, issues array with severity)
- Editor decision logic with oscillation guards
- `maxRevisionRounds` (3) and `minAggregateScore` (4) enforcement
- Error handling via `Promise.allSettled`

**Process:**
1. Julian assembles complete page content (hero, features, CTAs, full copy) into a draft artifact
2. The website agent invokes the critique pipeline's `run_critiques` tool with the page content and the website recipe
3. The pipeline dispatches the 4 named critics in parallel, each getting their advisor prompt, foundation docs, page content, and the recipe's `evaluationEmphasis`
4. Results return to Julian with per-advisor scores, issues, and verdicts
5. Julian synthesizes into a user-facing report:
   - Per-advisor verdict cards with attributed feedback
   - Aggregate issues grouped by severity
   - Recommendation: deploy, revise, or discuss
6. Interactive mode: checkpoint — user reviews and decides
7. Autonomous mode: pipeline's editor decision logic auto-applies revisions if scores are below threshold, up to max rounds

**What's new:** The critique pipeline's tools (`run_critiques`, `editor_decision`, `revise_draft`) are extracted into a shared service that both `content-critique-agent.ts` and the website builder agent can call. The pipeline logic stays in one place.

## Foundation Doc Integration

The current `buildBrandIdentityPrompt()` in `painted-door-prompts.ts` generates brand identity from scratch using only idea analysis. It ignores foundation documents entirely.

**New approach:** Brand identity is derived from foundation documents.

| Foundation Doc | Provides |
|---|---|
| `strategy` | Target audience, competitive positioning, "who's it for" |
| `positioning` | Unique attributes, value proposition, market category, competitive alternatives |
| `brand-voice` | Tone, vocabulary, personality, writing examples |
| `design-principles` | Color direction, typography preferences, visual patterns, anti-patterns |
| `seo-strategy` | Primary/secondary keywords, meta description guidance, content themes |

The `design_brand` tool's prompt changes from "generate a brand identity" to "translate foundation documents into a visual brand identity for the landing page." Colors from design-principles, copy tone from brand-voice, keywords from seo-strategy. The agent fills gaps where docs don't specify exact values but never contradicts what's decided.

**For regeneration:** Julian loads the current site's brand identity alongside foundation docs. He identifies drift where the existing site doesn't align with foundation docs and proposes targeted fixes.

## UI Layout

**Route: `/website/[id]/build`**

```
+-----------------------------------------------------------+
|  <- Back to Sites          [Idea Name] Site Builder        |
+-------------------------------------------+---------------+
|                                           |  PROGRESS     |
|  Chat messages (scrolling)                |               |
|                                           |  checkmark Extract    |
|  Julian: "I've read your positioning..."  |  * Brand ID   |
|                                           |  . Hero       |
|  [Advisor quote cards inline]             |  . Page       |
|                                           |  . Test       |
|  Julian: "Oli Gardner says: '...'"        |  . Review     |
|                                           |  . Deploy     |
|                                           |  . Verify     |
+-------------------------------------------+               |
|  [Message input]                  [Send]  |               |
+-------------------------------------------+---------------+
```

- **Chat panel** (left, ~75%): scrolling message history — Julian's messages, user messages, inline advisor consultation cards (visually distinct with advisor name attribution and colored border)
- **Progress sidebar** (right, ~25%): 8 steps with status indicators (pending/active/complete). Current step shows spinner. Step 7 expands to infrastructure substeps during deploy. Collapses to thin top bar on mobile.
- **Mode selection** (initial state): Julian's intro acknowledging foundation docs + two buttons: "Build with me" / "You've got this"
- **Resumability**: conversation history + progress reload from Redis on page revisit

**Entry points:**
- `/website/[id]` detail page gets "Build Site" / "Rebuild Site" buttons navigating to `/website/[id]/build`
- Auto-trigger-on-load behavior removed

**Mockups:** `docs/mockups/website-builder-chat/` contains layout, mode selection, advisor review, and flow diagram mockups.

## Streaming Architecture

**Segmented streams + polling for infrastructure.**

Each user message (or auto-continue) produces one streaming response. The agent loop runs within that stream — tool calls, narration, advisor consultations — until hitting a natural boundary.

### Stream Termination Signals

Every streaming response ends with a JSON control message appended after the final text chunk:

```typescript
type StreamEndSignal =
  | { action: 'checkpoint', step: number, prompt: string }  // Wait for user input
  | { action: 'continue', step: number }                     // Auto-send continuation
  | { action: 'poll', step: number, pollUrl: string }        // Poll for infrastructure
  | { action: 'complete', result: SiteResult }                // Build finished
```

- **`checkpoint`**: Interactive mode only. Stream ends. Client shows the chat input enabled with the prompt hint. User types a response, which becomes the next POST.
- **`continue`**: Autonomous mode between creative steps. Client immediately sends `POST { type: "continue", step: N }` to resume the agent loop at the next step. No user interaction required.
- **`poll`**: Infrastructure wait (deploy). Client polls the existing `GET /api/painted-door/[id]` endpoint at 3-second intervals. When deploy status changes to `complete` or `error`, client sends `POST { type: "continue", step: N }` to resume.
- **`complete`**: Build finished. Client shows final result (site URL, "See Site" button).

### Client State Machine

```
IDLE → (user sends message or selects mode) → STREAMING
STREAMING → (stream ends with signal) →
  checkpoint → WAITING_FOR_USER → (user types) → STREAMING
  continue   → STREAMING (auto-POST immediately)
  poll       → POLLING → (deploy done) → STREAMING
  complete   → DONE
```

The server distinguishes continuation messages from user messages via the `type` field: `{ type: "continue", step: N }` vs `{ type: "user", content: "..." }`. The agent loop state (current step, build artifacts) is loaded from Redis on each request.

Each stream segment stays within Vercel's 300s serverless limit. Creative phases (steps 1-6) complete well within this. Infrastructure (step 7) uses polling.

## File Changes

### New Files
- `/src/app/website/[id]/build/page.tsx` — chat-first build page with mode selection, message history, progress sidebar
- `/src/app/api/painted-door/[id]/chat/route.ts` — chat API with agent loop, streaming, tool execution
- `/src/lib/agent-tools/website-chat.ts` — `consult_advisor` tool definition + updated tool set for chat-driven agent
- `/src/lib/frameworks/prompts/landing-page-assembly/prompt.md` — extract Julian's embedded framework into its own framework directory (resolves the `authorFramework` field in the website recipe pointing nowhere)

### Modified Files
- `/src/app/website/[id]/page.tsx` — remove auto-trigger, add "Build Site" / "Rebuild Site" buttons navigating to build page
- `/src/lib/painted-door-prompts.ts` — update `buildBrandIdentityPrompt` to accept and use foundation docs
- `/src/lib/painted-door-db.ts` — add conversation history and build session storage to Redis schema
- `/src/lib/content-critique-agent.ts` — extract critique tools (`run_critiques`, `editor_decision`, `revise_draft`) into a shared service so both the content pipeline and the website builder can use them
- `/src/app/api/painted-door/[id]/route.ts` — update import from `runPaintedDoorAgentAuto` to new chat-driven agent entry point

### Preserved
- All 16 existing website tools in `agent-tools/website.ts`
- Template assembly in `painted-door-templates.ts`
- Progress tracking pattern in Redis (extended, not replaced)
- `content-recipes.ts` configuration (used by both critique pipeline and review panel)
- All advisor `.md` prompt files
- Content critique pipeline logic (reused, not duplicated)

### Removed
- `runPaintedDoorAgent` (V1 pipeline) — replaced by chat-driven agent
- `runPaintedDoorAgentV2` (V2 agentic pipeline) — dead code, `AGENT_V2` env var was never set in production. V1 was always the live path. Both replaced.
- `runPaintedDoorAgentAuto` (env-var switcher) — no longer needed with single chat-driven agent
- Auto-trigger behavior on `/website/[id]` page load
- Simple DELETE + POST regeneration flow

## Testing

### New Test Files
- `/src/app/api/painted-door/[id]/chat/__tests__/route.test.ts` — streaming, system prompt assembly, foundation doc loading, advisor consultation, checkpoint behavior, mode selection
- `/src/lib/agent-tools/__tests__/consult-advisor.test.ts` — independent advisor LLM calls, prompt assembly, error paths
- `/src/app/api/painted-door/[id]/__tests__/route.test.ts` — tests for the modified API route (removed auto-trigger, updated imports)

### Key Test Scenarios

**Chat API:**
- Foundation docs load and appear in system prompt
- Missing foundation docs degrade gracefully (agent notes what's missing, proceeds)
- Julian's advisor prompt and framework included in system prompt
- Conversation history persists across checkpoint pauses
- Streaming produces valid chunked response
- Stream end signals are correct for each termination type (checkpoint, continue, poll, complete)

**Mode behavior:**
- "Build with me" produces checkpoints at steps 1, 3, 4, 6
- "You've got this" runs without checkpoints
- Mode selection persisted in session state

**Auto-continuation protocol:**
- Client continuation messages (`{ type: "continue" }`) resume agent loop at correct step
- Server distinguishes continuation from user messages via `type` field
- Agent state loads correctly from Redis on each segment
- Poll-to-continue transition works when deploy completes

**Advisor consultations:**
- `consult_advisor` fires independent LLM calls with correct advisor prompt
- Advisor not found returns clear error
- LLM call failure handled gracefully
- Foundation docs included in advisor context

**Review panel (via existing critique pipeline):**
- Website builder invokes shared critique service correctly
- Critique pipeline uses website recipe's `namedCritics`
- Scores below threshold trigger revision loop
- Max revision rounds (3) enforced
- Results surface correctly in Julian's chat narration

**Infrastructure:**
- Deploy polling resumes correctly after stream ends
- Auto-continue triggers agent loop resumption
- Progress steps update through all 8 stages

**Error paths:**
- Redis connection failure
- Anthropic API failure during agent loop
- Anthropic API failure during advisor consultation
- GitHub/Vercel API failures (existing error recovery preserved)
