# Content Pipeline Design — Foundation Documents + Multi-Advisor Critique

*February 9, 2026*

## Problem

The EPCH app generates websites and blog posts from raw SEO research data in a single pass with no strategic foundation. Brand identity, copy, and content lack coherent positioning because no strategy, positioning statement, or brand voice exists upstream. The result is generic output that doesn't differentiate.

## Solution

Two subsystems that produce high-quality content through deliberate strategy and multi-advisor critique:

1. **Foundation Document Manager** — Six strategic documents created in hierarchy, stored in Redis, editable via advisor-guided chat.
2. **Content Pipeline Engine** — Autonomous generation of customer-facing content (websites, blog posts, social posts) using a write-critique-revise cycle with multiple advisor personas and an editorial quality gate.

Both systems fit inside the existing agent architecture (`agent-runtime.ts`, tool-based agents, Redis state, `after()` execution, progress polling) with no changes to the runtime.

---

## Architecture

### Two-Layer Model

```
FOUNDATION LAYER (created once, edited interactively)
┌──────────────────────────────────────────────────────────────────┐
│  Strategy                                                        │
│      ↓                                                           │
│  Positioning Statement                                           │
│      ↓                                                           │
│  Brand Voice | Design Principles | SEO Strategy | Social Media Strategy │
└──────────────────────────────────────────────────────────────────┘
         ↑ read as context (no dependency tracking)
┌──────────────────────────────────────────────────────────────────┐
│  CONTENT LAYER (generated autonomously)                          │
│  Website Copy  •  Blog Posts  •  Social Media Posts              │
└──────────────────────────────────────────────────────────────────┘
```

Foundation documents are read as context by the content layer. There is no dependency graph or cascading regeneration. When a foundation document changes, the user regenerates whichever content they want updated.

### What We Reuse

| Component | File | Changes |
|-----------|------|---------|
| Agent runtime | `src/lib/agent-runtime.ts` | None |
| Plan + scratchpad tools | `src/lib/agent-tools/common.ts` | None |
| Evaluation helpers | `src/lib/agent-tools/common.ts` | None |
| Website deployment tools | `src/lib/agent-tools/website.ts` | None (deployment pipeline stays as-is) |
| Content agent flow | `src/lib/content-agent.ts` | Modified — reads foundation docs as context |
| Progress polling pattern | Existing API routes | Reused — richer step data |

### What We Add

| Component | File | Purpose |
|-----------|------|---------|
| Advisor prompt system | `src/lib/advisors/` | Prompt files, registry, and loader (see below) |
| Foundation tools | `src/lib/agent-tools/foundation.ts` | Load, generate, and seed foundation documents |
| Critique tools | `src/lib/agent-tools/critique.ts` | Draft generation, parallel critiques, revision |
| Foundation DB functions | `src/lib/db.ts` | Redis CRUD for foundation documents |
| Recipe configurations | `src/lib/content-recipes.ts` | Per-content-type advisor assignments |
| Foundation API routes | `src/app/api/foundation/[ideaId]/` | Generate and retrieve foundation docs |
| Foundation editor route | `src/app/api/foundation/[ideaId]/[docType]/chat/` | Interactive editing |
| Frontend pages | `src/app/analyses/[id]/foundation/` | Foundation panel, editor, viewer |

### Advisor Prompt System (New Infrastructure)

The EPCH app does not currently have an advisor persona concept. The VBOA app (`va-web-app`, a separate codebase) has a mature advisor system with prompts, registry, and a loader. We port a lightweight version of this pattern into the EPCH codebase.

**Directory structure:**

```
src/lib/advisors/
├── prompts/                    # Markdown persona files
│   ├── richard-rumelt.md       # Strategy advisor
│   ├── april-dunford.md        # Positioning + editor
│   ├── andy-raskin.md          # Strategic narrative
│   ├── shirin-oreizy.md        # Behavioral science / CRO
│   ├── copywriter.md           # New: brand copywriter
│   └── seo-expert.md           # New: SEO specialist
├── registry.ts                 # Advisor metadata array
└── prompt-loader.ts            # Server-side fs reader with in-memory cache
```

**Loader pattern** (same as va-web-app's `prompt-loader.ts`):

```typescript
// Server-side only — reads from filesystem, caches in memory
const promptCache = new Map<string, string>();

export function getAdvisorSystemPrompt(advisorId: string): string {
  if (promptCache.has(advisorId)) return promptCache.get(advisorId)!;
  const filePath = path.join(process.cwd(), 'src/lib/advisors/prompts', `${advisorId}.md`);
  const content = fs.readFileSync(filePath, 'utf-8');
  promptCache.set(advisorId, content);
  return content;
}
```

**Registry** — minimal metadata needed by the pipeline:

```typescript
interface AdvisorEntry {
  id: string;
  name: string;
  role: 'author' | 'critic' | 'editor' | 'strategist';
}
```

Advisor prompt files are copied from the VBOA's `va-web-app/src/lib/advisors/prompts/` directory for existing advisors. New advisors (Copywriter, SEO Expert) are created fresh. The VBOA remains the canonical source for advisor development — prompts are copied here as a deployment artifact, not maintained in two places.

**External dependency:** Advisor prompts originate in the `va-web-app` repository. The VBOA's `/add-advisor` skill is used to create new advisors there. Prompts are then copied to this codebase's `src/lib/advisors/prompts/` directory. Long-term, a shared package or build step could sync these, but for now a manual copy suffices.

### Key Architectural Insight

The existing agent tools already make their own Claude API calls with specific prompts (e.g., `design_brand` in `website.ts` calls Claude with `buildBrandIdentityPrompt()`). The agent-runtime system prompt governs the **orchestrator**. The advisor-specific work happens inside tools.

This means:
- **April Dunford runs as the orchestrator agent** — her persona is the runtime's system prompt. She reads critiques and decides approve or revise.
- **Each advisor's work happens inside tools** — `generate_draft` calls Claude with the copywriter's system prompt; `run_parallel_critiques` calls Claude with each critic's system prompt.
- No changes to `agent-runtime.ts`.

---

## Foundation Document System

### Document Types

| # | Type | Key | Primary Advisor | Inputs |
|---|------|-----|----------------|--------|
| 1 | Strategy | `strategy` | Richard Rumelt | User input, research data, strategic inputs (see below) |
| 2 | Positioning Statement | `positioning` | April Dunford | Strategy |
| 3 | Brand Voice | `brand-voice` | *New: Copywriter* | Positioning |
| 4 | Design Principles | `design-principles` | Derived (no advisor) | Positioning, Strategy, seed from `docs/design/design-principles.md` |
| 5 | SEO Strategy | `seo-strategy` | *New: SEO Expert* | Positioning, research data |
| 6 | Social Media Strategy | `social-media-strategy` | *TBD* | Positioning, Brand Voice |

### Creation Hierarchy

Strategy must exist before Positioning. Positioning must exist before items 3-6. Items 3-6 can generate in parallel once Positioning exists. The UI enforces this by disabling Generate buttons when upstream documents are missing.

Design Principles are derived, not interactive. The system reads the existing `docs/design/design-principles.md` as a seed, then adapts based on Strategy and Positioning for the specific idea.

### Strategic Inputs (Pre-Generation)

The ProductIdea type has four substantive fields: `name`, `description`, `targetUser`, `problemSolved`. This is too thin to generate a meaningful strategy — the LLM fills in strategic choices with plausible defaults, producing generic output that cascades through all downstream documents.

Before generating the Strategy document, the UI prompts the user for three strategic inputs:

1. **"What makes your approach fundamentally different from existing solutions?"** — Forces differentiation beyond the product description.
2. **"What are you deliberately choosing NOT to do?"** — Strategy is as much about what you say no to. Forces focus.
3. **"Who specifically are you NOT targeting?"** — Prevents the "everyone" trap.

These are optional fields on `ProductIdea` (or a separate `StrategicInputs` type stored alongside). If the user skips them, the Strategy document is generated with inline markers: `[ASSUMPTION: The LLM inferred this strategic choice — review and confirm]`. This makes the generic parts visible rather than hiding them in plausible prose.

### Data Model

```typescript
type FoundationDocType =
  | 'strategy'
  | 'positioning'
  | 'brand-voice'
  | 'design-principles'
  | 'seo-strategy'
  | 'social-media-strategy';

interface FoundationDocument {
  id: string;                     // e.g., 'strategy'
  ideaId: string;                 // which product idea this belongs to
  type: FoundationDocType;
  content: string;                // plain text, optimized for LLM consumption
  advisorId: string;              // which advisor created/last edited it
  generatedAt: string;            // ISO timestamp of last generation
  editedAt: string | null;        // ISO timestamp of last manual edit (null if never edited)
  version: number;                // increments on each save
}
```

### Redis Storage

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `foundation:{ideaId}` | Hash | None | All foundation docs for an idea (field = docType, value = JSON) |
| `foundation_progress:{ideaId}` | String (JSON) | 1hr | Generation progress tracking |

### Creation Flow

When the user clicks "Generate" on a foundation document:
1. Tool loads all upstream foundation docs as context
2. Tool loads research data (SEO synthesis, competitors) where relevant
3. Tool calls Claude with the assigned advisor's system prompt + framework prompt + context
4. Output saved to Redis

### Editing Flow

When the user clicks "Edit" on a foundation document:
1. Opens interactive chat page with the assigned advisor's persona as system prompt
2. Existing document loaded as context
3. User collaborates with advisor to revise
4. On save: `editedAt` updated, `version` incremented

---

## Content Pipeline Engine

### The Critique Cycle

Every content output runs through the same pattern. What changes per content type is which advisors participate and what they evaluate.

```
STEP 1: GENERATE DRAFT
  One advisor writes the draft with all foundation docs + research data as context.

STEP 2: PARALLEL CRITIQUE
  Multiple advisors critique in parallel (Promise.all inside a single tool).
  Each returns structured feedback as AdvisorCritique.

STEP 3: EDITOR QUALITY GATE
  April Dunford (the orchestrator) reads all critiques + the draft.
  Decision: APPROVE or REVISE.
  If REVISE: she writes a revision brief synthesizing what needs to change.

STEP 4a (APPROVE): Save final content, proceed to deployment.
STEP 4b (REVISE): Original author rewrites using editor's brief → back to Step 2.

Loop continues until the editor approves or maxRevisionRounds is reached.
```

### Pause/Resume During Critique Cycles

**Wall-clock budget:** One critique round takes ~70-120s (draft generation ~20-40s, parallel critiques ~15-25s, orchestrator turns ~15-30s overhead). Two rounds fit within a single 270s time budget. Three rounds will require at least one pause/resume cycle.

The critique cycle runs inside the existing `agent-runtime.ts` loop. If the time budget expires mid-cycle:

1. The agent pauses (`state.status = 'paused'`), full state saved to Redis (2hr TTL).
2. The frontend polling detects `status: 'paused'` from the GET response.
3. The frontend sends a follow-up POST to resume. **This resume-triggering logic must be built into each new API route and the frontend polling code** — it is not automatic. The existing content agent implements this pattern in its POST handler (checking for `getActiveRunId`).
4. `resumeAgent()` reconstructs the agent with full conversation history from Redis.

**Critical: tool closure state does not survive pause/resume.** The existing agent tools (e.g., `createWebsiteTools`) use closure-scoped variables (`let brand = null`, `let repo = null`) that are destroyed when the serverless function ends. On resume, tools are re-instantiated with empty state. The conversation history tells the orchestrator what happened, but the tools themselves have no memory.

**Mitigation for critique tools:** All critique tools must be **stateless**. Each tool execution loads what it needs from Redis rather than relying on in-memory state from prior tool calls:
- `generate_draft` saves the draft to Redis (`draft:{ideaId}:{contentType}`) and returns it.
- `run_parallel_critiques` reads the draft from Redis (not from a closure variable).
- `revise_draft` reads the previous draft from Redis, saves the revised draft back.
- `save_content` reads the final draft from Redis.

This stateless pattern avoids the closure problem entirely. It also means the "Generate All" foundation pipeline must check which docs already exist in Redis before re-generating — on resume, Strategy may exist but Positioning may not.

**Pre-existing bug:** The `planStore` in `common.ts` (an in-memory Map) has the same problem — plans are lost on resume. The orchestrator's conversation history contains the plan (as a `create_plan` tool result), so Claude "knows" the plan, but `update_plan` calls will fail on an empty array. This should be fixed separately or worked around by not using plan tools in the critique orchestrator.

**Turn budget estimate:** One full critique round = ~3 orchestrator turns (generate_draft + run_parallel_critiques + editor decision). With `maxTurns: 20`, the system supports up to ~5-6 revision rounds before hitting the turn limit, well above the `maxRevisionRounds: 3` safety limit.

### Editor Decision Logic

April Dunford's orchestrator system prompt instructs her to:
- **APPROVE** if all critiques score above threshold and no high-severity issues remain
- **REVISE** if any critique has high-severity issues, with a brief synthesizing actionable changes
- She can override a low score if she judges the concern doesn't apply (editorial discretion)

### Structured Critique Output

Each critique tool returns the same shape, extending the existing `Evaluation` pattern with advisor attribution and issue severity:

```typescript
interface CritiqueIssue {
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
}

interface AdvisorCritique {
  advisorId: string;
  domain: string;           // 'positioning' | 'seo' | 'behavioral' | etc.
  score: number;            // 1-10
  pass: boolean;
  issues: CritiqueIssue[];  // typed issues with severity
}
```

The severity field gives the editor a concrete rubric: APPROVE if no high-severity issues remain (regardless of numeric score). REVISE if any high-severity issue exists, synthesizing the revision brief from high and medium issues. Low-severity issues are noted but don't block approval.

### Content Recipe Schema

```typescript
interface ContentRecipe {
  contentType: string;
  authorAdvisor: string;
  authorPromptBuilder: string;
  critics: CriticConfig[];
  editorThreshold: number;        // min average score to auto-approve (e.g., 7)
  maxRevisionRounds: number;      // safety limit (e.g., 3)
  foundationDocs: FoundationDocType[];
}

interface CriticConfig {
  advisorId: string;
  domain: string;
  evaluationPrompt: string;       // what specifically to evaluate
  contextDocs: FoundationDocType[]; // which foundation docs this critic receives
}
```

---

## Content Recipes

### Recipe 1: Website Copy

Highest-stakes output. Broadest critique panel.

| Role | Advisor | Focus |
|------|---------|-------|
| Author | Copywriter (new) | Landing page copy: hero, value props, CTAs, FAQ. Uses brand voice + positioning. |
| Critic | April Dunford | Does the copy reflect positioning? Are competitive alternatives clear? Is the "why now" compelling? **Context:** Positioning, Strategy |
| Critic | SEO Expert (new) | Keyword density in headlines, meta description, heading hierarchy, internal link opportunities. **Context:** SEO Strategy, research keyword data |
| Critic | Shirin Oreizy | CTA clarity, friction reduction, cognitive load, social proof approach, urgency without manipulation. **Context:** target user description only |
| Editor | April Dunford | Synthesizes all critiques. Approves or sends back. |

**Foundation docs consumed by author:** Strategy, Positioning, Brand Voice, Design Principles, SEO Strategy
**Foundation docs consumed by critics:** Each critic receives a tailored subset (shown above) to keep prompts focused and reduce token cost.

After copy is approved, it flows into the existing deployment pipeline: `assemble_site_files` (enhanced to read approved copy + Design Principles) → `validate_code` → `create_repo` → `push_files` → deploy.

### Recipe 2: Blog Post

| Role | Advisor | Focus |
|------|---------|-------|
| Author | Copywriter (new) | Writes the post using brand voice, targeting keywords from SEO strategy. |
| Critic | April Dunford | Does the post reinforce positioning? On-brand? Right audience? **Context:** Positioning |
| Critic | SEO Expert (new) | Keyword placement, heading structure, PAA coverage, meta description, internal linking. **Context:** SEO Strategy, keyword data |
| Critic | Andy Raskin | Compelling narrative arc? Opens with a shift in the world, not a product pitch? **Context:** draft only (narrative is self-evident) |
| Editor | April Dunford | Quality gate. |

**Foundation docs consumed:** Positioning, Brand Voice, SEO Strategy

**Additional inputs:** Content calendar piece data (target keywords, content gap, topic) from existing content agent.

### Recipe 3: Social Media Post

Lighter-weight — fewer critics, faster cycle.

| Role | Advisor | Focus |
|------|---------|-------|
| Author | Copywriter (new) | Short-form content matching brand voice and platform conventions. |
| Critic | SEO Expert / Social advisor | Hashtag strategy, hook effectiveness, CTA clarity. |
| Editor | April Dunford | Quick pass — on-brand and on-positioning? |

**Foundation docs consumed:** Positioning, Brand Voice, Social Media Strategy

---

## New Advisors Required

### Must Create

1. **Copywriter** — Senior brand copywriter. Writes in the brand voice defined by foundation docs. Expert at headlines, CTAs, long-form and short-form. Executes at the copy level, not the strategy level. The brand voice doc should include 5-10 concrete example sentences across contexts (headline, CTA, paragraph opening, technical explanation) — the copywriter's prompt is instructed to mimic the examples, not just interpret abstract tone descriptions like "warm and conversational." This prevents the chain-of-LLM-telephone problem where abstract style descriptions produce generic prose.

2. **SEO Expert** — Technical and content SEO specialist. Keyword optimization, SERP strategy, heading hierarchy, schema markup, internal linking. Evaluates content for search performance. Adds judgment calls beyond what `seo-knowledge.ts` handles deterministically.

### Enable (Existing, Currently Disabled)

3. **Shirin Oreizy** — Behavioral science / CRO expert. "Homer vs Spock" framework. Conversion optimization, cognitive friction, working memory limits. Already exists in the VBOA at `va-web-app/src/lib/advisors/prompts/shirin-oreizy.md` (currently disabled). Copy prompt to this codebase's `src/lib/advisors/prompts/shirin-oreizy.md` and add to local registry.

---

## New Tools

### `src/lib/agent-tools/foundation.ts`

| Tool | Purpose |
|------|---------|
| `load_foundation_docs` | Read one or more foundation documents from Redis for a given idea. Returns their content as context for downstream generation. |
| `generate_foundation_doc` | Generate a foundation document using the assigned advisor's system prompt + framework + upstream docs as context. Saves to Redis. |
| `load_design_seed` | Read the existing `docs/design/design-principles.md` as seed input for design principles generation. |

### `src/lib/agent-tools/critique.ts`

| Tool | Purpose |
|------|---------|
| `generate_draft` | Call Claude with the copywriter's system prompt + foundation docs + content-specific context. Returns draft text. |
| `run_parallel_critiques` | Takes draft + list of critic configs. Makes parallel Claude calls (`Promise.allSettled`), each with a task-focused critique prompt (see below) and the critic's relevant foundation docs. Returns `AdvisorCritique[]` with partial results if a critic fails. |
| `revise_draft` | Call Claude with the copywriter's system prompt + original draft + editor's revision brief. Returns revised draft. |
| `save_content` | Save approved content to Redis. Optionally triggers deployment for websites. |

`run_parallel_critiques` is a single tool that internally runs `Promise.allSettled()` across multiple Claude calls. If one critic call fails (rate limit, timeout, malformed response), the other critiques are still returned. Failed critics are marked with `{ advisorId, domain, error: "..." }` so the editor can decide whether to proceed or retry. The orchestrator calls one tool and gets all critiques back, keeping agent turn count low.

**Critique prompt strategy:** Critic calls use **task-focused critique prompts**, not the full VBOA persona prompts. Full persona prompts (with biographical narrative, speaking style, and conversational scaffolding) encourage the model to roleplay rather than analyze. Critique prompts instead use a template:

```
You are evaluating this content as a [domain] expert.
Your expertise: [2-3 sentence summary of relevant frameworks from the advisor's prompt].
Evaluation criteria: [from CriticConfig.evaluationPrompt]
Respond with structured JSON matching the AdvisorCritique schema.
```

Full persona prompts are reserved for the interactive foundation doc editing chat (Phase 4), where persona fidelity matters.

### Reused Tools (No Changes)

- `create_plan` / `update_plan` from `common.ts`
- `read_scratchpad` / `write_scratchpad` from `common.ts`
- All deployment tools from `website.ts`
- `evaluate_brand` / `validate_code` from `website.ts`

---

## Frontend

### View 1: Foundation Documents Panel

**Route:** `/analyses/[id]/foundation`

Six cards in creation order, each showing:
- Document type and version number
- Primary advisor name
- Generated timestamp
- Last edited timestamp (if manually edited — shown as a badge)
- Preview (first 2-3 lines of content)
- Buttons: Generate, Edit, View

**Card states:**
- **Empty** — upstream docs missing. Generate disabled. Shows "Requires: Strategy" hint.
- **Ready** — upstream docs exist. Generate enabled.
- **Generated** — content exists. All buttons active.
- **Manually edited** — shows `editedAt` badge.

**"Generate All" button** at the top runs the full foundation hierarchy: Strategy → Positioning → (Brand Voice, Design Principles, SEO Strategy, Social Media Strategy in parallel). Progress shown inline on each card.

### View 2: Foundation Doc Editor

**Route:** `/analyses/[id]/foundation/[docType]/edit`

**Note: This is new infrastructure.** The EPCH codebase has zero streaming chat infrastructure — no `ReadableStream` responses, no server-sent events, no chat state management, no streaming text rendering. The VBOA (`va-web-app`) has all of this, but none of it exists here. Phase 4 must build:

1. A streaming chat API route (POST returning `ReadableStream` via Vercel AI SDK's `streamText`)
2. A client-side chat hook (similar to va-web-app's `useChatStream`)
3. Message display component with streaming text rendering
4. Document state management (current version, pending edits, save/discard)

The UI pattern:
- Current document displayed alongside the chat
- Assigned advisor's full persona prompt as system prompt (this is the one place where full persona fidelity matters)
- Existing document content loaded as context
- User describes changes, advisor proposes revisions
- Save button persists to Redis, updates `editedAt`

### View 3: Content Generation with Critique Visibility

Extends the existing content generation progress page. During a pipeline run:

```
✓ Loading foundation documents
✓ Generating draft (Copywriter)
● Running critiques...
  ├─ April Dunford (positioning)    8/10
  ├─ SEO Expert (search)            scoring...
  └─ Shirin Oreizy (behavioral)     scoring...
○ Editor review
○ Revision (if needed)
○ Deploy

Round 1 of 3 max
```

After completion:
- Final approved content viewable
- Collapsible "Critique History" showing each round's scores and feedback
- Which round it was approved on

### Progress Data Model

```typescript
interface PipelineProgress {
  status: 'running' | 'complete' | 'error';
  currentStep: string;
  round: number;
  maxRounds: number;
  steps: PipelineStep[];
  critiqueHistory: CritiqueRound[];
}

interface CritiqueRound {
  round: number;
  critiques: AdvisorCritique[];
  editorDecision: 'approve' | 'revise';
  revisionBrief?: string;
}
```

Cards, progress bars, and polling are existing patterns. The streaming chat (Phase 4) is new infrastructure — see View 2 note above.

---

## Implementation Phases

### Phase 1: Foundation Data Layer + Autonomous Generation

**Goal:** Click "Generate All" and get all 6 foundation documents for an idea.

**Build:**
- `FoundationDocument` type in `src/types/index.ts`
- Redis CRUD in `src/lib/db.ts`
- `src/lib/agent-tools/foundation.ts` — all three tools
- Foundation generation orchestrator (sequential pipeline, no critique cycle yet)
- API route: `POST /api/foundation/[ideaId]` (generate), `GET /api/foundation/[ideaId]` (poll + retrieve)
- Foundation documents panel UI (six cards with Generate/View)

Uses existing advisors (Richard Rumelt, April Dunford) with simple prompts. New advisors not needed yet — foundation docs are strategy documents.

**Test:** Run "Generate All" on an existing idea with research data. Read the 6 documents.

### Phase 2: Critique Engine + New Advisors

**Goal:** Multi-advisor critique cycle works. Website copy goes through write → critique → editor gate → revise loop.

**Build:**
- Create Copywriter and SEO Expert advisors (via `/add-advisor` in VBOA)
- Enable Shirin Oreizy in advisor registry
- `src/lib/agent-tools/critique.ts` — all four tools
- `src/lib/content-recipes.ts` — recipe type and three recipe definitions
- April Dunford orchestrator system prompt
- Wire website recipe into painted door agent: foundation docs → critique cycle → approved copy → existing deployment pipeline
- Enhanced progress tracking with critique round visibility

**Test:** Generate a website for an idea with foundation docs. Watch critique cycle. See round-by-round scores.

### Phase 3: Blog Posts + Content Calendar Integration

**Goal:** Blog posts run through the critique cycle. Content agent uses foundation docs.

**Build:**
- Wire blog post recipe into content agent flow
- Add `foundationDocs?: Record<FoundationDocType, string>` to `ContentContext` type (in `src/lib/content-prompts.ts`). Update `buildContentContext()` in `src/lib/content-agent.ts` to load foundation docs from Redis when available. This propagates to all prompt builders via the existing `ctx` parameter — no signature changes to `buildBlogPostPrompt()`, `buildComparisonPrompt()`, etc. The three call sites (`content-agent.ts:356`, `content-agent.ts:365`, `agent-tools/content.ts:302`) pass `ctx` unchanged.
- Blog posts go through critique cycle before saving
- Content calendar generation reads foundation docs for better topic selection
- Critique history visible on content piece viewer page

**Test:** Generate content calendar, select pieces, watch each blog post go through critique.

### Phase 4: Interactive Editing + Social Media

**Goal:** Foundation docs editable via advisor chat. Social media recipe works.

**Build (note: this is the largest phase due to new streaming infrastructure):**
- Streaming chat API route using Vercel AI SDK `streamText` — `POST /api/foundation/[ideaId]/[docType]/chat`
- Client-side `useChatStream` hook (port pattern from va-web-app or build fresh)
- Message display component with streaming text rendering
- Foundation doc editor page with split layout (document + chat)
- Document save/discard flow with `editedAt` tracking
- Manual-edit badge on foundation cards
- Social media post recipe and generation flow

**Test:** Edit positioning statement via chat with April Dunford, then regenerate website to see changes reflected.

---

## Known Issues / Technical Debt

- **Closure state on pause/resume** is a pre-existing architectural issue affecting all agents. The critique tools are designed stateless (Redis-backed) to avoid it, but the existing website and content agent tools still have this bug. Should be addressed in a separate refactor.
- **`planStore` in-memory Map** (`common.ts`) is lost on resume. The critique orchestrator should avoid using `create_plan` / `update_plan` tools, or the plan tools should be refactored to use Redis.
- **Foundation doc cleanup** must be added to `deleteIdeaFromDb()` in `src/lib/db.ts` — add `await r.del('foundation:${id}')`.
- **Advisor .md files on Vercel** — verify that `src/lib/advisors/prompts/*.md` files are included in the serverless function bundle. May require `includeFiles` in Vercel config. The existing `fs.readFileSync` usage in `painted-door-templates.ts` works for the `content/` directory, so the pattern should work, but needs verification.
- **`buildBaseContext()` in `content-prompts.ts`** does not reference `foundationDocs` — adding the field to `ContentContext` propagates the data, but the prompt builders must be updated to actually include it in the prompt text.

## Cost Estimates

| Scenario | Est. API Calls | Est. Cost |
|----------|---------------|-----------|
| Single blog post (1 round) | 5 | ~$0.41 |
| Single blog post (2 rounds) | 8 | ~$0.66 |
| Website copy (2 rounds) | 8 | ~$0.70 |
| "Generate All" foundation docs | 6 | ~$0.30 |
| Full suite (6 foundation + website + 8 blog posts) | ~70 | ~$7.00 |

Costs at Claude Sonnet pricing ($3/M input, $15/M output). Economically reasonable for a small SaaS generating content for painted door tests.

**Latency note:** A full content suite (~70 API calls) requires 3-5 pause/resume cycles across multiple Vercel function invocations. Total wall-clock time: 10-20 minutes depending on API response times. The frontend polling UI handles this transparently.

## Out of Scope

- Downstream dependency tracking / cascading regeneration
- Foundation doc version history or diffing (just a `version` counter)
- A/B testing or multi-variant generation
- Publishing to social media platforms (generates content only)
- Changes to `agent-runtime.ts`
