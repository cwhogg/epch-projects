# Validation Canvas Design

**Date:** 2026-02-16
**Status:** Reviewed

## Problem

The current pipeline treats business creation as a linear strategy-then-execute process. The Foundation Agent generates a multi-section strategy document using Richard Rumelt's "Good Strategy, Bad Strategy" framework — diagnosis, guiding policy, coherent actions. This is designed for organizations navigating complex competitive dynamics.

But EPCH Projects creates small niche businesses, not enterprises. The question isn't "what's our 3-year plan" — it's "is this opportunity real, and if not, what's the nearest opportunity that is?"

Strategy documents are premature when you don't know if anyone will click a signup button. What small niche businesses need is validation.

## Solution

Add a **Validation Canvas** as a first-class concept that sits at the top of each Project page. It tracks a fixed taxonomy of business assumptions as a progression, where each level builds on the previous. The existing pipeline stages become the mechanisms that test these assumptions — the canvas interprets their output.

The human operates as **Curator**: the system auto-generates concrete assumptions from research data, proposes experiments, runs them through existing pipeline stages, synthesizes results, and auto-suggests pivots when assumptions are invalidated. The curator approves experiment batches and makes pivot/kill/persevere decisions.

### Scope of Changes

- **New:** Validation Canvas data model, assumption generation, result synthesis, pivot suggestion system, canvas UI at top of Project page
- **Modified:** Strategy foundation document simplified for small businesses, Richard Rumelt advisor replaced with Seth Godin for strategy docs
- **Unchanged:** All other foundation documents (Positioning, Brand Voice, Design Principles, SEO Strategy, Social Media Strategy), content pipeline, painted door, analytics

## Assumption Taxonomy

Five assumption types, fixed for all projects. Each maps to a pipeline stage that tests it:

| # | Assumption | Question | Primary Data Source | Pipeline Stage |
|---|---|---|---|---|
| 1 | **Demand** | Are people actively seeking a solution? | Keyword volumes, search trends, competitor presence | Analysis |
| 2 | **Reachability** | Can we get in front of them through content? | Rankings, organic impressions, traffic | Content + Analytics |
| 3 | **Engagement** | Do they interact meaningfully when they find us? | Signup rate, time on site, bounce rate, return visits | Painted Door + Analytics |
| 4 | **Willingness to Pay** | Will they pay for a solution? | Pricing page visits, conversion signals | Analytics |
| 5 | **Differentiation** | Do we offer something competitors can't easily replicate? | Sustained traction, competitor gap persistence | Analytics over time |

Assumptions progress roughly in order (Demand before Reachability before Engagement), but this is not enforced — the canvas reflects reality. Content is often the experiment that tests demand, not something gated behind confirmed demand.

## Assumption Lifecycle

Each assumption moves through these states:

- **Untested** — The system has generated a concrete, testable version from research data (e.g., "1,200+ monthly searches for 'chronic illness second opinion'") but no experiment has run.
- **Testing** — An experiment is actively running. Linked to a pipeline stage output (content published, painted door live, analytics collecting).
- **Validated** — Evidence supports the assumption. Includes the confirming data and confidence level.
- **Invalidated** — Evidence contradicts the assumption. Triggers the auto-pivot system.
- **Pivoted** — The curator accepted a pivot suggestion. The original assumption is archived, a new concrete version replaces it. Pivot history is preserved.

Note: When an upstream assumption is invalidated, downstream assumptions visually display as "Reset" in the UI (strikethrough, "Awaiting pivot decision" indicator). This is a **derived UI state**, not a persisted status — downstream assumptions remain `untested` in the data model. The UI derives the reset presentation from the parent assumption's `invalidated` status.

## Pipeline Integration

The canvas sits alongside the pipeline as an interpretation layer — it does not orchestrate or gate pipeline stages.

### Analysis → Demand

The research agent already outputs keyword volumes, competitor counts, market scores, and willingness-to-pay estimates. After analysis completes, the system generates a concrete Demand assumption from this data and auto-sets its status. Strong keyword volume + low competition → Validated. Weak search volume + saturated market → Invalidated, triggering pivot suggestions.

### Foundation → No Direct Assumption Mapping

Foundation docs (Positioning, Brand Voice, etc.) are enablers, not experiments. They support downstream content and website quality. The simplified Strategy doc provides directional clarity but doesn't test an assumption itself.

### Content Publishing + Analytics → Reachability

When content is published and analytics start collecting, the system watches for ranking positions and organic traffic. The Reachability assumption transitions from Untested → Testing when the first piece goes live, and resolves based on whether content gains organic visibility within a defined window (e.g., 30 days of analytics data).

### Painted Door + Analytics → Engagement

The painted door site collects signup attempts, time on site, and bounce rate. Engagement resolves based on conversion thresholds from site visitors.

### Analytics Over Time → WTP and Differentiation

These later assumptions resolve from sustained signals — pricing page visits, repeat engagement, and whether traction holds as competitors notice the niche.

### Result Evaluation Trigger

After each analytics cron run (weekly, Sundays 09:00 UTC), the system evaluates all Testing assumptions against their success thresholds and updates statuses. Invalidations trigger the pivot suggestion system immediately.

**Integration point:** Add an `evaluateAssumptions(ideaId)` call at the end of the existing analytics cron route (`src/app/api/cron/analytics/route.ts`), after `runAnalyticsAgentAuto()` completes. The evaluation runs for each active project that has assumptions in Testing status. When analytics data is missing or incomplete, assumptions remain in their current state — no status change on insufficient data.

### Default Thresholds

Initial thresholds per assumption type. These are starting points — the curator can adjust per project.

| Assumption | Validated When | Invalidated When | Evaluation Window |
|---|---|---|---|
| **Demand** | 500+ monthly searches for primary keyword cluster AND < 20 direct competitors | < 100 monthly searches OR > 50 direct competitors with established authority | Immediate (from research data) |
| **Reachability** | Any content piece ranks in top 50 for a target keyword OR 100+ organic sessions/month | 0 ranking keywords and < 10 organic sessions/month after evaluation window | 45 days after first content published |
| **Engagement** | 3%+ email signup conversion rate from organic visitors OR 2+ min avg time on site | < 0.5% signup rate AND < 30s avg time on site after evaluation window | 30 days after painted door goes live |
| **WTP** | 1%+ click-through to pricing/purchase page from engaged visitors | 0 pricing page visits after 100+ engaged sessions | 60 days after engagement validated |
| **Differentiation** | Sustained or growing organic traffic over 3 consecutive analytics periods | Declining traffic over 3 consecutive periods OR new direct competitor capturing > 50% of target keywords | 90 days (3 weekly analytics cycles minimum) |

## Auto-Pivot System

When an assumption is invalidated, the system generates 2-3 pivot suggestions autonomously. The curator reviews and approves or rejects.

### Pivot Suggestion Contents

Each suggestion includes:

- **The pivot:** A concrete reframing of the assumption (e.g., "Shift from 'rare disease second opinion' to 'chronic illness symptom tracker' — 4x search volume, fewer competitors")
- **Supporting evidence:** Data behind the suggestion (keyword volumes, competitor gaps, adjacent niches found during research)
- **Impact assessment:** What existing work survives the pivot (content salvageable with different angle vs. painted door needs full rebuild)
- **New experiment:** What to run next to test the pivoted assumption

### On Pivot Approval

1. The original assumption moves to Pivoted status with full history preserved
2. A new concrete assumption replaces it at the same taxonomy level
3. Downstream assumptions that depended on the invalidated one reset to Untested (if Demand pivots, Reachability and everything below it resets)
4. The system identifies which foundation docs need regeneration (a demand pivot likely changes positioning and SEO strategy; a reachability pivot might only need new content angles)

### On Project Kill

The project moves to killed/archived status. The canvas freezes as a record of what was tested and what failed — useful reference when evaluating similar niches in the future.

## Strategy Document Simplification

### Current State

The strategy foundation document uses Richard Rumelt's framework via the `richard-rumelt` advisor (mapped in `DOC_ADVISOR_MAP` in `src/lib/agent-tools/foundation.ts`). It generates a multi-section document with The Challenge, The Guiding Policy, and Coherent Actions.

### New Approach

Replace with a Seth Godin-informed strategy document focused on three questions appropriate for small niche businesses:

1. **Who is our smallest viable audience?** — The specific group of people we're trying to serve, defined narrowly enough that we can be remarkable to them.
2. **What makes us remarkable to them?** — The specific thing we do that they'd miss if we disappeared. Not a feature list but the core promise.
3. **What's our permission to reach them?** — How we earn the right to show up in their world. For this system, primarily SEO content that answers questions they're already asking.

### Implementation

- Create `src/lib/advisors/prompts/seth-godin.ts` — matching the existing `.ts` convention used by all current advisor prompts. Exports a `prompt` string constant starting with "You are Seth Godin, ..."
- Add `'seth-godin': prompts.sethGodin` to `promptMap` in `src/lib/advisors/prompt-loader.ts`
- Add corresponding export to `src/lib/advisors/prompts/index.ts`
- Update `DOC_ADVISOR_MAP` in `src/lib/agent-tools/foundation.ts`: change `'strategy': 'richard-rumelt'` to `'strategy': 'seth-godin'`
- Simplify the strategy tool's output template from multi-section to the three core questions
- Keep `richard-rumelt.ts` in the codebase — remove from strategy pipeline but don't delete
- Add Seth Godin to the project advisor registry in `src/lib/advisors/registry.ts`
- Target output: 1-page document (vs. current multi-section format)

### Regeneration Trigger

The strategy doc gets regenerated automatically after any Demand or Differentiation pivot, since those change the fundamental audience and positioning. Dependency order is unchanged — Strategy still generates first, Positioning still depends on it.

## Data Model

New Redis structures for the validation canvas:

### Canvas State

```
canvas:{ideaId} → JSON {
  status: "active" | "killed",
  killedAt?: number,
  killedReason?: string
}
```

### Individual Assumptions

```
assumption:{ideaId}:{type} → JSON {
  type: "demand" | "reachability" | "engagement" | "wtp" | "differentiation",
  status: "untested" | "testing" | "validated" | "invalidated" | "pivoted",
  statement: string,
  evidence: string[],
  threshold: {                // success/failure criteria
    validated: string,         // e.g., "500+ monthly searches, < 20 competitors"
    invalidated: string,       // e.g., "< 100 monthly searches"
    windowDays: number         // evaluation window in days (0 = immediate)
  },
  linkedStage: string,
  validatedAt?: number,
  invalidatedAt?: number
}
```

### Pivot History (append-only list)

```
pivots:{ideaId}:{type} → JSON[] [
  {
    fromStatement: string,
    toStatement: string,
    reason: string,
    suggestedBy: "system",
    approvedBy: "curator",
    timestamp: number,
    alternatives: PivotSuggestion[]
  }
]
```

### Pivot Suggestions (ephemeral, cleared on decision)

```
pivot-suggestions:{ideaId}:{type} → JSON[] [
  {
    statement: string,
    evidence: string[],
    impact: string,
    experiment: string
  }
]
```

## New Module

No new agents. The validation canvas logic lives in `src/lib/validation-canvas.ts` with functions:

- `generateAssumptions(ideaId)` — reads research data, populates the five assumptions with concrete testable statements
- `evaluateAssumptions(ideaId)` — called after analytics cron, checks Testing assumptions against thresholds, updates statuses
- `generatePivotSuggestions(ideaId, type)` — LLM call to generate 2-3 alternatives when an assumption is invalidated
- `applyPivot(ideaId, type, suggestionIndex)` — curator approves a pivot, updates assumption state, resets downstream assumptions, triggers foundation doc regeneration if needed

## API Routes

- `GET /api/validation/[ideaId]` — returns full canvas state (canvas + all five assumptions + any pending pivot suggestions)
- `POST /api/validation/[ideaId]/pivot` — curator approves a pivot suggestion (body: `{ type, suggestionIndex }`)
- `POST /api/validation/[ideaId]/kill` — curator kills the project (body: `{ reason }`)

## UI: Project Page Changes

### Canvas Placement

The validation canvas sits at the top of the Project page (`src/app/analyses/[id]/page.tsx`), above the existing summary cards (Analysis, Foundation Documents, Painted Door Site, Content Pipeline, Performance). It is the first thing visible — the current state of "is this business real?"

### Canvas Component

The canvas is a client component (`src/components/ValidationCanvas.tsx` with `'use client'`) embedded in the server-rendered project page. It fetches canvas data from `GET /api/validation/[ideaId]` on mount, and calls the pivot/kill POST routes on user action. This follows the same pattern as other interactive components on the page (e.g., `ScoreRing`).

### Canvas Layout

A horizontal progression of five cards, left to right, following the project's design system (coral accent, Fraunces + DM Sans typography, CSS custom properties for theme support):

- Each card shows: assumption type, status (color-coded), concrete statement, key data point
- Status colors: emerald (validated), amber (testing), muted/gray (untested), danger/red (invalidated)
- Arrow connectors between cards indicate progression
- Active/testing cards have a subtle pulse or border highlight

### Invalidated State

When an assumption is invalidated, the card expands inline to show pivot suggestions. The curator can approve a pivot or kill the project directly from the canvas — no navigation to a separate page.

### Pivot History

A small "history" link on pivoted cards opens a timeline of what was tried, what the data showed, and why pivots happened. This is the project's institutional memory.

### Killed Projects

The entire canvas grays out with a summary of what was tested and where it failed. Preserved for pattern recognition across projects.

### Below the Canvas

The existing summary cards and tabs remain as-is. The canvas provides the "why" context, the tabs provide the "what" detail.

See mockup: `docs/mockups/validation-canvas/project-page.html`

## Testing Strategy

### New Test Files

| File | Coverage |
|---|---|
| `src/lib/__tests__/validation-canvas.test.ts` | `generateAssumptions`, `evaluateAssumptions`, `applyPivot` — core canvas logic |
| `src/lib/__tests__/pivot-suggestions.test.ts` | `generatePivotSuggestions` — LLM call mocking, suggestion structure, error handling |
| `src/app/api/validation/__tests__/route.test.ts` | GET/POST handlers for canvas, pivot approval, kill endpoints |
| `src/components/__tests__/ValidationCanvas.test.tsx` | Client component rendering, status display, pivot approval interaction, kill button |

### Mock Strategy

Redis operations mocked as in existing `foundation-db.test.ts`. LLM calls for pivot suggestions mocked with representative responses and error cases.

### Key Test Scenarios

**Success paths:**
- Assumption generation from complete research data
- Assumption generation from partial/missing research data
- Status transitions: untested → testing → validated
- Status transitions: untested → testing → invalidated → pivoted
- Pivot application resets downstream assumptions
- Kill freezes the canvas
- Analytics cron evaluation updates assumption statuses
- Strategy doc regeneration triggered by Demand/Differentiation pivot

**Error paths:**
- Pivot suggestion generation with LLM API failure
- Pivot suggestion generation with empty/malformed LLM response
- Pivot approval for non-existent assumption
- Pivot approval on already-validated assumption
- Double-kill attempt
- Canvas operations on non-existent ideaId
- evaluateAssumptions when analytics data is missing

## Decision Log

| Decision | Rationale | Alternatives Considered |
|---|---|---|
| Validation over strategy-first | Small niche businesses need validation, not enterprise strategy. Experiments are cheap in an AI world. | Keep full strategy framework (too heavy for scale) |
| Fixed assumption taxonomy | Universal for businesses this small. Predictable, easier to build. | AI-generated assumptions (creative but unpredictable), human-seeded (too manual) |
| Human as Curator | System proposes, human decides. Leverages automation while keeping human judgment on pivot/kill. | Director (too manual), Observer (too autonomous for business decisions) |
| Canvas alongside pipeline | Least disruptive integration. Canvas interprets pipeline output without rewiring orchestration. | Canvas drives pipeline (tight coupling), Canvas gates pipeline (wrong — content often tests demand) |
| Seth Godin for strategy | "Smallest viable audience" maps directly to niche business validation. Permission marketing fits SEO content model. | Sahil Lavingia (less content-focused), Rob Walling (SaaS-specific), Jason Fried (less framework-oriented) |
| Auto-suggest pivots on invalidation | Keeps curator efficient. System does creative work of finding alternatives. | Flag and recommend (less actionable), Just report (too passive) |
| Downstream assumption reset on pivot | If Demand changes, Reachability and below are untested in the new context. Prevents stale validation. | Keep downstream statuses (misleading — validated under old assumption) |
