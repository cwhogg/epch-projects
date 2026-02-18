# Eval Infrastructure Design

**Date:** 2026-02-18
**Scope:** Two deliverables: (1) Update kickstart skill to generate working eval scaffolding, (2) Instantiate it for epch-projects with initial scenarios.

## Problem

The kickstart skill scaffolds an `e2e/` directory with empty placeholder files (`eval-config.ts`, `eval-runner.ts`). The eval-audit and eval-failure-triage skills assume this infrastructure exists and is functional, but nothing defines what goes in these files. The va-web-app project has a mature eval implementation, but it's hardcoded for conversational advisor quality (flow, personalization, voice, framework dimensions). We need working eval infrastructure for epch-projects, with kickstart generating enough scaffolding that new projects can get started quickly.

## Reference Implementation

va-web-app's eval system (`/Users/ericpage/software/va-web-app/e2e/`):
- CLI runner with auto-detect/--all/--scenario modes
- 4 quality dimensions (flow, personalization, voice, framework) with deterministic heuristics + LLM-as-judge
- Best-of-3 median voting for judge variance reduction
- Prompt adapter that calls real production prompt builders (not mocks)
- Git-diff-based scenario scoping via multi-tier pattern matching (shared infrastructure, per-surface regex, `minimatch`)
- JSONL logging with per-dimension results
- 10 scenario JSON files with fixture profiles
- Full test coverage for all helpers

**What this design borrows from va-web-app:** Runner CLI modes, judge with median voting, JSONL logging, prompt adapter convention, scenario JSON format, conversation-based evaluation with `evaluate: true` markers, heuristic + judge scoring pipeline.

**What this design introduces (new):** Dimension registry pattern (va-web-app hardcodes 4 dimensions in `heuristics.ts`), tag-based trigger scoping (va-web-app uses flat glob-to-scenario mapping), `dimensionConfig` per-scenario overrides. These are improvements for multi-project reuse, not direct ports.

## Architecture

Kickstart generates functional scaffolding: runner, scenario loader, logger, trigger, judge, dimension registry, and starter dimensions. Each project fills in its own prompt adapter, additional dimensions, scenario files, and fixture data.

### Directory Structure

```
e2e/
├── eval-config.ts              # Thresholds, models, surface patterns
├── eval-runner.ts              # CLI orchestrator
├── types.ts                    # Shared interfaces
├── tsconfig.json               # Separate TS config
├── .gitignore                  # eval-log.jsonl, .eval-audit-last-run
├── eval-helpers/
│   ├── index.ts                # Barrel exports
│   ├── judge.ts                # LLM-as-judge with median voting
│   ├── logger.ts               # JSONL append writer
│   ├── scenario-loader.ts      # Reads scenario JSON from disk
│   ├── trigger.ts              # Git diff + tag-based scoping
│   └── __tests__/              # Tests for all helpers
├── dimensions/                 # Dimension registry
│   ├── index.ts                # Registry loader (reads all dimension files)
│   ├── output-length.ts        # Starter: word/sentence/paragraph checks
│   ├── instruction-following.ts # Starter: judge-only adherence check
│   ├── voice.ts                # Starter: anti-pattern + judge distinctiveness
│   └── structured-output.ts    # Starter: JSON validity + field presence
├── prompt-adapter.ts           # Project-specific: scenarios → real prompt builders
├── scenarios/                  # Scenario JSON files
│   └── example.json            # Working example using starter dimensions
└── fixtures/                   # Test data
    └── profiles/
        └── sample.md           # Minimal fixture demonstrating format
```

## Dimension Registry

Each dimension is a self-contained module exporting a standard interface:

```typescript
interface DimensionDefinition {
  name: string;
  description: string;
  heuristic: (response: string, scenario: EvalScenario) => HeuristicResult;
  judgeRubric: string;
  skipJudge?: (scenario: EvalScenario, turnIndex: number) => boolean;
  skipHeuristic?: (scenario: EvalScenario, turnIndex: number) => boolean;
}

interface HeuristicResult {
  result: 'pass' | 'warn' | 'fail' | 'n/a';
  details?: string[];
}
```

The registry loader (`dimensions/index.ts`) reads all dimension files and builds a `Map<string, DimensionDefinition>`. Scenarios reference dimensions by name — unknown dimensions cause a load-time error.

### Starter Dimensions (4)

**1. `output-length`** — Deterministic length checks with configurable thresholds.
- Heuristic: counts words, sentences, paragraphs. Two-tier thresholds per metric: `max` (ideal) and `warn` (fail).
- Judge rubric: "Is the response length appropriate for this conversational context? Score 1-5."
- Default thresholds in eval-config; overridable per-scenario via `dimensionConfig`.

**2. `instruction-following`** — Whether the response follows explicit instructions from the system prompt.
- Heuristic: `n/a` by default (instructions are too varied to check generically).
- Judge rubric: "Does the response follow the explicit instructions in the system prompt? Consider format requirements, constraints, and behavioral directives. Score 1-5."

**3. `voice`** — Whether a persona-based response is distinctively voiced.
- Heuristic: checks for presence of `antiPatterns` from `dimensionConfig.voice` (case-insensitive). Any match = fail. Returns `n/a` if no fingerprint configured.
- Judge rubric: "Is this response unmistakably from this specific advisor, or could it be from anyone? Evaluate tone, vocabulary, and stylistic distinctiveness. Score 1-5."
- `signaturePhrases` are informational (passed to judge context, not scored by heuristic).

**4. `structured-output`** — Whether LLM output is valid parseable JSON with expected fields.
- Heuristic: attempts `JSON.parse()` on the response (or extracts JSON from markdown code fences / tool-use blocks). Fails if unparseable. If `dimensionConfig.structuredOutput.requiredFields` is set, checks field presence.
- Judge rubric: "Are all required fields present with sensible values? Is the JSON structure well-formed and complete? Score 1-5."
- `skipJudge` returns true if heuristic already failed (no point judging malformed JSON).

## Scenario Format

```json
{
  "name": "richard-rumelt-foundation-chat",
  "surface": "advisor-chat",
  "tags": ["advisor", "foundation"],
  "config": {
    "advisor": "richard-rumelt",
    "docType": "strategy",
    "ideaId": "fixture:sample-idea"
  },
  "fixtures": {
    "idea": "fixtures/sample-idea.json",
    "analysis": "fixtures/sample-analysis.json"
  },
  "conversation": [
    { "role": "user", "content": "Help me refine the kernel of my strategy." },
    { "role": "assistant", "evaluate": true }
  ],
  "dimensions": ["voice", "output-length"],
  "dimensionConfig": {
    "voice": {
      "antiPatterns": ["as an AI", "studies show"],
      "signaturePhrases": ["diagnosis", "guiding policy", "coherent action"]
    }
  }
}
```

Key fields:
- **`surface`** — Names the LLM call site. The prompt adapter switches on this to route to the right prompt builder.
- **`tags`** — For filtering (`--tag`) and trigger scoping. `llmSurfacePatterns` in eval-config maps file globs to tags.
- **`config`** — Freeform object passed to the prompt adapter. Project-specific keys.
- **`fixtures`** — Paths to fixture data, relative to `e2e/`.
- **`conversation`** — Array of turns. Assistant turns with `evaluate: true` trigger response generation + scoring. User turns accumulate in message history.
- **`dimensions`** — Which dimensions to score for this scenario.
- **`dimensionConfig`** — Per-scenario overrides for dimension heuristics.

## Prompt Adapter

Convention: a single `buildPromptForScenario` function that switches on `scenario.surface`:

```typescript
interface PromptResult {
  systemPrompt?: string;   // System message (omit for user-message-only surfaces)
  userMessage?: string;     // User message (for surfaces that send prompt as user content)
  model?: string;           // Override eval-config model
}

export async function buildPromptForScenario(
  scenario: EvalScenario
): Promise<PromptResult> {
  switch (scenario.surface) {
    case 'example':
      return { systemPrompt: 'You are a helpful assistant.' };
    default:
      throw new Error(`Unknown surface: ${scenario.surface}`);
  }
}
```

The runner handles both placements: if `systemPrompt` is set, it's passed as the `system` parameter. If `userMessage` is set, it's prepended to the conversation as a user turn. Some production surfaces use system prompts (advisor chat), others send the full prompt as a user message (research scoring, content calendar).

Each project adds cases wiring surfaces to their real prompt builders. The adapter loads fixture data and calls the actual production prompt construction functions — evals test the real pipeline, not mocks.

## Runner

Standalone CLI script invoked via `npm run eval`. Matches va-web-app's pattern:

**CLI modes:**
- `npm run eval` — auto-detect git changes, scope scenarios
- `npm run eval -- --all` — run all scenarios
- `npm run eval -- --scenario <name>` — run one
- `npm run eval -- --tag <tag>` — run by tag
- `npm run eval -- --dry-run` — show what would run

**Execution flow per scenario:**
1. Load scenario JSON via scenario-loader
2. Validate all referenced dimensions exist in registry
3. Build system prompt via prompt-adapter
4. Walk conversation turns:
   - User turns: accumulate in message history
   - Assistant turns with `evaluate: true`: generate response using real model, then score
5. For each evaluate point, for each dimension:
   - Run heuristic (unless `skipHeuristic` returns true)
   - If heuristic passed or n/a, run LLM judge (unless `skipJudge` returns true)
6. Combine results: worst result per dimension across turns
7. Overall: any fail = fail, any warn = warn, else pass
8. Log to JSONL
9. Exit code: non-zero if any scenario failed

**Response generation:** Uses `@anthropic-ai/sdk` via `getAnthropic()` singleton (same as production code). Model from eval-config (default `claude-sonnet-4-20250514`), overridable via `ANTHROPIC_EVAL_MODEL` env var.

## Trigger / Scoping

`llmSurfacePatterns` in eval-config maps file globs to tags:

```typescript
export const EVAL_CONFIG = {
  llmSurfacePatterns: [
    { glob: 'src/lib/advisors/prompts/*.md', tags: ['advisor'] },
    { glob: 'src/lib/frameworks/prompts/*/prompt.md', tags: ['framework'] },
    { glob: 'src/lib/research-agent-prompts.ts', tags: ['research'] },
    // ...
  ],
};
```

When auto-detect runs:
1. `git diff --name-only main...HEAD` to find changed files
2. Match against patterns, collect triggered tags
3. Select scenarios whose `tags` overlap with triggered tags
4. Scenarios tagged `"*"` always run on any surface change

## Judge

LLM-as-judge with best-of-3 median voting. Matches va-web-app's implementation:

- Model: `claude-haiku-4-5-20251001` (overridable via `ANTHROPIC_EVAL_MODEL`)
- 3 calls per evaluation, median score (lower-middle for even count)
- System prompt truncated to 3000 chars
- Scoring bands: >=4 pass, 3 warn, <3 fail (configurable)
- If all calls fail: score 0, reasoning "All judge calls failed"
- Uses `@anthropic-ai/sdk` with tool_use to get structured `{ score: number, reasoning: string }` responses (matching project's existing SDK — not Vercel AI SDK)

## Logger

Append-only JSONL (`eval-log.jsonl`). Each entry:

```typescript
interface EvalLogEntry {
  timestamp: string;
  trigger: 'auto' | 'manual';
  changedFiles: string[];
  scopeReason: string;
  scenarios: ScenarioResult[];
  totals: {
    apiCalls: number;
    scenariosRun: number;
    passed: number;
    warned: number;
    failed: number;
    durationMs: number;
  };
}
```

---

## epch-projects Instantiation

### Surface Patterns

```typescript
llmSurfacePatterns: [
  { glob: 'src/lib/advisors/prompts/*.md', tags: ['advisor'] },
  { glob: 'src/lib/frameworks/prompts/*/prompt.md', tags: ['framework'] },
  { glob: 'src/lib/research-agent-prompts.ts', tags: ['research'] },
  { glob: 'src/lib/content-prompts.ts', tags: ['content'] },
  { glob: 'src/lib/painted-door-prompts.ts', tags: ['painted-door'] },
  { glob: 'src/lib/agent-tools/*.ts', tags: ['agent-tools'] },
  { glob: 'src/lib/expertise-profile.ts', tags: ['research'] },
  { glob: 'src/lib/seo-knowledge.ts', tags: ['research', 'seo'] },
  { glob: 'src/lib/critique-service.ts', tags: ['content'] },
  { glob: 'src/lib/frameworks/framework-loader.ts', tags: ['framework'] },
]
```

### Project-Specific Dimension

**`scoring-accuracy`** — Validates research agent scoring output.
- Heuristic: parses the scoring section, checks all 5 dimensions present (seoOpportunity, competitiveLandscape, willingnessToPay, differentiationPotential, expertiseAlignment), each 1-10 integer. Checks recommendation is Tier 1/2/3 and confidence is High/Medium/Low.
- Judge rubric: "Given the analysis context, are the individual dimension scores defensible? Is the overall score a reasonable composite? Is the recommendation tier consistent with the scores? Score 1-5."

### Initial Scenarios (6)

| Scenario | Surface | Dimensions | Tests |
|----------|---------|------------|-------|
| `richard-rumelt-foundation-chat` | advisor-chat | voice, output-length | Strategy advisor voice in foundation editing context |
| `april-dunford-foundation-chat` | advisor-chat | voice, output-length | Positioning advisor — different register from Rumelt |
| `seo-expert-foundation-chat` | advisor-chat | voice, output-length | Technical expert voice — distinct from strategists |
| `research-scoring-full` | research-scoring | scoring-accuracy, structured-output | 5-dimension scoring with expertise profile context |
| `content-calendar-generation` | content-calendar | structured-output | Calendar JSON with valid piece structure |
| `value-metric-framework-assembly` | framework-assembly | voice, instruction-following | Framework loader + example injection + advisor voice |

### Prompt Adapter Cases

```typescript
case 'advisor-chat':
  // Replicate the system prompt assembly from src/app/api/foundation/[ideaId]/chat/route.ts
  // 1. getAdvisorSystemPrompt(config.advisor) — loads .md file via readFileSync
  // 2. buildContentContext equivalent: analysis results (product info, competitors, keywords)
  //    from fixture data — production calls buildContentContext(ideaId) for this
  // 3. Related foundation docs (strategy, positioning) from fixtures
  // 4. Current document content from fixtures
  // 5. RULES section (change constraints, <updated_document> tags)
  // No single callable function — the route handler builds this inline.
  // The adapter must replicate that assembly from the same primitives.
  const advisorPrompt = getAdvisorSystemPrompt(scenario.config.advisor);
  const systemPrompt = `${advisorPrompt}\n\n---\n\nYou are helping the user refine their ${scenario.config.docType} document...\n${fixtureAnalysisContext}\n${fixtureFoundationDocs}\n${fixtureCurrentDoc}\n\nRULES:...`;
  return { systemPrompt };

case 'research-scoring':
  // Uses createPrompt(idea, 'scoring', additionalContext?) from src/lib/research-agent-prompts.ts
  // Production v1 scoring (research-agent.ts:129-132) sends this as a USER MESSAGE
  // with NO system prompt. createPrompt embeds the research analyst persona directly
  // in the message content. RESEARCH_SYSTEM_PROMPT is only used in the v2 agent flow.
  // SEO context: buildSEOScoringContext() is module-private in research-agent.ts.
  // The fixture must inline the formatted SEO context string directly.
  const userMessage = createPrompt(fixtureIdea, 'scoring', fixtureSeoContextString);
  return { userMessage };  // No system prompt — matches production

case 'content-calendar':
  // Uses buildCalendarPrompt(ctx: ContentContext) from src/lib/content-prompts.ts
  // Production (content-agent.ts:38-41) sends this as a USER MESSAGE with no system prompt.
  // ContentContext has 18 fields — fixture must construct the full object.
  // See "ContentContext Fixture Construction" section below.
  const prompt = buildCalendarPrompt(fixtureContentContext);
  return { userMessage: prompt };  // No system prompt — matches production

case 'framework-assembly':
  // Uses getFrameworkPrompt(frameworkId) from src/lib/frameworks/framework-loader.ts
  // Returns string | null — null means unknown framework or missing prompt file.
  // Returns assembled prompt with examples/anti-examples injected.
  // Combine with getAdvisorSystemPrompt() for the advisor voice overlay.
  const frameworkPrompt = getFrameworkPrompt(scenario.config.framework);
  if (!frameworkPrompt) throw new Error(`Framework not found: ${scenario.config.framework}`);
  const advisorOverlay = getAdvisorSystemPrompt(scenario.config.advisor);
  return { systemPrompt: `${advisorOverlay}\n\n---\n\n${frameworkPrompt}` };
```

### ContentContext Fixture Construction

`buildCalendarPrompt` requires a `ContentContext` with 18 fields. The fixture must provide:

| Field | Source | Fixture approach |
|-------|--------|-----------------|
| `ideaName`, `ideaDescription`, `targetUser`, `problemSolved`, `url` | ProductIdea | From `sample-idea.json` |
| `scores` | Analysis results | 6 numeric scores from `sample-analysis.json` |
| `summary`, `risks` | Analysis results | From `sample-analysis.json` |
| `topKeywords` | SEO pipeline | Array of keyword objects with volume/competitiveness |
| `serpValidated` | SEO pipeline | SERP data with gaps, PAA, related searches |
| `contentStrategy`, `difficultyAssessment` | Analysis | Strategy recommendations + competitive assessment |
| `competitors` | Analysis | Formatted competitor string |
| `expertiseProfile` | Expertise profile | Profile markdown |
| `existingPieces`, `publishedPieces`, `rejectedPieces` | Content state | Empty arrays for initial scenarios |
| `userFeedback` | Optional | `undefined` for initial scenarios |

The fixture JSON mirrors a real ContentContext built by the content pipeline, using SecondLook data as the representative example.

### Fixtures

- `fixtures/sample-idea.json` — SecondLook idea (representative, already has rich data)
- `fixtures/sample-analysis.json` — Full analysis results for SecondLook (scores, summary, risks, competitors, keywords)
- `fixtures/sample-seo-context-string.txt` — Pre-formatted SEO scoring context string (since `buildSEOScoringContext` is module-private in `research-agent.ts`, the fixture inlines the formatted output rather than calling the function)
- `fixtures/sample-analysis-context.json` — Analysis context for advisor chat (product info, competitors, keywords — equivalent to `buildContentContext` output)
- `fixtures/sample-content-context.json` — Complete ContentContext object for content calendar
- `fixtures/sample-foundation-docs.json` — Strategy + positioning docs for advisor chat context

### npm script

```json
"eval": "tsx e2e/eval-runner.ts"
```

**Dependency:** Add `tsx` as a dev dependency (`npm i -D tsx`). It's a faster, zero-config alternative to `ts-node` that handles ESM and path aliases without a separate tsconfig. Also add `minimatch` for trigger glob matching (`npm i -D minimatch @types/minimatch`).

---

## What Kickstart Generates — Complete File List

| File | Status | Notes |
|------|--------|-------|
| `e2e/eval-config.ts` | Functional | Configurable thresholds, empty surface patterns |
| `e2e/eval-runner.ts` | Functional | Full CLI with all modes |
| `e2e/types.ts` | Complete | All interfaces |
| `e2e/tsconfig.json` | Complete | Targets ES2020, CommonJS, path aliases |
| `e2e/.gitignore` | Complete | eval-log.jsonl, .eval-audit-last-run |
| `e2e/eval-helpers/index.ts` | Complete | Barrel exports |
| `e2e/eval-helpers/judge.ts` | Functional | Median voting, variance reduction |
| `e2e/eval-helpers/logger.ts` | Functional | JSONL append |
| `e2e/eval-helpers/scenario-loader.ts` | Functional | JSON reader with validation |
| `e2e/eval-helpers/trigger.ts` | Functional | Git diff + tag scoping |
| `e2e/eval-helpers/__tests__/*.ts` | Complete | Tests for all helpers |
| `e2e/dimensions/index.ts` | Functional | Registry loader |
| `e2e/dimensions/output-length.ts` | Functional | Starter dimension |
| `e2e/dimensions/instruction-following.ts` | Functional | Starter dimension |
| `e2e/dimensions/voice.ts` | Functional | Starter dimension |
| `e2e/dimensions/structured-output.ts` | Functional | Starter dimension |
| `e2e/prompt-adapter.ts` | Skeleton | Interface + one example case |
| `e2e/scenarios/example.json` | Working | Demonstrates scenario format |
| `e2e/fixtures/profiles/sample.md` | Minimal | Demonstrates fixture format |

## Testing Strategy

All eval helpers get unit tests (matching va-web-app's coverage):
- `judge.test.ts` — mocked `@anthropic-ai/sdk` client, median voting, error paths (both success + rejection), tool_use-specific failures (model returns text instead of tool_use block, tool_use with missing/wrong-type score field, all 3 judge calls fail)
- `logger.test.ts` — JSONL writing, append behavior
- `scenario-loader.test.ts` — JSON reading, validation, missing file handling
- `trigger.test.ts` — git diff detection, tag matching, scoping logic
- `dimensions/*.test.ts` — each starter dimension's heuristic logic

The runner itself is tested by running `npm run eval -- --scenario example` against the starter scenario.

## Implementation Order

1. Add dev dependencies (`tsx`, `minimatch`, `@types/minimatch`)
2. Update kickstart skill to generate all scaffolding files
3. Create epch-projects `e2e/` with project-specific files
4. Write prompt adapter for 4 surfaces (wiring to real `getAdvisorSystemPrompt`, `createPrompt`, `buildCalendarPrompt`, `getFrameworkPrompt`)
5. Build fixture data (sample idea, analysis, SEO context, content context, foundation docs)
6. Write 6 initial scenarios with fixture references
7. Add `scoring-accuracy` dimension
8. Run eval suite, triage failures with eval-failure-triage
9. Update eval-audit skill's hook to record first baseline
