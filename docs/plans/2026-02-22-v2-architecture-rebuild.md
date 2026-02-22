# EPCH Projects v2 — Architecture Rebuild

**Date:** 2026-02-22
**Status:** Design
**Authors:** Eric (product owner), The Architect (design lead)

## 0. Success Criteria

The rebuild is done when:

1. **All agent stages use the shared agent loop** — zero raw `getAnthropic().messages.create()` calls outside the loop or explicitly authorized single-shot service modules
2. **All persistence goes through db.ts** — zero direct `getRedis()` imports outside `data/db.ts`
3. **Every module has tests** — 90%+ module coverage, every service module has explicit error-path tests
4. **Route handlers are thin** — no route exceeds 50 lines; all business logic in Services
5. **End-to-end pipeline works** — idea → analysis → foundation → content → deployed site → analytics, all functional on the new URL
6. **Build and tests pass** — `npm test` and `npm run build` both succeed with zero warnings

The rebuild is NOT done until v2 can fully replace v1 for both users.

## 1. Why Fork

The existing codebase was built as a proof of concept without architecture docs, a CLAUDE.md, tests, or consistent patterns. The result:

- **Two LLM call patterns** — half the agents use the agent runtime, half make raw Anthropic API calls
- **8+ modules bypass db.ts** — agent-runtime, agent-events, agent-tools/common, agent-tools/critique, content-critique-agent, analytics-db, painted-door-db, and the content-pipeline route each import `getRedis()` directly or create their own Redis singletons (5 separate singleton instances total)
- **v1/v2 content agent split** — two parallel implementations (301-line v1, 176-line v2) toggled by an env var
- **Website builder is a 644-line god function** — prompt assembly, streaming, tool execution, session state, and advisor enforcement all in one route handler
- **Many modules lack tests** — including db.ts (452 lines, 58 exported functions) which has only partial coverage via foundation-db.test.ts

A fork provides a clean cognitive break — no legacy patterns for Claude or humans to accidentally copy, no parallel v1/v2 state during migration, and independent deployment so the existing site stays up while v2 is built.

## 2. What Carries Forward

**Keep:**
- Advisor prompt files (14 advisors, .md format)
- Design principles and brand identity docs
- Eval scenarios and judge configuration
- UI component designs (cleaned up)
- Domain knowledge: scoring dimensions, foundation doc types, content piece types
- Renderer modules (spec types, section renderers, template generators) — cleaned up with tests

**Leave behind:**
- Bespoke agent implementations with inconsistent patterns
- v1/v2 content agent split
- Direct Redis access outside the data layer
- The website builder's 645-line chat route
- Dead code (agent-events with no subscribers, unused content-vault filesystem writes)
- Duplicate Redis singletons (five separate instances in v1)
- Inconsistent error handling (four different patterns across routes)

**Data migration:** v2 starts with a clean Redis instance. The v1 site stays up at the current URL until v2 is fully operational and ready to swap. Existing ideas, analyses, and content remain accessible in v1 during the transition. No automated data migration — any valuable content is re-created through the improved pipeline.

## 3. Architecture — Five Layers

Dependencies flow downward only. No module imports from a layer above it. Knowledge is a leaf layer importable from anywhere.

```
┌──────────────────────────────────────────────────┐
│  Routes (src/app/api/)                            │
│  Thin handlers: validate (Zod), delegate, respond │
├──────────────────────────────────────────────────┤
│  Agents (src/lib/agents/)                         │
│  Config factories: tools + prompts + advisors     │
│  Call the agent loop, not the LLM directly        │
├──────────────────────────────────────────────────┤
│  Services (src/lib/services/)                     │
│  agent-loop — streaming-capable agentic loop      │
│  tools/ — stateless tool definitions              │
│  prompts/ — prompt builder functions              │
│  critique/ — parallel fan-out/fan-in engine       │
│  chat/ — shared chat service                      │
│  renderer/ — spec → deployable site               │
│  errors.ts — centralized ApiErrors                │
├──────────────────────────────────────────────────┤
│  Knowledge (src/lib/knowledge/)                   │
│  advisors/ — registry + prompt loader + .md files │
│  frameworks/ — registry + loader + prompt files   │
│  (importable from any layer — no upward deps)     │
├──────────────────────────────────────────────────┤
│  Data & Infra (src/lib/data/)                     │
│  db.ts — sole Redis interface for all persistence │
│  agent-state.ts — pause/resume state persistence  │
│  anthropic.ts — LLM client singleton              │
│  github.ts — GitHub API operations                │
│  gsc.ts — Google Search Console client            │
│  types.ts — all shared domain types               │
└──────────────────────────────────────────────────┘
```

### Layer 1 — Routes

- Parse request, validate input with Zod schemas
- Delegate to an agent or service function
- Return JSON response or stream
- Centralized error handling via `ApiErrors` object:
  ```ts
  export const ApiErrors = {
    unauthorized: () => errorResponse('Unauthorized', 401),
    badRequest: (msg: string) => errorResponse(msg, 400),
    notFound: () => errorResponse('Not Found', 404),
    serverError: (msg: string) => errorResponse(msg, 500),
  }
  ```
- **No business logic. None.** If a route handler exceeds ~30 lines, something belongs in Services.

### Layer 2 — Agents

- One file per pipeline stage: `research.ts`, `foundation.ts`, `website.ts`, `content.ts`, `analytics.ts`
- Each agent is a config factory: defines which tools to use, which prompt builder to call, which advisor to assign, and any stage-specific parameters
- Agents call `runAgentLifecycle` from the Services layer. They never call the Anthropic client directly.
- **Agents never import from each other.** Cross-stage data dependencies are resolved through db.ts reads, not agent-to-agent calls.

### Layer 3 — Services

- **agent-loop.ts** — single streaming-capable agentic loop. Handles: send messages to Claude, execute tool calls, manage turn counting, pause/resume lifecycle, stream responses. Used by both auto mode and interactive chat mode.
- **tools/** — stateless tool definitions grouped by domain (research, content, foundation, website, analytics, common). Each tool has `name`, `description`, `input_schema`, `execute`. Tools import from Data and Knowledge. Never from Agents.
- **prompts/** — prompt builder functions per stage. Each builder assembles a system prompt from: advisor prompt (Knowledge) + document content (Data) + stage-specific context. Returns a structured `PromptContext` object.
- **critique/** — parallel fan-out/fan-in critique engine. Takes a document + a set of critic assignments, runs N independent LLM calls in parallel, collects results, synthesizes. Built for content calendars and content pieces; generalize to other document types only when a concrete need arises.
- **chat/** — shared chat service for the document-and-chat pattern. Handles: prompt assembly, streaming loop invocation, document update extraction, chat history management. Used by Foundation, Website, and Content stages.
- **renderer/** — three modules carried forward from v1:
  - `spec-types.ts` — PageSpec type definitions and validation
  - `section-renderers.ts` — turn typed copy into JSX string fragments
  - `template-generators.ts` — scaffold file generation (package.json, layout, pages, etc.)
  - Note: `template-generators.ts` produces code for external repos (deployed landing pages). Its generated code includes `new Redis()` calls for signup API routes. This is not a layer violation — it's a code generator whose output has its own dependencies, separate from the v2 codebase.
- **errors.ts** — centralized `ApiErrors` object and error response formatting.

**LLM call boundary:** The agent loop manages multi-turn conversations with tool execution. Services may also make single-shot LLM calls, but only through a thin wrapper (`data/anthropic.ts` exports both `getAnthropic()` for the agent loop and `singleShotLLMCall()` for services). The wrapper enforces consistent error handling, logging, and model selection. Authorized single-shot callers: `services/critique/` (critic calls), `services/tools/` (tool-internal delegation). All other modules use the agent loop.

**The boundary is turn count:** the agent loop owns multi-turn conversations; services make single-shot calls through the wrapper. Any module making a raw `getAnthropic().messages.create()` call is a rule violation.

**Tools with internal LLM calls:** Some tools (generate content, analyze competitors, consult advisor) make single-shot LLM calls internally via the wrapper. This is intentional — the agent loop delegates to the tool, and the tool delegates to Claude for focused work. Inner calls use the same model and return structured results (not throws) so the agent loop can surface errors as tool_result.

### Layer 4 — Knowledge

- **advisors/** — static registry of advisor metadata (role, expertise, evaluation boundaries) + prompt loader that reads .md files from disk with caching + the .md prompt files themselves
- **frameworks/** — static registry of framework metadata + loader for prompt files
- Importable from any layer because they have no upward dependencies. They're leaf nodes — read-only knowledge bases.

### Layer 5 — Data & Infra

- **db.ts** — the sole module that calls `getRedis()`. All persistence goes through here. Exports functions like `saveIdea()`, `getIdea()`, `saveFoundationDoc()`, `getContentPiece()`, etc. No other module imports Redis directly.
- **agent-state.ts** — agent pause/resume state persistence. `saveAgentState()`, `getAgentState()`, `deleteAgentState()`, `saveActiveRun()`, `getActiveRunId()`, `clearActiveRun()`. Uses db.ts for Redis access.
- **anthropic.ts** — `getAnthropic()` singleton. The one and only Anthropic client.
- **github.ts** — GitHub API operations: repo creation, file commits, branch management.
- **gsc.ts** — Google Search Console API client.
- **types.ts** — all shared domain types in one place. `ProductIdea`, `Analysis`, `FoundationDocument`, `ContentPiece`, `ContentCalendar`, `PageSpec`, `AgentState`, `CritiqueResult`, etc.

## 4. The Document-and-Chat Pattern

Three pipeline stages (Foundation, Website, Content) share a common interaction model.

### Two modes

**Auto mode:** Agent generates the document end-to-end without human input. Route triggers the agent, agent runs tools, produces a document, saves it. User sees the finished result.

**Interactive mode:** Document displayed on the left, chat window on the right. User can:
- Chat with an advisor to refine the document
- Directly edit the document in the editor
- Switch between advisors mid-conversation

### How it works

```
Route (POST /api/{stage}/[id]/chat)
  │
  ├── Validates request (Zod)
  ├── Loads document from db.ts
  ├── Delegates to chat service
  │
  ▼
Chat Service (services/chat/)
  │
  ├── Assembles system prompt:
  │     advisor prompt (from Knowledge)
  │     + document content (from Data)
  │     + stage-specific context
  │
  ├── Runs streaming agent loop:
  │     sends messages → Claude responds
  │     → tool calls → execute → return results
  │     → stream text to client
  │
  ├── On completion:
  │     extracts document updates from response
  │     saves updated document via db.ts
  │
  ▼
Route streams response back to client
```

### Error handling and concurrency

**Stream interruption:** The chat service buffers document update tags server-side. If the stream is interrupted before the closing `</updated_document>` tag, the server does NOT save — the document remains unchanged. The client is notified via a stream-end signal that the response was incomplete.

**Save failure:** If db.ts save fails after document extraction, the server returns an error signal in the stream. The client retains the updated content in its local state so the user can retry or copy it manually. No silent data loss.

**Concurrent edits:** Last-write-wins is acceptable for a two-user internal app. The editor is read-only while a chat response is actively streaming to prevent race conditions. Once the stream completes and the server saves, the editor unlocks with the updated content.

**Interactive mode and pause/resume:** Interactive chat mode bypasses the agent loop's time budget. Chat is single-turn (one user message → one LLM response with potential tool calls). The time budget and pause/resume apply only to auto mode, where agents run multi-turn workflows that may exceed Vercel's function timeout.

### What's shared vs. stage-specific

| Shared (chat service owns) | Stage-specific (agent config provides) |
|---------------------------|---------------------------------------|
| Streaming agent loop | Available tools |
| Prompt assembly pattern | Default advisor assignment |
| Document save-on-update | Document type (foundation doc, site spec, blog post) |
| Chat history management | Context builder function |

## 5. The Critique Engine

Used by the Content pipeline for both calendar generation and individual piece generation.

### Flow

```
                    ┌─────────────┐
                    │ Draft Agent  │
                    │ (primary     │
                    │  advisor)    │
                    └──────┬──────┘
                           │ document
                           ▼
              ┌────────────────────────┐
              │      Fan-Out           │
              │                        │
    ┌─────────┼─────────┬──────────┐   │
    ▼         ▼         ▼          ▼   │
┌────────┐┌────────┐┌────────┐┌──────┐ │
│Position││Copy-   ││Behav.  ││SEO   │ │  ← 4 deterministic
│  ing   ││writer  ││Science ││Expert│ │
└───┬────┘└───┬────┘└───┬────┘└──┬───┘ │
    │         │         │        │     │
    │    ┌────┴────┐    │        │     │  ← 0-2 domain
    │    │ Domain  │    │        │     │    specialists
    │    │Specialist│   │        │     │    (topic-based)
    │    └────┬────┘    │        │     │
    │         │         │        │     │
    └─────────┴─────────┴────────┘     │
              │ all critiques          │
              ▼                        │
    ┌──────────────────┐               │
    │  Synthesis Agent  │               │
    │                  │               │
    │  • Find consensus│               │
    │  • Resolve       │               │
    │    disagreements │               │
    │  • Revise doc    │               │
    │  • Decide: done  │               │
    │    or re-critique│               │
    └──────────────────┘
```

### Critic assignment

- **4 deterministic critics** always run: positioning, copywriting, behavioral science, SEO
- **0-2 domain specialists** added based on content topic (e.g., healthcare advisor for health posts)
- All critics receive the original document only — they do not see each other's feedback
- Each critic produces structured feedback: issues found, suggestions, severity ratings

### Synthesis agent behavior

The synthesis agent has autonomy to:
- Apply consensus fixes (issues flagged by 2+ critics)
- Resolve disagreements using its own judgment (e.g., SEO expert wants keyword density, copywriter wants natural voice — synthesizer decides the balance)
- Decide whether to run another critique round or accept the current state
- The agent is authorized to make decisions, not just aggregate feedback

**Failure handling:** The synthesis agent operates on a draft copy of the document. If the synthesis LLM call fails, times out, or produces incoherent output, the original document is unchanged. Only on successful completion does the revised draft replace the original via db.ts save. No partial application — synthesis is atomic.

### Cross-stage data contracts

Agents never import from each other. They share data through db.ts. These are the contracts:

| Producer Agent | Data Type | Consumer Agents |
|---------------|-----------|-----------------|
| Research | `Analysis` (scores, recommendation, risks) | Foundation (reads analysis for context), Content (reads for SEO strategy) |
| Foundation | `FoundationDocument` (7 doc types) | Website (reads brand-voice, design-principles, visual-identity), Content (reads seo-strategy, positioning) |
| Content | `ContentCalendar`, `ContentPiece` | Analytics (reads published pieces for tracking), Website (reads content for site integration) |
| Website | `PaintedDoorSite` (site config, deploy status) | Analytics (reads site data for signup tracking) |
| Analytics | `WeeklyReport`, `PerformanceAlert` | None (terminal consumer, renders to UI) |

Type compatibility is enforced through `data/types.ts` — all agents import types from the same file. Schema drift is caught at compile time (`npm run build`), not at runtime through Redis serialization.

## 6. Pipeline Stages in v2

### Research Agent (migrate)
- Takes a product idea, runs SEO analysis, competitor research, scoring across 5 dimensions
- Output: Tier 1/2/3 recommendation with scores, confidence, risks
- Mode: auto only
- Migration: uses shared agent loop, prompt builder extracted to services/prompts/

### Foundation Agent (reference implementation)
- Generates 7 strategic documents with advisor assignments
- Doc dependency chain: strategy → positioning → {brand-voice, design-principles, visual-identity, seo-strategy, social-media}
- Mode: auto (generate all 7) + interactive (document-and-chat per doc)
- This stage is built first and serves as the golden example for Content and Website

### Website Builder (rebuild)
- Phase 1: LLM generates/refines a site spec document (not code)
- Phase 2: deterministic renderer turns spec into deployable files
- Phase 3: GitHub commit + Vercel deployment
- Mode: auto + interactive (spec editor with chat panel)
- Key change: the LLM produces a spec, not code. If the spec is wrong, you fix it in the editor. If the renderer is wrong, it's a code bug you fix once.

### Content Pipeline (major rebuild)
- Two document types, both go through the critique engine:
  1. **Content calendar** — prioritized list of pieces to create, critiqued for strategy and coverage
  2. **Content pieces** — individual blog posts, comparisons, FAQs, critiqued for quality
- Mode: auto (generate + critique + publish) + interactive (document-and-chat)
- Draft → parallel critique → synthesis → optionally re-critique

### Analytics Agent (minor cleanup)
- Weekly cron: GSC data fetch, metric computation, report generation, alert evaluation
- Validation canvas: tracks 5 assumptions (demand, reachability, engagement, WTP, differentiation)
- Mode: auto only (cron-triggered)
- Migration: uses shared agent loop, otherwise stays largely the same

## 7. Testing & Quality Strategy

### Principle

Nothing exists without a test. Every module gets tests written alongside it.

### Three layers of verification

**Layer 1 — Unit tests (Vitest)**
- Every module in services/, data/, and knowledge/ has a corresponding .test.ts file
- Agent config files tested for: correct tool sets, prompt builder output, advisor assignments
- Critique engine tested for: fan-out produces N independent critic calls, fan-in synthesizes correctly, disagreement resolution logic, **error paths: individual critic failure, all critics fail, synthesis agent failure (document unchanged), synthesis timeout**
- Chat service tested for: prompt assembly correctness, **error paths: stream interruption (document unchanged), db.ts save failure (client notified), incomplete document tags (save skipped), editor lock/unlock lifecycle**
- Agent loop tested for: tool dispatch, turn counting, streaming, **error paths: LLM failure mid-turn, tool execution failure, pause/resume state roundtrip, time budget enforcement**
- Renderer tested for: spec → correct file output, escaping of brand values, template completeness
- db.ts tested for: every CRUD operation, TTL enforcement, error paths
- Target: 90%+ module coverage from day one

**Layer 2 — Build verification**
- `npm run build` catches TypeScript errors that Vitest misses (esbuild/SWC strips types without checking)
- Every commit must pass both `npm test` and `npm run build`

**Layer 3 — Evals**
- Scenario-based evals for LLM behavior carried forward from v1
- Judge model: claude-haiku-4-5
- Scoring dimensions: output-length, instruction-following, voice, structured-output, scoring-accuracy
- New in v2: eval scenarios for the critique engine

## 8. CLAUDE.md Rules (Non-Negotiable)

The v2 CLAUDE.md will include these explicit rules:

```
## Rules (non-negotiable)

- Every new module must have a test file before it's considered complete
- npm test AND npm run build must pass before any commit
- Never bypass db.ts to access Redis directly
- Never put business logic in route handlers
- Never make raw Anthropic calls outside the agent loop or documented single-shot patterns
- Never import from a higher layer (Services don't import Agents, Data doesn't import Services)
- Never import between agents (cross-stage data goes through db.ts)
- Agent tools are stateless — they never import from agent modules
- The LLM produces specs and documents, not code — deterministic renderers produce code
```

## 9. Migration Plan

Each phase produces a deployable state.

### Phase 0: Scaffold
- Create new repo (Next.js 16 + React 19 + Tailwind 4 + Vitest)
- Set up directory structure (all five layers)
- Write the CLAUDE.md with architecture rules and conventions
- Copy over: design principles, brand identity spec, advisor prompts, framework prompts
- Copy over: eval infrastructure and scenarios
- Set up Vercel project on new URL
- **Deliverable:** Empty app that builds and deploys. CLAUDE.md is the source of truth.

### Phase 1: Data & Knowledge layers
- data/redis.ts — single Redis client (the ONLY module that imports `@upstash/redis`)
- data/db.ts — all CRUD operations with tests. Consolidates functions from v1's db.ts, analytics-db.ts, and painted-door-db.ts into one module. Includes: ideas, analyses, foundation docs, content calendars, content pieces, painted-door sites, build sessions, email signups, analytics snapshots, weekly reports, alerts, publish logs.
- data/agent-state.ts — pause/resume persistence with tests
- data/anthropic.ts — LLM client singleton + `singleShotLLMCall()` wrapper for services
- data/github.ts — GitHub API operations
- data/gsc.ts — Search Console client
- data/types.ts — all shared domain types
- knowledge/advisors/ — registry, prompt loader, prompt files
- knowledge/frameworks/ — registry, loader, prompt files
- **Deliverable:** Fully tested data layer covering all entity types.

### Phase 2: Services layer
- services/agent-loop.ts — streaming-capable agentic loop with tests
- services/prompts/ — prompt builders per stage
- services/critique/ — fan-out/fan-in critique engine with tests
- services/chat/ — shared chat service
- services/renderer/ — spec types, section renderers, template generators with tests
- services/tools/ — tool definitions per domain
- services/errors.ts — centralized ApiErrors
- **Deliverable:** All business logic exists and is tested.

### Phase 3: Foundation stage (reference implementation)
- agents/foundation.ts — agent config
- Routes: generate, chat, CRUD
- UI: document editor with chat panel
- **Deliverable:** Foundation works end-to-end. Proves the architecture.

### Phase 4: Research stage
- agents/research.ts — agent config with research tools
- Routes: analyze, poll progress
- UI: analysis dashboard with scores
- **Deliverable:** Research → Foundation pipeline works.

### Phase 5: Content stage
- agents/content.ts — agent config with content tools
- Content calendar generation with critique
- Piece generation with parallel critique engine
- Routes: calendar CRUD, piece generation, chat
- UI: content calendar + document editor with chat panel
- **Deliverable:** Full pipeline through content generation.

### Phase 6: Website builder
- agents/website.ts — agent config with website tools
- Site spec document type
- Chat-based refinement using shared chat service
- Deterministic renderer → GitHub → Vercel deployment
- Routes: build, chat, deploy status
- UI: spec editor with chat panel + live preview
- **Deliverable:** Website builder works reliably.

### Phase 7: Analytics + Publishing
- agents/analytics.ts — agent config with analytics tools
- Cron jobs: publish (Mon/Wed/Fri), analytics (Sunday)
- GSC integration, weekly reports, alerts
- UI: analytics dashboard
- **Deliverable:** Full pipeline operational. Swap Vercel URL.

**Minimum viable rebuild:** Phases 0-5 (scaffold through content). At that point, the core pipeline (idea → analysis → foundation → content) works on the new architecture. Phases 6-7 (website builder, analytics) can be deferred if the rebuild stalls — v1 handles those stages in the interim.

**Future — Idea Discovery Agent:** Not part of this rebuild. If there's user demand for automated niche discovery, it gets its own design document with its own problem statement and success criteria. The v2 architecture supports adding it as `agents/discovery.ts` whenever that happens.

## 10. Decision Log

| # | Decision | Rationale | Alternatives Considered |
|---|----------|-----------|------------------------|
| 1 | Fork into new repo, not refactor in place | Clean cognitive break: no legacy patterns to accidentally copy, no parallel v1/v2 state during migration, independent deployment. Two users, internal app, v1 stays up during transition. | Incremental refactor (rejected: maintaining two parallel implementations during migration is the exact problem v1 already has with content-agent v1/v2) |
| 2 | No declarative agent config runner | Rejected a system where agent behavior is specified in data/config files and a generic runner interprets them. Accepted shared imperative infrastructure: agents are code that calls shared functions (agent-loop, chat service, critique engine). The agent loop handles message passing, tool dispatch, and streaming. Agents own prompt construction, tool selection, and result interpretation. | Declarative config-driven runner (rejected: escape hatches for stage-specific logic erode the abstraction; agents need freedom to evolve independently) |
| 3 | Spec-not-code for website builder | LLM produces a spec document. Deterministic renderer produces code. Spec errors are visible and editable. Renderer bugs are fixed once. | LLM generates code directly (rejected: 20 iterations in v1, untestable output) |
| 4 | Parallel critique, not sequential | All critics see the original document independently. Prevents anchoring on prior critics' feedback. Synthesis agent resolves disagreements with autonomy. | Sequential critique (rejected: later critics anchored on earlier feedback), Single critic (rejected: misses multi-dimensional quality issues) |
| 5 | Knowledge as its own layer | Advisors and frameworks are leaf-node knowledge bases with no upward dependencies. Any layer needs access. Putting them in Services or Data would create artificial import restrictions. | Advisors in Services (rejected: Routes also need them), Advisors in Data (rejected: they're not persistence) |
| 6 | Single streaming-capable agent loop | Three stages use interactive chat. Having separate batch and streaming loops leads to drift (proven in v1 with two divergent implementations). One loop that supports both modes. | Separate batch and streaming loops (rejected: v1 proved they drift apart) |
| 7 | Split agent-runtime into state (Data) and loop (Services) | Runtime crosses all layers. State persistence is Data-layer work. Loop orchestration is Services-layer work. Clean split eliminates the cross-cutting concern. | Keep as monolith in Services (rejected: persistence logic doesn't belong in Services) |
| 8 | Delete agent-events pub/sub | No subscribers exist in v1. Dead code in a fresh codebase is a contradiction. If cross-agent orchestration is needed later, design it intentionally. | Formalize as event bus (rejected: no current use case, YAGNI) |
