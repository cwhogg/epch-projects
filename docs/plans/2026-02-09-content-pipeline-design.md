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
├── prompts/
│   ├── richard-rumelt.ts       # Strategy advisor — exports prompt string
│   ├── april-dunford.ts        # Positioning + editor
│   ├── andy-raskin.ts           # Strategic narrative
│   ├── shirin-oreizy.ts        # Behavioral science / CRO
│   ├── copywriter.ts           # New: brand copywriter
│   ├── seo-expert.ts           # New: SEO specialist
│   └── index.ts                # Re-exports all prompts as a Record<string, string>
├── registry.ts                 # Advisor metadata array
└── prompt-loader.ts            # Simple import-based lookup (no filesystem access)
```

**Prompt storage — TypeScript string exports, not filesystem reads.** Using `fs.readFileSync` with `process.cwd()` fails on Vercel serverless functions because the `src/` directory structure is not preserved in the deployed bundle. Different API routes produce different function bundles with potentially different file inclusions, and `process.cwd()` doesn't reliably point to the project root. Rather than debugging `includeFiles` in `vercel.json`, store prompts as TypeScript string constants which are bundled by the compiler:

```typescript
// src/lib/advisors/prompts/richard-rumelt.ts
export const prompt = `You are Richard Rumelt, ...`;

// src/lib/advisors/prompts/index.ts
export { prompt as richardRumelt } from './richard-rumelt';
export { prompt as aprilDunford } from './april-dunford';
// ... etc

// src/lib/advisors/prompt-loader.ts
import * as prompts from './prompts';

const promptMap: Record<string, string> = {
  'richard-rumelt': prompts.richardRumelt,
  'april-dunford': prompts.aprilDunford,
  // ... etc
};

export function getAdvisorSystemPrompt(advisorId: string): string {
  const prompt = promptMap[advisorId];
  if (!prompt) throw new Error(`Unknown advisor: ${advisorId}`);
  return prompt;
}
```

This eliminates the filesystem dependency entirely. For ~6 advisor prompts of 1-2KB each, embedding as string constants is trivial. The prompt content is copied from VBOA markdown files — just wrap in a template literal.

**Registry** — minimal metadata needed by the pipeline:

```typescript
interface AdvisorEntry {
  id: string;
  name: string;
  role: 'author' | 'critic' | 'editor' | 'strategist';
}
```

**External dependency:** Advisor prompts originate in the `va-web-app` repository. The VBOA's `/add-advisor` skill is used to create new advisors there. Prompt content is then copied to this codebase's `src/lib/advisors/prompts/*.ts` files as TypeScript string exports. The VBOA remains the canonical source — prompts here are deployment artifacts, not maintained in two places.

### Key Architectural Insight

The existing agent tools already make their own Claude API calls with specific prompts (e.g., `design_brand` in `website.ts` calls Claude with `buildBrandIdentityPrompt()`). The agent-runtime system prompt governs the **orchestrator**. The advisor-specific work happens inside tools.

This means:
- **The orchestrator is a neutral pipeline executor** — its system prompt contains procedural instructions for the critique cycle, not a persona. It reads critiques, applies the decision rubric, and calls the appropriate tools. Giving the orchestrator a persona (e.g., April Dunford) conflates three roles — agent orchestration, domain expertise, and editorial judgment — requiring three different prompt strategies that compete with each other. The persona framing makes the model narrate instead of executing tools.
- **Each advisor's work happens inside tools** — `generate_draft` calls Claude with the copywriter's system prompt; `run_parallel_critiques` calls Claude with each critic's system prompt. April Dunford's positioning expertise appears as one of the critique calls inside `run_parallel_critiques`, not as the orchestrator.
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

**Downstream blocking:** If the Strategy document contains `[ASSUMPTION]` markers, the UI shows a warning on the Strategy card: "Contains assumptions — review before generating downstream documents." Downstream generation (Positioning, etc.) is not blocked, but the markers are stripped before passing Strategy as context to downstream calls. Instead, downstream prompts receive a note: "Note: Strategy was auto-generated without full user input. Strategic claims should be treated as provisional." This prevents markers from leaking into or confusing downstream LLM calls while preserving the human-facing signal.

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
| `foundation:{ideaId}:{docType}` | String (JSON) | None | One foundation document per key |
| `foundation_progress:{ideaId}` | String (JSON) | 1hr | Generation progress tracking |
| `foundation_lock:{ideaId}` | String | 10min | Idempotency lock for "Generate All" |

Foundation documents are stored as individual keys (not a hash) to avoid Upstash payload size limits. A single Redis hash storing all 6 documents could approach the 1MB REST API request body limit after editing, and `HGETALL` on large hashes is slow over HTTP. Individual keys also enable per-document reads without loading the full set.

**Key enumeration for cleanup:** Deleting an idea requires deleting all 6 doc type keys. The `deleteIdeaFromDb()` function enumerates all `FoundationDocType` values and deletes: `foundation:{id}:strategy`, `foundation:{id}:positioning`, etc. No pattern scan needed — the doc types are a fixed enum.

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
  One advisor writes the draft with recipe-specified foundation docs + research data as context.

STEP 2: CRITIQUES (concurrency-limited)
  Multiple advisors critique via a single tool. Runs with concurrency limit of 2
  (not fully parallel) to avoid Anthropic rate limits. Each returns AdvisorCritique
  via Anthropic tool_use for schema enforcement.

STEP 3: ORCHESTRATOR DECISION
  The orchestrator (neutral pipeline executor, NOT a persona) reads all critiques.
  Calls the `editor_decision` tool with decision: 'approve' | 'revise' and optional brief.
  Decision is mechanical: APPROVE if zero high-severity issues. REVISE otherwise.
  Safety valve: if average score < 4, always REVISE regardless of severity.

STEP 4a (APPROVE): Call `save_content`. Proceed to deployment.
STEP 4b (REVISE): Call `revise_draft` with brief → SUMMARIZE round → back to Step 2.

STEP 5 (between rounds): Call `summarize_round` to compress previous round's data.
  This prevents conversation history from growing unbounded across rounds.

Loop continues until approved or maxRevisionRounds reached.
On max rounds reached: save content with status 'max-rounds-reached' (not fake approval).
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

**Turn budget estimate:** One full critique round = ~4 orchestrator turns (generate_draft + run_critiques + editor_decision + summarize_round). With `maxTurns: 20`, the system supports up to ~4-5 revision rounds before hitting the turn limit, above the `maxRevisionRounds: 3` safety limit.

### Context Window Management

**Problem:** Without mitigation, conversation history grows by ~20,000-30,000 tokens per critique round (draft text + 3-4 full critique JSONs + editor response + revision brief + revised draft). By round 2, the orchestrator's `messages.create` call sends 60,000-90,000 input tokens. This degrades attention on foundation documents, inflates costs, and risks hitting context limits.

**Mitigation — round summarization:** After each round's `editor_decision`, the orchestrator calls `summarize_round`. This tool:
1. Saves the full round data to Redis at `critique_round:{runId}:{round}` (preserving detail for the critique history UI).
2. Returns a compressed summary to the conversation: "Round N: Draft scored [avg]. High issues: [list]. Editor decision: revise. Brief: [text]."

The orchestrator then calls `revise_draft`, which loads the latest draft from Redis (not from conversation history). The revised draft flows into the next `run_critiques` call. The conversation carries only summaries of prior rounds, not the raw data.

**Token budget per call (estimated):**
| Call | Input Tokens | Notes |
|------|-------------|-------|
| `generate_draft` (inside tool) | ~12,000-18,000 | System prompt + foundation docs + research data |
| Each critic call (inside tool) | ~6,000-12,000 | Critic prompt + draft + tailored context docs |
| Orchestrator turn (round 1) | ~8,000-12,000 | System prompt + tool definitions + critique results |
| Orchestrator turn (round 2) | ~10,000-15,000 | Above + round 1 summary (~500 tokens) |

With round summarization, the orchestrator's context grows by ~500 tokens per round instead of ~25,000. This keeps costs linear rather than quadratic.

### Editor Decision Logic

The orchestrator's system prompt contains a **procedural decision rubric**, not a persona:

```
You are a content pipeline orchestrator. After receiving critiques from `run_critiques`,
apply these rules:

1. If ANY critique contains a high-severity issue → call `editor_decision` with
   decision='revise' and a brief synthesizing what needs to change.
   Focus the revision brief on HIGH and MEDIUM issues only. Instruct the author:
   "Address only the high-severity issues. Do not change aspects that scored well."
2. If NO high-severity issues AND average score >= 4 → call `editor_decision`
   with decision='approve'.
3. If NO high-severity issues BUT average score < 4 → call `editor_decision`
   with decision='revise' (safety valve for "technically okay but clearly bad").
4. If critiques show oscillation (scores decreasing from previous round) →
   call `editor_decision` with decision='approve' and note the best-scoring round.

Do NOT narrate your reasoning. Call the tool.
```

The `editor_decision` tool is the **only mechanism** for advancing the pipeline. This eliminates ambiguity — the system cannot proceed on free-text responses. Scores are used for reporting/visibility; severity drives the actual decision.

**No editorial discretion.** The previous design gave the editor override power, which produces non-deterministic behavior. The rubric is mechanical. If the rubric produces bad results for a specific content type, adjust the recipe's critic configs and evaluation prompts — don't add LLM judgment at the decision layer.

### Structured Critique Output

Critics return structured feedback via **Anthropic tool_use** (not raw JSON in text). Each critique call defines `submit_critique` as a tool the critic must call, enforcing the schema at the API level:

```typescript
// Tool definition passed to each critic call
const submitCritiqueTool = {
  name: 'submit_critique',
  description: 'Submit your structured evaluation of the content.',
  input_schema: {
    type: 'object',
    properties: {
      score: { type: 'number', minimum: 1, maximum: 10 },
      pass: { type: 'boolean' },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['high', 'medium', 'low'] },
            description: { type: 'string' },
            suggestion: { type: 'string' },
          },
          required: ['severity', 'description', 'suggestion'],
        },
      },
    },
    required: ['score', 'pass', 'issues'],
  },
};
```

This eliminates the fragile JSON-in-text parsing problem. The critic's response is guaranteed to match the schema. The `run_critiques` tool extracts the tool_use block from each critic response and wraps it with `advisorId` and `domain`:

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

### Content Recipe Schema

```typescript
interface ContentRecipe {
  contentType: string;
  authorAdvisor: string;
  authorPromptBuilder: string;
  authorContextDocs: FoundationDocType[];  // which docs the author receives
  critics: CriticConfig[];
  minAggregateScore: number;              // safety valve — always revise below this (e.g., 4)
  maxRevisionRounds: number;              // safety limit (e.g., 3)
}

interface CriticConfig {
  advisorId: string;
  domain: string;
  evaluationPrompt: string;       // what specifically to evaluate
  contextDocs: FoundationDocType[]; // which foundation docs this critic receives
}
```

Note: `editorThreshold` removed. The decision is severity-driven, not score-driven. `minAggregateScore` is a safety valve only (catches "no high issues but everything is 2/10"). `foundationDocs` on the recipe replaced with `authorContextDocs` — each critic already specifies its own `contextDocs`, and the author should also receive a tailored subset to manage token budgets.

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

**Author context docs:** Positioning, Brand Voice, SEO Strategy (3 docs, ~4,000-8,000 tokens). Strategy and Design Principles omitted from the author call to stay within token budget — the positioning statement already distills the strategy, and design principles inform the site build, not the copy.
**Critic context docs:** Each critic receives a tailored subset (shown above) to keep prompts focused and reduce token cost.

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

1. **Copywriter** — Senior brand copywriter. Writes in the brand voice defined by foundation docs. Expert at headlines, CTAs, long-form and short-form. Executes at the copy level, not the strategy level.

   **Brand voice exemplar requirements:** The brand voice foundation doc must include:
   - 5-10 concrete example sentences across **specified contexts** (headline, CTA, paragraph opening, technical explanation, error message). The generation prompt explicitly requires one example per context type.
   - A **counter-examples** section: "The brand voice does NOT sound like: [3-5 examples of wrong tone]." Counter-examples are surprisingly effective at constraining LLM output.
   - The generation prompt includes a self-check: "Verify each example is stylistically distinct and serves its specific context — a headline example should not read like a paragraph opening."

   The copywriter's prompt is instructed to mimic the examples, not interpret abstract tone descriptions like "warm and conversational." This prevents the chain-of-LLM-telephone problem where abstract style descriptions produce generic prose.

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
| `generate_draft` | Call Claude with the copywriter's system prompt + recipe-specified foundation docs + content-specific context. Saves draft to Redis at `draft:{runId}` (TTL = 2hr). Returns draft text. |
| `run_critiques` | Reads draft from Redis. Runs critic calls with **concurrency limit of 2** (see below). Each critic uses Anthropic `tool_use` for structured output. Returns `AdvisorCritique[]` with partial results on failure. |
| `editor_decision` | Called by the orchestrator to advance the pipeline. Input: `{ decision: 'approve' | 'revise', brief?: string }`. This is the **only way** to proceed — no free-text decisions. |
| `revise_draft` | Reads previous draft from Redis. Calls Claude with copywriter's system prompt + draft + editor's revision brief. Saves revised draft to `draft:{runId}`. Returns revised text. |
| `summarize_round` | Saves full round data to `critique_round:{runId}:{round}` in Redis. Returns a compressed ~500-token summary for the conversation history. |
| `save_content` | Reads final draft from Redis. Saves approved content. Optionally triggers deployment. Records `quality: 'approved' | 'max-rounds-reached'`. |

**Draft key scoping:** Drafts use `draft:{runId}` (not `draft:{ideaId}:{contentType}`). Each agent run has a unique `runId`, preventing collisions when multiple content pipelines run concurrently for the same idea. TTL matches `STATE_TTL` (2 hours) so drafts auto-expire with agent state.

**Concurrency-limited critiques:** `run_critiques` does NOT fire all critics in parallel. Anthropic rate limits (especially tokens-per-minute) make 3-4 simultaneous calls risky — each critique sends 6,000-12,000 input tokens, and a parallel burst of 4 calls can exceed Tier 1 TPM limits. Instead, use a concurrency limiter (e.g., `p-limit(2)`) with `Promise.allSettled`. Each failed critic (rate limit, timeout, malformed tool_use response) is marked with `{ advisorId, domain, error: "..." }`. The orchestrator sees partial results and decides whether to proceed.

**Critique prompt strategy:** Critic calls use **task-focused critique prompts**, not the full VBOA persona prompts. Full persona prompts (with biographical narrative, speaking style, and conversational scaffolding) encourage the model to roleplay rather than analyze. Critique prompts use a focused template, and critics return structured output via Anthropic `tool_use` (not raw JSON in text — see `submit_critique` tool definition above):

```
You are evaluating this content as a [domain] expert.
Your expertise: [2-3 sentence summary of relevant frameworks from the advisor's prompt].
Evaluation criteria: [from CriticConfig.evaluationPrompt]
Use the submit_critique tool to provide your evaluation.
```

Full persona prompts are reserved for the interactive foundation doc editing chat (Phase 4), where persona fidelity matters.

### All Redis Keys (Complete Reference)

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `foundation:{ideaId}:{docType}` | String (JSON) | None | Foundation document |
| `foundation_progress:{ideaId}` | String (JSON) | 1hr | Foundation generation progress |
| `foundation_lock:{ideaId}` | String | 10min | "Generate All" idempotency lock |
| `draft:{runId}` | String | 2hr | Current draft for a pipeline run |
| `critique_round:{runId}:{round}` | String (JSON) | 2hr | Full round data for critique history UI |
| `pipeline_progress:{runId}` | String (JSON) | 2hr | Structured progress for frontend polling |
| `agent_state:{runId}` | String (JSON) | 2hr | Agent state (existing) |
| `active_run:{agentId}:{entityId}` | String | 2hr | Active run mapping (existing) |
| `scratchpad:{ideaId}` | Hash | None | Scratchpad (existing) |

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

**"Generate All" button** at the top runs the full foundation hierarchy: Strategy → Positioning → (Brand Voice, Design Principles, SEO Strategy, Social Media Strategy sequentially within a batch tool). Progress shown inline on each card.

**Idempotency:** "Generate All" acquires a Redis lock (`SETNX foundation_lock:{ideaId} {runId} EX 600`). If the lock exists, the button is disabled with "Generation in progress." The lock is released on completion or expires after 10 minutes.

**Error recovery:** If generation fails partway (e.g., Strategy succeeds but SEO Strategy fails), the UI shows per-card status. Each card gets an individual **Retry** button. "Generate All" checks which docs already exist and skips them — so clicking it again only generates missing documents, not re-running everything.

**Foundation batch tool:** Items 3-6 cannot run truly in parallel inside the agent runtime (the runtime processes tool calls sequentially). Instead, a single `generate_foundation_batch` tool handles items 3-6 internally, using `Promise.allSettled` with concurrency limit of 2 (same pattern as critiques, same rate limit concern). This keeps the orchestrator turn count low while achieving partial parallelism inside the tool.

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
  status: 'running' | 'complete' | 'error' | 'max-rounds-reached';
  currentStep: string;
  round: number;
  maxRounds: number;
  quality: 'approved' | 'max-rounds-reached' | null;
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

**Progress storage:** Critique tools write structured progress to `pipeline_progress:{runId}` in Redis (2hr TTL). The frontend polls this key alongside agent state. The existing `onProgress(status, detail)` callback is string-only and cannot carry structured critique data, so progress updates go directly to Redis rather than through the callback.

**Max rounds reached:** When `maxRevisionRounds` is hit without approval, the content is saved with `quality: 'max-rounds-reached'`. The UI displays: "This content reached the maximum revision rounds. Review the critique history and consider editing manually." Remaining high-severity issues are shown. This is explicitly NOT a silent approval.

Cards, progress bars, and polling are existing patterns. The streaming chat (Phase 4) is new infrastructure — see View 2 note above.

---

## Implementation Phases

### Phase 0: Validation (Before Building)

**Goal:** Prove that foundation documents actually improve content quality before investing in the full pipeline.

**Method:**
1. Take an existing idea with research data.
2. Manually generate a Strategy and Positioning document (single Claude call each, or by hand).
3. Generate a blog post WITH those documents as context.
4. Generate a blog post WITHOUT them (current single-pass approach).
5. Compare qualitatively. If the improvement isn't obvious and significant, the content pipeline integration needs a different approach (e.g., extracting key phrases rather than passing whole documents).

This takes ~30 minutes and costs ~$1. It validates the core premise before building anything. If the improvement is marginal, the foundation document system is still valuable as a strategic planning tool for the user, but the critique pipeline may be over-engineering.

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

### Phase 4a: Interactive Editing (Streaming Chat Infrastructure)

**Goal:** Foundation docs editable via advisor chat.

**Note: This is the largest phase.** The EPCH codebase has zero streaming chat infrastructure. This phase builds a fundamentally new UI pattern. Consider whether an intermediate non-streaming editor (form-based: user submits revision request, polls for result using existing patterns) could ship first and defer streaming to a later iteration.

**Build:**
- Streaming chat API route using Vercel AI SDK `streamText` — `POST /api/foundation/[ideaId]/[docType]/chat`
- Client-side `useChatStream` hook (port pattern from va-web-app or build fresh)
- Message display component with streaming text rendering
- Foundation doc editor page with split layout (document + chat)
- Document save/discard flow with `editedAt` tracking
- Manual-edit badge on foundation cards
- Chat history persistence (or ephemeral — decide during implementation)
- Error handling for stream interruptions

**Test:** Edit positioning statement via chat with April Dunford, then regenerate website to see changes reflected.

### Phase 4b: Social Media Recipe

**Goal:** Social media post recipe works through the critique cycle.

**Build:**
- Social media post recipe and generation flow
- Social media content type in content calendar

**Test:** Generate social media posts through critique cycle. Lighter-weight than website/blog recipes.

---

## Known Issues / Technical Debt

- **Closure state on pause/resume** is a pre-existing architectural issue affecting all agents. The critique tools are designed stateless (Redis-backed) to avoid it, but the existing website and content agent tools still have this bug. Should be addressed in a separate refactor.
- **`planStore` in-memory Map** (`common.ts`) is lost on resume. The critique orchestrator should avoid using `create_plan` / `update_plan` tools, or the plan tools should be refactored to use Redis.
- **Foundation doc cleanup** must be added to `deleteIdeaFromDb()` in `src/lib/db.ts` — delete all 6 doc type keys: `foundation:{id}:strategy`, `foundation:{id}:positioning`, etc.
- **`buildBaseContext()` in `content-prompts.ts`** does not reference `foundationDocs` — adding the field to `ContentContext` propagates the data, but the prompt builders must be updated to actually include it in the prompt text.
- **Multi-persona overhead vs. value:** The advisor persona system adds maintenance burden (registry, loader, prompt copying from VBOA). For the critique pipeline, the actual value comes from the evaluation criteria in `CriticConfig.evaluationPrompt` and the `submit_critique` tool schema, not the persona wrapper. The persona layer is most valuable for interactive editing (Phase 4a) and organizational clarity. If maintenance cost becomes excessive, consider collapsing to rubric-only evaluation for critics.
- **Revision loop oscillation:** If two critics have contradictory requirements (SEO wants keywords, positioning wants clean messaging), revisions may oscillate. The `summarize_round` tool tracks score trends to detect this, and the orchestrator rubric says "approve if scores are decreasing." Longer-term, critic prompts should explicitly state which aspects are non-negotiable vs. nice-to-have.
- **`p-limit` dependency:** The concurrency limiter for critique and foundation batch tools requires `p-limit` (or a manual implementation). Small dependency but worth noting.

## Cost Estimates

**Methodology:** Costs account for context accumulation within tool calls (foundation docs + draft + system prompt per call). Round summarization keeps orchestrator context growth linear (~500 tokens/round) rather than quadratic. Estimates assume Claude Sonnet pricing ($3/M input, $15/M output).

| Scenario | Est. API Calls | Est. Input Tokens | Est. Output Tokens | Est. Cost |
|----------|---------------|-------------------|--------------------| ----------|
| Single blog post (1 round) | 5 | ~55K | ~8K | ~$0.29 |
| Single blog post (2 rounds) | 8 | ~90K | ~14K | ~$0.48 |
| Website copy (2 rounds) | 8 | ~100K | ~16K | ~$0.54 |
| "Generate All" foundation docs | 6 | ~60K | ~12K | ~$0.36 |
| Full suite (6 foundation + website + 8 blog posts) | ~70 | ~800K | ~130K | ~$4.35 |

**Realistic early usage:** Expect 2-3x happy-path costs as users iterate — regenerating Strategy after reviewing, re-running content after editing foundation docs. Budget ~$10-15 for a full suite with iteration, not $4.35.

**Latency note:** A full content suite (~70 API calls) requires 3-5 pause/resume cycles across multiple Vercel function invocations. Total wall-clock time: 10-20 minutes depending on API response times. The frontend polling UI handles this transparently.

**Minimum Anthropic API tier:** Tier 2+ recommended. Tier 1 (40K TPM) may be exceeded by concurrency-limited critique calls during heavy usage. Tier 2 (80K+ TPM) provides comfortable headroom.

## Out of Scope

- Downstream dependency tracking / cascading regeneration
- Foundation doc version history or diffing (just a `version` counter)
- A/B testing or multi-variant generation
- Publishing to social media platforms (generates content only)
- Changes to `agent-runtime.ts`
