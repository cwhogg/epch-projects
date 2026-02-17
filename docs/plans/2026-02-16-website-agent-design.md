# Website Agent Design: Goal-Oriented Content Orchestrator

**Date:** 2026-02-16
**Status:** Approved
**Scope:** Replace the procedural content critique pipeline with a goal-oriented orchestrator for all content types. Wire new advisors (Julian Shapiro, Oli Gardner, Joanna Wiebe) and framework injection into the pipeline.

## Context

The existing content critique pipeline (`content-critique-agent.ts`) uses a rigid procedural system prompt: "Step 1: generate_draft, Step 2: run_critiques, Step 3: editor_decision...". This works but prevents the agent from making intelligent decisions about which critics to consult and when.

The new design makes the orchestrator goal-oriented: it knows the quality rules, has tools available, and decides the sequence autonomously. This pattern applies to all content types (website, blog-post, social-post), not just website pages.

## Architecture

### Recipe Structure

Two new optional fields on `ContentRecipe`:

```ts
export interface ContentRecipe {
  contentType: string;
  authorAdvisor: string;
  authorFramework?: string;          // framework ID to inject when drafting
  authorContextDocs: FoundationDocType[];
  namedCritics?: string[];            // always-included critics for this type
  evaluationNeeds: string;
  evaluationEmphasis?: string;
  minAggregateScore: number;
  maxRevisionRounds: number;
}
```

**`authorFramework`** — When set, `getFrameworkPrompt(recipe.authorFramework)` is loaded and concatenated to the author's system prompt during drafting and revision. Blog/social recipes leave this unset.

**`namedCritics`** — Advisor IDs that always run for this content type. The existing `selectCritics` LLM call still runs to find domain-specific advisors, then the orchestrator deduplicates named + dynamic. Blog/social recipes can leave this empty to keep pure dynamic selection.

Website recipe:

```ts
website: {
  contentType: 'website',
  authorAdvisor: 'julian-shapiro',
  authorFramework: 'landing-page-assembly',
  authorContextDocs: ['positioning', 'brand-voice', 'seo-strategy'],
  namedCritics: ['oli-gardner', 'joanna-wiebe', 'shirin-oreizy', 'copywriter'],
  evaluationNeeds:
    'This is website landing page copy. Needs review for: conversion-centered design ' +
    '(attention ratio, page focus, directional cues), conversion copywriting quality ' +
    '(headline effectiveness, CTA clarity, voice-of-customer alignment), behavioral science ' +
    '(CTA friction, cognitive load, conversion psychology), and brand voice consistency.',
  evaluationEmphasis:
    'Focus especially on the hero section — does it communicate the "why now" ' +
    'and competitive differentiation within the first viewport? Are CTAs ' +
    'low-friction and high-clarity?',
  minAggregateScore: 4,
  maxRevisionRounds: 3,
}
```

Blog-post and social-post recipes remain unchanged (no `authorFramework`, no `namedCritics`).

### Tool Design

The tool set is nearly identical to today. Changes:

**`generate_draft`** — Gains framework injection. When `recipe.authorFramework` is set:

```ts
let systemPrompt = getAdvisorSystemPrompt(recipe.authorAdvisor);
if (recipe.authorFramework) {
  const frameworkPrompt = getFrameworkPrompt(recipe.authorFramework);
  if (frameworkPrompt) {
    systemPrompt += '\n\n## FRAMEWORK\n' + frameworkPrompt;
  }
}
```

If the framework file is missing, drafting proceeds without it (graceful degradation, not a crash).

**`run_critiques`** — Gains optional `advisorIds` parameter:
- Omitted → runs all assigned critics (named + dynamically selected)
- Specified → runs only that subset

Critic selection flow (computed once, first `run_critiques` call):
1. Resolve `recipe.namedCritics ?? []` to `AdvisorEntry` objects via `advisorRegistry.find(a => a.id === id)`. Filter out any unresolved IDs with `console.warn` for each missing one.
2. Run `selectCritics()` for dynamic domain-specific additions — **wrapped in try/catch**. On failure (LLM parse error), fall back to the named critics from step 1 rather than failing the pipeline. This is the only place `selectCritics` is called, so the catch lives here in `run_critiques`, not in `selectCritics` itself.
3. Deduplicate by advisor ID
4. Store as `selectedCritics` for the run

**`revise_draft`** — Also gets framework injection, same mechanism as `generate_draft`. The author revises within their framework's structure.

**`editor_decision`** — Unchanged. Mechanical rubric, no LLM judgment.

**`summarize_round`** — Unchanged. Fixed-item tracking and do-not-regress lists work the same way.

**`save_content`** — Unchanged.

**`load_foundation_docs`** — Unchanged. Already available from `createFoundationTools()`.

### System Prompt

The procedural system prompt is replaced with a goal-oriented one:

```
You are a content pipeline orchestrator. Your goal: produce {contentType} content
that passes the editor quality rubric.

TOOLS AVAILABLE:
- generate_draft: Create initial content using the assigned author advisor
- run_critiques(advisorIds?): Get evaluations from critics (all, or a named subset)
- editor_decision(critiques): Apply mechanical rubric -> returns 'approve' or 'revise' with brief
- revise_draft(brief): Revise current draft addressing the editor's brief
- summarize_round(round, critiques, decision): Record round data, returns do-not-regress list
- save_content(quality): Persist final content
- load_foundation_docs(docTypes?): Load reference documents if needed

EDITOR RUBRIC (you do not override these rules):
- Any high-severity issue -> must revise
- No high issues + avg score >= {minAggregateScore} -> approve
- No high issues + avg < {minAggregateScore} -> revise
- Scores decreasing from previous round -> approve (oscillation guard)

CONSTRAINTS:
- Maximum {maxRevisionRounds} revision rounds
- Always call summarize_round after each critique+decision cycle
- Always call editor_decision with critique results -- do not self-judge quality, even if all critics errored (pass the results as-is)
- After max rounds without approval: save_content(quality='max-rounds-reached')

AVAILABLE CRITICS: {list of critic IDs and their focus areas}

You decide the sequence. Typical approaches include drafting then running all critics,
or targeted re-critique of specific dimensions after revision. Use your judgment
about which critics to re-run based on what you changed.
```

The agent knows the rules and tools but decides how to use them. It might run all critics in round 1, see that only Oli Gardner flagged issues, revise, then re-run only Oli in round 2.

The "AVAILABLE CRITICS" section lists each critic's ID, name, and focus area (from `evaluationExpertise`), giving the agent enough context for intelligent selection.

### Framework Injection

When `recipe.authorFramework` is set, both `generate_draft` and `revise_draft` concatenate the framework prompt onto the advisor's system prompt:

- Advisor prompt = voice and persona ("You are Julian Shapiro...")
- Framework prompt = structural method (Landing Page Assembly phases)
- Combined system prompt = author writes in their voice following their framework

The framework loader (`getFrameworkPrompt`) already assembles `prompt.md` + `examples.md` + `anti-examples.md` — reused as-is.

**Prerequisite:** The `landing-page-assembly` framework must exist:
- `src/lib/frameworks/prompts/landing-page-assembly/prompt.md` (+ optional examples/anti-examples)
- Registry entry in `src/lib/frameworks/registry.ts`

These are created via the `/add-framework` skill in a separate thread, not part of this implementation.

### Integration

**Agent runtime** (`agent-runtime.ts`) — No changes. Same `runAgent`/`resumeAgent` loop, time budgeting, pause/resume.

**Content critique agent** (`content-critique-agent.ts`) — Refactored:
- `buildSystemPrompt()` uses the goal-oriented template
- `runContentCritiquePipeline()` structurally the same (creates tools, builds config, calls runtime)
- Tool creation uses modified `createCritiqueTools()` with framework injection and `advisorIds` support

**Redis state** — No schema changes. Same keys: `draft:{runId}`, `critique_round:{runId}:{round}`, `pipeline_progress:{runId}`.

**API route** (`/api/content-pipeline/[ideaId]/route.ts`) — No changes. Reads recipe by `contentType`, validates foundation docs, calls pipeline.

**Progress tracking** — Drop the fixed `steps` array from `PipelineProgress`. The `round` / `maxRounds` fields provide coarse progress ("Round 2 of 3"), and `currentStep` provides live status ("Running critiques: Oli Gardner, Joanna Wiebe"). A fixed step list is misleading for a non-linear agent. The `PipelineStep` type also becomes orphaned and should be removed.

**Frontend impact:** `src/app/analyses/[id]/content/generate/page.tsx` currently renders a step-by-step checklist from `progress?.steps` (lines 89-92 for percentage calculation, lines 203-224 for step list rendering). This must be replaced with a round-based progress display: show "Round {round} of {maxRounds}" as the progress indicator, with `currentStep` as a live status line below it.

### Registry Change

The `copywriter` advisor entry needs `evaluationExpertise` added so it works as a named critic:

```ts
{
  id: 'copywriter',
  name: 'Brand Copywriter',
  role: 'author',
  evaluationExpertise:
    'Evaluates brand voice consistency. Does the content match the defined voice ' +
    'attributes? Are tone, vocabulary, and sentence rhythm consistent with the brand ' +
    'voice document? Do counter-examples from the voice guide appear in the copy? ' +
    'Catches voice drift — copy that sounds generic, corporate, or inconsistent with ' +
    'the established brand character.',
  doesNotEvaluate:
    'Does not evaluate SEO strategy, conversion design, behavioral science, or page structure.',
  contextDocs: ['brand-voice'],
}
```

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| New file vs replace existing | Replace entirely | One pattern for all content types. Cleaner than maintaining two orchestrator modes. |
| Critique granularity | Batch with agent-controlled selection | Anthropic best practices: "consolidate rather than fragment" tools. Batch is token-efficient; optional `advisorIds` param gives the agent autonomy to run subsets. |
| Framework injection location | System prompt concatenation | Framework is instructions FOR the author, not content being analyzed. System prompt is the natural place. |
| Progress tracking | Drop fixed `steps`, keep `round`/`maxRounds` + `currentStep` | Fixed step arrays are misleading for a non-linear agent. Round count + live status is more honest. |
| Named critics + dynamic selection | Union, deduplicated | Named critics guarantee coverage for known dimensions. Dynamic selection adds domain-specific expertise. Both are needed. |
| `selectCritics` failure handling | Fall back to named critics | Pipeline should not fail because the critic selection LLM call had a parse error. Named critics are the guaranteed minimum. |

## Files Changed

| File | Change |
|------|--------|
| `src/lib/content-recipes.ts` | Add `authorFramework`, `namedCritics` to interface. Update website recipe. |
| `src/lib/content-critique-agent.ts` | Replace procedural system prompt with goal-oriented template. Drop fixed `steps` from initial progress. |
| `src/lib/agent-tools/critique.ts` | Framework injection in `generate_draft`/`revise_draft`. `advisorIds` param on `run_critiques`. Merge named + dynamic critics. Graceful fallback on `selectCritics` failure. |
| `src/lib/advisors/registry.ts` | Add `evaluationExpertise` to copywriter entry. |
| `src/types/index.ts` | Remove `steps` from `PipelineProgress`. Remove orphaned `PipelineStep` type. |
| `src/app/analyses/[id]/content/generate/page.tsx` | Replace step-checklist progress UI with round-based display ("Round N of M" + `currentStep` status line). |

## Prerequisites (out of scope, handled in other threads)

- Julian Shapiro advisor prompt: already exists at `src/lib/advisors/prompts/julian-shapiro.ts` and is wired in prompt-loader
- Oli Gardner advisor prompt: already exists at `src/lib/advisors/prompts/oli-gardner.ts` and is wired in prompt-loader
- Joanna Wiebe advisor prompt: already exists at `src/lib/advisors/prompts/joanna-wiebe.ts` and is wired in prompt-loader
- Landing Page Assembly framework: `src/lib/frameworks/prompts/landing-page-assembly/prompt.md` (does not exist yet — created via `/add-framework` skill)
- Framework registry entry for `landing-page-assembly` (does not exist yet)

**Note:** The copywriter `evaluationExpertise` addition and the website recipe `authorAdvisor` change from `copywriter` to `julian-shapiro` must be deployed atomically. Otherwise `copywriter` would be excluded as author while also lacking evaluation credentials.

## Testing

**Existing test files to modify:**
- `src/lib/__tests__/content-recipes.test.ts` — Tests for new recipe fields (`authorFramework`, `namedCritics`). Test `selectCritics` deduplication against `namedCritics`.
- `src/lib/__tests__/critique-tools.test.ts` — Test `run_critiques` with `advisorIds` parameter (subset selection). Test framework prompt concatenation in `generate_draft` and `revise_draft`. Test critic selection merges named + dynamic. Test named critic ID resolution (missing ID → warn + skip).

**New test files to create:**
- `src/lib/__tests__/content-critique-agent.test.ts` — System prompt assertions for the goal-oriented template. Minimum cases: prompt contains goal-oriented language (not procedural steps), prompt includes recipe values (`contentType`, `minAggregateScore`, `maxRevisionRounds`), prompt lists critic IDs and focus areas.

**Error path tests:**
- `getFrameworkPrompt` returns `null` → draft proceeds without framework
- Named critic ID not found in registry → skip that critic, log warning, continue with remaining
- `selectCritics` LLM call fails → `run_critiques` catches the throw, falls back to named critics only
- `applyEditorRubric([])` → returns `approve` (unit test of rubric, independent of agent behavior)

**Regression:**
- `editor-decision.test.ts` — Verify existing tests still pass (no changes to rubric logic).
- Blog-post and social-post recipes behave identically to before (no `authorFramework`, no `namedCritics` → same code paths).
