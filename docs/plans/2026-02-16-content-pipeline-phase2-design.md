# Content Pipeline Phase 2: Critique Engine + Dynamic Advisor Selection

*February 16, 2026*

**Source:** `docs/plans/2026-02-09-content-pipeline-design.md` (Phase 2 section)

## Goal

Multi-advisor critique cycle works. Website copy goes through write -> critique -> editor gate -> revise loop. Critics are selected dynamically from an enriched advisor registry using LLM-based loose matching — not hardcoded per recipe, not fragile string matching.

## Key Departure from Original Design Doc

The original design doc hardcodes critic assignments per recipe:

```typescript
// Original — brittle, doesn't scale
interface ContentRecipe {
  critics: CriticConfig[];  // "April Dunford evaluates positioning"
}
```

This design adopts the **registry-driven dynamic selection** pattern from the global advisor registry (`~/.claude/advisors/registry.md`). Recipes describe what kind of evaluation a content type needs in prose. Each advisor has prose descriptions of what they evaluate and what they don't. A lightweight LLM call matches them at runtime — loose, semantic matching rather than brittle exact-string comparison.

Any advisor can serve as a critic. The `role` field is informational metadata about the advisor's primary function, not a gate for critic selection. April Dunford remains `role: 'strategist'` (she authors foundation docs) while also being eligible for content critique based on her evaluation expertise.

**What changes from the original design doc:**

| Element | Original | This Design |
|---|---|---|
| `CriticConfig[]` on recipes | Hardcoded critic list per recipe | `evaluationNeeds: string` — prose matched to advisors via LLM |
| `CriticConfig.evaluationPrompt` | Per-recipe, per-critic | `AdvisorEntry.evaluationExpertise` — per-advisor, supplemented by optional per-recipe emphasis |
| `CriticConfig.contextDocs` | Per-recipe, per-critic | `AdvisorEntry.contextDocs` — per-advisor |
| `AdvisorEntry` interface | `id`, `name`, `role` | + `evaluationExpertise`, `doesNotEvaluate`, `contextDocs` |
| Critic selection | Implicit (read from recipe) | LLM-based `selectCritics()` — loose semantic matching |
| April Dunford's role | `'strategist'` | Stays `'strategist'` — role doesn't gate critic selection |
| "April Dunford orchestrator system prompt" | Mentioned in design doc | Removed — orchestrator is neutral, April participates as critic |
| `design_brand` tool | Single-pass (visual + copy) | Split — visual identity only, copy comes from critique pipeline |
| Wiring | Single agent | Two-agent flow: critique agent -> deployment agent |

**What stays the same:** `submit_critique` tool schema, `editor_decision` mechanical rubric, stateless Redis-backed tools, pause/resume behavior, all Redis key patterns and TTLs.

**New in Phase 2:** `p-limit` dependency (concurrency limiter for critique calls — not in `package.json` yet), `summarize_round` with fixed-items tracking, per-recipe evaluation emphasis, cross-round regression guards.

---

## Architecture

### Enriched Advisor Registry

The canonical advisor registry lives at `~/.claude/advisors/registry.md` (global, cross-project). The EPCH codebase's `src/lib/advisors/registry.ts` is a TypeScript derivative kept in sync with the global source.

The registry gains selection metadata:

```typescript
// src/lib/advisors/registry.ts
export interface AdvisorEntry {
  id: string;
  name: string;
  role: 'author' | 'critic' | 'editor' | 'strategist';  // informational, does NOT gate selection
  // Dynamic selection metadata
  evaluationExpertise?: string;           // what they evaluate (2-3 sentences, used in critique prompt AND selection)
  doesNotEvaluate?: string;              // what they don't evaluate (1 sentence, used in selection)
  contextDocs?: FoundationDocType[];      // foundation docs they receive when critiquing (EPCH-specific)
}
```

- **`evaluationExpertise`** replaces the per-recipe `CriticConfig.evaluationPrompt`. Defined once on the advisor. This is both the advisor's evaluation lens (injected into the critique prompt) and the signal the LLM uses during selection. Per-recipe emphasis supplements this (see Content Recipe Schema below).
- **`doesNotEvaluate`** is the negative signal for selection — prevents advisors from being selected for content types outside their expertise.
- **`contextDocs`** is EPCH-specific (references `FoundationDocType`). It appears only in the EPCH TypeScript registry, not the global `~/.claude/advisors/registry.md`. The global registry has the universal fields (`evaluation_expertise`, `best_for`, `not_for`); each project adds its own extensions.
- **`role`** stays as informational metadata. It is NOT used to filter critics. Any advisor with `evaluationExpertise` can serve as a critic.

### Populated Registry

```typescript
export const advisorRegistry: AdvisorEntry[] = [
  // Strategists / Authors — no evaluationExpertise, so won't be selected as critics
  { id: 'richard-rumelt', name: 'Richard Rumelt', role: 'strategist' },
  { id: 'copywriter', name: 'Brand Copywriter', role: 'author' },

  // Advisors with evaluation expertise — eligible for critic selection
  {
    id: 'april-dunford',
    name: 'April Dunford',
    role: 'strategist',  // stays strategist — she authors positioning foundation docs
    evaluationExpertise:
      'Evaluates whether content reflects the positioning statement. ' +
      'Checks the five components: Are competitive alternatives clear? ' +
      'Are unique attributes specific and provable? Does value connect to ' +
      'customer outcomes? Is the target customer evident? Does the market ' +
      'category framing trigger the right assumptions? Catches positioning ' +
      'drift — claims the positioning doesn\'t support.',
    doesNotEvaluate:
      'Does not evaluate technical SEO, code quality, or visual design.',
    contextDocs: ['positioning', 'strategy'],
  },
  {
    id: 'seo-expert',
    name: 'SEO Expert',
    role: 'critic',
    evaluationExpertise:
      'Evaluates content for search performance. Keyword integration ' +
      'in headings and body, meta description quality, heading hierarchy ' +
      '(H1/H2/H3 structure), internal link opportunities, SERP feature ' +
      'optimization (featured snippets, PAA). Grounds every recommendation ' +
      'in keyword data and search intent.',
    doesNotEvaluate:
      'Does not evaluate brand positioning, narrative quality, or visual design.',
    contextDocs: ['seo-strategy'],
  },
  {
    id: 'shirin-oreizy',
    name: 'Shirin Oreizy',
    role: 'critic',
    evaluationExpertise:
      'Evaluates through behavioral science lens. CTA clarity and friction, ' +
      'cognitive load management, social proof approach, urgency without ' +
      'manipulation, working memory limits (5-9 chunks max). Homer vs Spock — ' +
      'does content activate both emotional and rational decision paths? ' +
      'Evaluates whether the page design respects how real humans actually decide.',
    doesNotEvaluate:
      'Does not evaluate SEO keyword strategy, brand positioning accuracy, or technical implementation.',
    contextDocs: [],  // needs only draft + target user description
  },
];
```

When Andy Raskin is added later with `evaluationExpertise` about narrative structure and storytelling, the LLM-based selection will automatically include him for content types whose `evaluationNeeds` mention narrative or storytelling. No recipe or selection function changes needed.

### Content Recipe Schema

Recipes describe what evaluation they need in prose, not domain strings:

```typescript
// src/lib/content-recipes.ts
interface ContentRecipe {
  contentType: string;
  authorAdvisor: string;                    // fixed per content type
  authorContextDocs: FoundationDocType[];   // what the author receives
  evaluationNeeds: string;                  // prose description — what kind of review this content needs
  evaluationEmphasis?: string;              // optional per-recipe focus areas that supplement advisor expertise
  minAggregateScore: number;                // safety valve
  maxRevisionRounds: number;
}
```

The `evaluationEmphasis` field supplements (not replaces) each advisor's `evaluationExpertise`. For website copy, the emphasis might focus on hero section and CTA strength. For blog posts, it might focus on narrative arc and keyword integration. This gives per-content-type tuning without duplicating the advisor's core expertise across recipes.

Three recipes defined now, only website wired in Phase 2:

```typescript
export const recipes: Record<string, ContentRecipe> = {
  website: {
    contentType: 'website',
    authorAdvisor: 'copywriter',
    authorContextDocs: ['positioning', 'brand-voice', 'seo-strategy'],
    evaluationNeeds:
      'This is website landing page copy. Needs review for: positioning accuracy ' +
      'and differentiation clarity, SEO optimization (keywords, headings, meta), ' +
      'and behavioral science (CTA friction, cognitive load, conversion psychology).',
    evaluationEmphasis:
      'Focus especially on the hero section — does it communicate the "why now" ' +
      'and competitive differentiation within the first viewport? Are CTAs ' +
      'low-friction and high-clarity?',
    minAggregateScore: 4,
    maxRevisionRounds: 3,
  },
  'blog-post': {
    contentType: 'blog-post',
    authorAdvisor: 'copywriter',
    authorContextDocs: ['positioning', 'brand-voice', 'seo-strategy'],
    evaluationNeeds:
      'This is a blog post. Needs review for: positioning consistency ' +
      '(reinforces brand positioning without being a sales pitch), SEO ' +
      'optimization (keyword placement, heading structure, PAA coverage), ' +
      'and narrative quality (compelling arc, opens with a shift not a pitch).',
    evaluationEmphasis:
      'Focus on whether the post reinforces market category positioning ' +
      'without reading like marketing copy. The narrative should educate, ' +
      'not sell.',
    minAggregateScore: 4,
    maxRevisionRounds: 3,
  },
  'social-post': {
    contentType: 'social-post',
    authorAdvisor: 'copywriter',
    authorContextDocs: ['positioning', 'brand-voice', 'social-media-strategy'],
    evaluationNeeds:
      'This is a social media post. Needs review for: positioning consistency ' +
      'and hook effectiveness.',
    minAggregateScore: 4,
    maxRevisionRounds: 2,
  },
};
```

### Critic Selection Function

LLM-based loose matching. The selection function asks Claude to match advisors to the recipe's evaluation needs based on each advisor's `evaluationExpertise` and `doesNotEvaluate`. This avoids brittle exact-string matching — a typo in a domain string can't silently bypass evaluation.

```typescript
// src/lib/content-recipes.ts
export async function selectCritics(
  recipe: ContentRecipe,
  registry: AdvisorEntry[],
): Promise<AdvisorEntry[]> {
  // Filter to advisors with evaluation expertise, excluding the recipe's author
  const candidates = registry.filter(a =>
    a.evaluationExpertise && a.id !== recipe.authorAdvisor
  );

  if (candidates.length === 0) return [];

  // Build advisor summaries for the selection prompt
  const advisorDescriptions = candidates.map(a =>
    `- ${a.id}: EVALUATES: ${a.evaluationExpertise} DOES NOT EVALUATE: ${a.doesNotEvaluate || 'N/A'}`
  ).join('\n');

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    system: 'You select which advisors should review content. Return only a JSON array of advisor IDs.',
    messages: [{
      role: 'user',
      content:
        `Content type: ${recipe.contentType}\n` +
        `Evaluation needs: ${recipe.evaluationNeeds}\n\n` +
        `Available advisors:\n${advisorDescriptions}\n\n` +
        `Select the advisors whose expertise matches these evaluation needs. ` +
        `Exclude advisors whose "does not evaluate" conflicts with the needs. ` +
        `Return a JSON array of advisor IDs, e.g. ["april-dunford", "seo-expert"].`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
  try {
    const selectedIds: string[] = parseLLMJson(text);  // handles markdown wrapping, etc.
    return candidates.filter(a => selectedIds.includes(a.id));
  } catch {
    // Selection failure is distinct from "no matching critics" — surface as error
    throw new Error(`Critic selection failed: could not parse LLM response as JSON array`);
  }
}
```

Uses `parseLLMJson()` from `src/lib/llm-utils.ts` (the existing utility used by `design_brand` and other tools) instead of raw `JSON.parse`. Selection failure throws rather than returning `[]` — this prevents the editor rubric from auto-approving unreviewed content when the selection call fails (distinct from legitimate zero matches).

**Cost:** One lightweight Claude call (~500 input tokens, ~50 output tokens) per content generation. Negligible compared to the critique calls themselves.

**Why LLM-based, not deterministic:** The original design used deterministic exact-string matching (`advisor.domains.some(d => recipe.requiredDomains.includes(d))`). This is fragile — a typo in a domain string silently excludes an advisor with no error. LLM-based matching is robust to naming variations and can reason about semantic overlap (e.g., "conversion optimization" matches "behavioral-science" without needing identical strings). The orchestrator remains a neutral pipeline executor — it doesn't do the selection. The selection happens inside `run_critiques` before the orchestrator sees any results.

---

## Critique Tools

### `src/lib/agent-tools/critique.ts`

Six tools, all stateless (Redis-backed to survive pause/resume). The key change from the design doc: `run_critiques` uses LLM-based `selectCritics()` instead of reading a hardcoded list.

#### `generate_draft`

Calls Claude with the author's system prompt (from `getAdvisorSystemPrompt(recipe.authorAdvisor)`) + recipe's `authorContextDocs` loaded from Redis + content-specific context (research data, keywords). Saves draft to `draft:{runId}` (2hr TTL). Returns draft text to the orchestrator.

#### `run_critiques`

Dynamic selection happens here:

1. Read draft from `draft:{runId}`.
2. Call `selectCritics(recipe, advisorRegistry)` to get the critic panel.
3. For each critic: load their `contextDocs` from Redis (using `getFoundationDoc()` directly, not the tool wrapper), build critique prompt:

```
You are evaluating this content as {name}.

Your evaluation focus:
{evaluationExpertise}

{If recipe.evaluationEmphasis exists:}
EMPHASIS FOR THIS CONTENT TYPE:
{recipe.evaluationEmphasis}

REFERENCE DOCUMENTS:
{loaded contextDocs}

CONTENT TO EVALUATE:
{draft}

Use the submit_critique tool to provide your structured evaluation.
```

The `evaluationEmphasis` from the recipe supplements the advisor's base expertise. This gives content-type-specific tuning: for website copy, April focuses on hero section differentiation; for blog posts, she focuses on narrative positioning consistency.

4. Run critic calls with `p-limit(2)` concurrency via `Promise.allSettled`.
5. Return `AdvisorCritique[]`.
6. Failed critics return `{ advisorId, error: "..." }` — partial results, not full failure.

The `submit_critique` tool definition is passed to each critic call for structured output enforcement (unchanged from original design doc):

```typescript
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

#### `editor_decision`

Mechanical rubric. Input: `{ decision: 'approve' | 'revise', brief?: string }`. Only way to advance the pipeline. No free-text decisions.

#### `revise_draft`

Reads previous draft from `draft:{runId}`. Calls Claude with author's system prompt + editor's revision brief. Brief focuses on high/medium issues only.

The revision brief includes a **"do not regress" list** — aspects that scored well in previous rounds or were specifically fixed. This prevents the common pattern where fixing an SEO issue undoes a positioning fix from the prior round. The list is mechanical (built from `summarize_round` output), not LLM judgment:

```
REVISION BRIEF:
Address these high-severity issues:
- [Issue 1 description]
- [Issue 2 description]

DO NOT REGRESS — these aspects scored well or were fixed in previous rounds:
- Hero headline now correctly reflects competitive differentiation (fixed Round 1)
- CTA copy rated 9/10 for clarity (Round 1)

Address only the listed issues. Do not change aspects on the "do not regress" list.
```

Saves revised draft back to `draft:{runId}`.

#### `summarize_round`

Saves full round data to `critique_round:{runId}:{round}` in Redis. Returns compressed ~500-token summary. Keeps orchestrator context growth linear (~500 tokens/round instead of ~25,000).

The summary includes a **`fixedItems`** field that accumulates across rounds — aspects that were specifically addressed or scored well. This list carries forward into subsequent revision briefs as the "do not regress" guard:

```typescript
interface RoundSummary {
  round: number;
  avgScore: number;
  highIssueCount: number;
  editorDecision: 'approve' | 'revise';
  brief: string;
  // NEW: carries forward into revision briefs
  fixedItems: string[];        // aspects fixed this round
  wellScoredAspects: string[]; // aspects with no high/medium issues across all critics
}
```

**Extraction mechanism:** `fixedItems` and `wellScoredAspects` are extracted mechanically, not via LLM:
- **`fixedItems`:** Compare Round N-1 issues with Round N issues. An issue present in Round N-1 (matched by advisor + severity + keyword overlap in description) that is absent in Round N counts as fixed. The fixed-item description is taken from the Round N-1 issue's `description` field. This is coarse but reliable — no LLM hallucination risk.
- **`wellScoredAspects`:** Domains where no high or medium issues were raised by any critic this round. Derived from the absence of issues, not from scores (since scoring is overall per-critic, not per-aspect).

Both lists accumulate: Round 2's `fixedItems` includes Round 1's fixed items plus any new fixes in Round 2. The accumulated list is what goes into the "do not regress" section of revision briefs.

#### `save_content`

Reads final draft from Redis. Saves approved content with `quality: 'approved' | 'max-rounds-reached'`. For website content type, this is the handoff point to deployment.

---

## Orchestrator System Prompt

Neutral pipeline executor with mechanical decision rubric. The orchestrator does not know or care which critics were selected. It receives critique results and applies rules.

```
You are a content pipeline orchestrator. You execute a write-critique-revise cycle.

Content type: {recipe.contentType}
Max revision rounds: {recipe.maxRevisionRounds}

Your tools: generate_draft, run_critiques, editor_decision, revise_draft,
summarize_round, save_content.

Procedure:
1. Call generate_draft.
2. Call run_critiques.
3. Read the critique results. Apply these rules:
   - ANY high-severity issue -> editor_decision(decision='revise', brief=...)
   - NO high-severity AND avg score >= {minAggregateScore} -> editor_decision(decision='approve')
   - NO high-severity BUT avg < {minAggregateScore} -> editor_decision(decision='revise')
   - Scores decreasing from previous round -> editor_decision(decision='approve')
4. If revise: call revise_draft, then summarize_round, then back to step 2.
5. If approve: call save_content.

When writing revision briefs:
- Focus on HIGH and MEDIUM issues only.
- Include the "do not regress" list from summarize_round output.
- Instruct the author: "Address only the listed issues. Do not change aspects
  on the do-not-regress list."
Do NOT narrate your reasoning. Call the tools.
```

The orchestrator also gets `load_foundation_docs` and the plan/scratchpad tools from `common.ts`.

---

## Wiring: Two-Agent Flow

### Why Two Agents

The critique cycle is reusable across website, blog, and social content. Embedding it in the painted door agent couples it to website deployment. Separating them keeps the critique engine generic.

### Flow

```
API Route orchestrates:
  1. Run critique agent (content-critique)
     - load foundation docs
     - generate_draft (copywriter)
     - run_critiques (dynamic panel via LLM selection)
     - [revise loop with regression guards]
     - save_content -> approved copy in Redis

  2. Run deployment agent (painted-door)
     - read approved copy from Redis
     - design_brand (visual identity ONLY — no copy)
     - assemble_site_files (visual identity + approved copy)
     - validate_code
     - create_repo
     - push_files
     - deploy
```

### Splitting `design_brand`

The current `design_brand` tool in `website.ts` generates brand identity (colors, fonts, copy) in a single Claude call via `buildBrandIdentityPrompt()`. With the critique pipeline producing approved copy separately, the tool must be split.

**Current `BrandIdentity` type** (in `src/types/index.ts`):

```typescript
interface BrandIdentity {
  siteName: string;
  tagline: string;
  seoDescription: string;
  targetDemographic: string;
  voice: { tone: string; personality: string; examples: string[] };
  colors: {
    primary: string; primaryLight: string; background: string;
    backgroundElevated: string; textPrimary: string; textSecondary: string;
    textMuted: string; accent: string; border: string;
  };
  typography: { headingFont: string; bodyFont: string; monoFont: string };
  landingPage: {
    heroHeadline: string;
    heroSubheadline: string;
    ctaText: string;
    valueProps: { title: string; description: string }[];
    socialProofApproach: string;
    faqs: { question: string; answer: string }[];
  };
}
```

This type bundles visual identity (`colors`, `typography`) with voice (`voice`, `targetDemographic`) and copy (nested under `landingPage` — `heroHeadline`, `valueProps`, `faqs`, etc., plus top-level `seoDescription`). `assembleAllFiles()` in `painted-door-templates.ts` reads ALL of these fields — including `brand.landingPage.heroHeadline`, `brand.landingPage.valueProps`, etc. — to build the site.

**The split:**

The key structural fact: copy fields live inside `landingPage`, not at the top level. The split must account for this nesting.

1. **`landingPage` becomes optional on `BrandIdentity`.** The visual-only `design_brand` call populates `colors`, `typography`, `siteName`, `tagline`, `voice`, `targetDemographic`. The `landingPage` object and `seoDescription` are optional (`?`) — they're populated by the critique pipeline when present, or by the single-pass flow as today. This is cleaner than making individual `landingPage` subfields optional, since the template code accesses `brand.landingPage.heroHeadline` etc. — making `landingPage` itself optional means one null check rather than six.

2. **`buildBrandIdentityPrompt()` changes:** The prompt in `painted-door-prompts.ts` removes `landingPage` and `seoDescription` from its JSON schema, asking Claude to generate only visual identity + voice. The prompt currently instructs Claude to output the full `BrandIdentity` JSON — update it to output only the visual subset.

3. **`assembleAllFiles()` accepts an optional `approvedCopy` parameter** typed as `{ landingPage: BrandIdentity['landingPage']; seoDescription: string }`. When `approvedCopy` is provided (from critique pipeline), it uses `approvedCopy.landingPage.heroHeadline` etc. for all copy. When `approvedCopy` is null (fallback single-pass flow), it reads from `brand.landingPage` as before. This maintains backward compatibility — the existing `POST /api/painted-door/[id]` route continues to work with the single-pass flow.

4. **`painted-door-agent.ts` (line 405)** also calls `buildBrandIdentityPrompt()`. This is the original non-tool-based agent flow. It continues to work in single-pass mode — the prompt still generates copy alongside visual identity when called from this path. The split only applies to the tool-based flow where the critique pipeline produces copy separately.

**Summary:** `BrandIdentity.landingPage` and `BrandIdentity.seoDescription` become optional. `design_brand` tool generates visual identity + voice only. `assemble_site_files` prefers `approvedCopy` when available, falls back to `brand.landingPage`. `painted-door-agent.ts` single-pass flow is unaffected.

### API Route

New route: `POST /api/content-pipeline/[ideaId]` with `{ contentType: 'website' }`.

This route:
1. Verifies foundation docs exist for the recipe's `authorContextDocs`
2. Uses `after()` to start the critique agent with recipe config (matches existing pattern in foundation and painted-door routes)
3. On critique agent completion, starts the deployment agent
4. Frontend polls `pipeline_progress:{runId}` for progress using the existing pattern

The existing `POST /api/painted-door/[id]` route continues to work for the single-pass flow. The new route is the critique-enhanced path.

---

## New Advisor: Shirin Oreizy

Shirin Oreizy's prompt already exists in the VBOA at `~/.claude/advisors/prompts/va-web-app/shirin-oreizy.md`. Port to EPCH:

1. Create `src/lib/advisors/prompts/shirin-oreizy.ts` — wrap the VBOA prompt content as a TypeScript string export (same pattern as existing advisors)
2. Add export to `src/lib/advisors/prompts/index.ts`
3. Add to `prompt-loader.ts` promptMap
4. Add to registry with evaluation metadata (evaluationExpertise, doesNotEvaluate, contextDocs)

Note: The VBOA prompt is a full persona prompt (101 lines with voice calibration, failure modes, etc.). For the critique pipeline, the full persona prompt is NOT used as the system prompt for critique calls — the `evaluationExpertise` field provides the focused evaluation lens. The full persona prompt is reserved for future interactive editing (Phase 4a) where persona fidelity matters.

---

## Progress Tracking

The `PipelineProgress` type from the design doc, enhanced for dynamic selection:

```typescript
interface PipelineProgress {
  status: 'running' | 'complete' | 'error' | 'max-rounds-reached';
  contentType: string;
  currentStep: string;
  round: number;
  maxRounds: number;
  quality: 'approved' | 'max-rounds-reached' | null;
  selectedCritics: { advisorId: string; name: string }[];
  steps: PipelineStep[];
  critiqueHistory: CritiqueRound[];
}

interface PipelineStep {
  name: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  detail?: string;
}

interface CritiqueRound {
  round: number;
  critiques: AdvisorCritique[];
  editorDecision: 'approve' | 'revise';
  revisionBrief?: string;
  fixedItems: string[];
  wellScoredAspects: string[];
}

interface AdvisorCritique {
  advisorId: string;
  name: string;
  score: number;
  pass: boolean;
  issues: CritiqueIssue[];
}

interface CritiqueIssue {
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
}
```

`selectedCritics` is written once when `run_critiques` first runs. The frontend renders:

```
✓ Generating draft (Copywriter)
● Running critiques...
  ├─ April Dunford        8/10
  ├─ SEO Expert           scoring...
  └─ Shirin Oreizy        scoring...
○ Editor review
○ Revision (if needed)
○ Deploy

Round 1 of 3 max
```

Progress stored at `pipeline_progress:{runId}` in Redis (2hr TTL). Frontend polls alongside agent state.

---

## Testing Strategy

### Unit Tests

**`src/lib/__tests__/content-recipes.test.ts`:**
- `selectCritics()` with mocked Claude response — correct advisors returned
- `selectCritics()` excludes the recipe's author from candidates
- `selectCritics()` with empty registry — returns empty array
- `selectCritics()` with advisors that have no `evaluationExpertise` — excluded from candidates
- `selectCritics()` Claude returns malformed JSON — error handling
- Recipe `evaluationEmphasis` correctly injected into critique prompt template

**`src/lib/__tests__/critique-tools.test.ts`:**
- `generate_draft` saves to Redis at correct key with TTL
- `generate_draft` loads correct `authorContextDocs` from Redis
- `generate_draft` error path: Redis save fails
- `run_critiques` calls `selectCritics` and runs critic calls
- `run_critiques` with `Promise.allSettled` — one critic fails, others succeed, partial results returned
- `run_critiques` all critics fail — returns empty critiques array
- `editor_decision` with `'approve'` — advances pipeline
- `editor_decision` with `'revise'` — includes brief
- `revise_draft` reads previous draft from Redis, saves revised draft
- `revise_draft` includes "do not regress" list in revision prompt
- `revise_draft` error path: Redis read fails
- `summarize_round` saves full data to Redis, returns compressed summary
- `summarize_round` `fixedItems` accumulates across rounds
- `save_content` reads final draft, saves with quality field

**`src/lib/__tests__/editor-decision-rubric.test.ts`:**
- Any high-severity issue -> revise
- Zero high-severity, avg >= threshold -> approve
- Zero high-severity, avg < threshold -> revise (safety valve)
- Scores decreasing from previous round -> approve (oscillation)
- Empty critiques array -> approve (no gate)

### Integration Tests

**`src/lib/__tests__/critique-pipeline.integration.test.ts`:**
- Full cycle: generate -> critique -> approve (single round, mocked Claude)
- Full cycle: generate -> critique -> revise -> critique -> approve (two rounds)
- Full cycle: max rounds reached -> save with `quality: 'max-rounds-reached'`
- Redis state survives between tool calls (stateless verification)

### Eval Scenarios

Since the critique pipeline involves LLM judgment (both in critic selection and in critique quality), create eval scenarios to validate:

**Critic selection evals:**
- Given the website recipe's `evaluationNeeds`, does `selectCritics` consistently pick April Dunford, SEO Expert, and Shirin Oreizy?
- Given the social-post recipe (lighter needs), does it pick a smaller panel?
- When an irrelevant advisor is added to the registry, is it correctly excluded?

**Critique quality evals:**
- Given a draft with an obvious positioning drift (headline contradicts positioning statement), does April Dunford's critique flag it as high-severity?
- Given a draft with poor heading hierarchy, does the SEO Expert flag it?
- Given a draft with high-friction CTAs, does Shirin Oreizy flag cognitive load issues?

**Regression guard evals:**
- After a Round 1 fix, does the Round 2 revision brief correctly include the fix in the "do not regress" list?
- Does the revision actually preserve the listed aspects?

**Baseline comparison eval (post-implementation):**
Run both single-pass (`painted-door-agent.ts`) and critique-pipeline on the same 2-3 inputs with complete foundation docs. Evaluate both outputs against a rubric: positioning accuracy, SEO quality, CTA clarity. This validates the core hypothesis — that multi-round critique produces measurably better content than single-pass generation. Add at least one "subtle issue" input: a draft that mostly passes but has one non-obvious positioning inconsistency buried in a value prop.

### Quality Target

The critique pipeline should produce website copy that averages **7+ across all critics** by round 2 for ideas with complete foundation docs. A `minAggregateScore` of 4 is the mechanical safety valve (content won't ship below 4), but the quality target for the system is 7+. If after implementation the pipeline consistently produces content scoring 5-6 that passes only because no individual issue is high-severity, that signals the critique prompts need tuning — the system is "working" mechanically but not producing quality output.

---

## Redis Keys (Phase 2 Additions)

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `draft:{runId}` | String | 2hr | Current draft for a pipeline run |
| `critique_round:{runId}:{round}` | String (JSON) | 2hr | Full round data for critique history |
| `pipeline_progress:{runId}` | String (JSON) | 2hr | Structured progress for frontend polling |

Note: `foundation_lock:{ideaId}` was designed in the original doc but deferred from Phase 1 — it does not currently exist in the codebase. If the two-agent flow creates concurrent-run risk, implement it in Phase 2.

---

## Dependencies

- `p-limit` — NEW dependency. Concurrency limiter for critique calls. Not currently in `package.json`.
- Shirin Oreizy prompt — port from VBOA (already exists at `~/.claude/advisors/prompts/va-web-app/shirin-oreizy.md`).
- Copywriter and SEO Expert prompts — already exist in EPCH from Phase 1.

---

## Phase 2 Scope Boundaries

**In scope:**
- Enriched advisor registry with evaluation metadata
- LLM-based `selectCritics()` function
- `src/lib/content-recipes.ts` — all three recipe definitions with `evaluationNeeds` and `evaluationEmphasis`, only website wired
- `src/lib/agent-tools/critique.ts` — all six tools
- Orchestrator system prompt
- Split `design_brand` (visual identity only, copy fields optional on `BrandIdentity`)
- `assemble_site_files` updated to accept approved copy parameter
- New API route `POST /api/content-pipeline/[ideaId]`
- Shirin Oreizy ported to EPCH advisor system
- `summarize_round` with `fixedItems` tracking
- Cross-round regression guards in revision briefs
- Progress tracking with critique visibility
- Frontend progress UI for critique rounds
- Testing suite including evals for selection and critique quality

**Out of scope (deferred to later phases):**
- Blog post recipe wiring (Phase 3)
- Social post recipe wiring (Phase 4b)
- Interactive foundation doc editing (Phase 4a)
- Andy Raskin added to registry (Phase 3, when blog posts need narrative evaluation)
- Cross-content-type positioning consistency checks (Phase 3+, when multiple content types ship)
- Changes to `agent-runtime.ts`

---

## Decision Log

### Summary

| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Critic selection method | LLM-based loose matching | Deterministic exact-string matching, hardcoded per recipe |
| 2 | Author selection | Fixed per content type | Dynamic (same registry pattern) |
| 3 | Agent architecture | Two agents (critique + deployment) | Single agent with all tools |
| 4 | design_brand split | `landingPage`/`seoDescription` optional, visual-only generation | Keep monolithic, override; new separate type; per-subfield optional |
| 5 | Evaluation prompt location | Per-advisor base + per-recipe emphasis | Per-recipe only, per-advisor only |
| 6 | Role field and critic eligibility | Role is informational, doesn't gate selection | Role gates selection (rejected: breaks dual-use advisors) |

### Appendix: Decision Details

#### Decision 1: LLM-Based Loose Matching

**Chose:** Recipes describe `evaluationNeeds` in prose. Advisors have `evaluationExpertise` and `doesNotEvaluate` in prose. A lightweight LLM call matches them semantically.

**Why:** Exact-string domain matching (`advisor.domains.some(d => recipe.requiredDomains.includes(d))`) is fragile — a typo silently excludes an advisor with no error. LLM-based matching is robust to naming variations and reasons about semantic overlap. The cost is negligible (~500 input tokens per selection call). This mirrors the brainstorming skill's pattern where the AI reads advisor descriptions and selects.

**Alternatives rejected:**
- Deterministic exact-string matching: Fragile. `'positioning-strategy'` vs `'positioning'` = silent failure. Requires maintaining a parallel domain taxonomy. Errors are invisible.
- Hardcoded per recipe (original design doc): Brittle. Every new advisor requires editing every recipe. Doesn't scale.

#### Decision 2: Author Stays Fixed

**Chose:** Author role is declared explicitly on the recipe (`authorAdvisor: 'copywriter'`), not dynamically selected.

**Why:** "Who writes website copy" rarely has multiple valid answers. Dynamic selection adds complexity without value for authors.

**Alternatives rejected:**
- Full dynamic (author + critics from registry): Over-engineered — there's only one copywriter, and there will likely only ever be one per content type.

#### Decision 3: Two-Agent Flow

**Chose:** Critique cycle runs as its own agent (`content-critique`). On completion, a separate deployment agent runs with approved copy.

**Why:** The critique cycle is reusable across website, blog, and social content types. Coupling it to the painted door agent means blog posts and social posts can't use the same engine. Two agents also keeps tool sets small and focused — critique tools don't need to know about GitHub repos.

**Alternatives rejected:**
- Single agent: Simpler wiring but large tool set (critique + website + common). Also couples critique to website deployment. Could be reconsidered if the two-agent orchestration proves too complex during implementation.

#### Decision 4: Split `design_brand` — `landingPage` and `seoDescription` Become Optional

**Chose:** `BrandIdentity.landingPage` and `BrandIdentity.seoDescription` become optional (`?`). `design_brand` generates visual identity + voice only. `assembleAllFiles` accepts an optional `approvedCopy` parameter typed as `{ landingPage: BrandIdentity['landingPage']; seoDescription: string }`, falling back to `brand.landingPage` when absent.

**Why:** Least disruptive change. Copy fields are nested under `landingPage`, so making the entire `landingPage` optional is cleaner than making six individual subfields optional — template code checks `approvedCopy ?? brand.landingPage` once rather than per-field. No type rename, no import changes across the 5 files that reference `BrandIdentity`. The existing single-pass flow (`painted-door-agent.ts`) continues to work unchanged.

**Alternatives rejected:**
- Keep monolithic, override: Wastes tokens generating copy that gets discarded.
- New separate type (`VisualIdentity` + `WebsiteCopy`): Cleaner separation but requires updating every file that imports `BrandIdentity` (5 files). More churn for the same result.
- Make individual `landingPage` subfields optional: More granular but forces 6+ null checks in `assembleAllFiles` instead of one.

#### Decision 5: Per-Advisor Base + Per-Recipe Emphasis

**Chose:** `evaluationExpertise` lives on the advisor entry (base lens). `evaluationEmphasis` on the recipe provides content-type-specific tuning. Both are injected into the critique prompt.

**Why:** An advisor's core expertise doesn't change by content type — April Dunford evaluates positioning whether it's a website or a blog. But the emphasis SHOULD differ: for a website homepage, focus on hero section differentiation; for a blog post, focus on market category reinforcement without sales-pitch tone. The hybrid approach is DRY on the base expertise while allowing per-content-type tuning.

**Alternatives rejected:**
- Per-recipe only (original `CriticConfig.evaluationPrompt`): Duplicates advisor expertise across recipes.
- Per-advisor only (no recipe emphasis): One-size-fits-all evaluation that misses content-type-specific concerns.

#### Decision 6: Role is Informational, Doesn't Gate Selection

**Chose:** The `role` field stays as metadata. Any advisor with `evaluationExpertise` can serve as a critic. `selectCritics()` does not filter on role.

**Why:** April Dunford is `role: 'strategist'` because she authors positioning foundation docs (via `DOC_ADVISOR_MAP` in `foundation.ts`). She also needs to serve as a critic in the content pipeline. Making `role` a single-value gate would require either changing her role (breaking the semantic meaning for foundation generation) or adding multi-role support (unnecessary complexity). The simpler answer: every advisor CAN critique, and selection is based on `evaluationExpertise` matching, not role.

**Alternatives rejected:**
- Role gates selection (`role === 'critic'` filter): Breaks dual-use advisors like April Dunford who both author foundation docs and critique content.
- Multi-role array (`roles: string[]`): Unnecessary complexity when the simpler solution is to not gate on role at all.
