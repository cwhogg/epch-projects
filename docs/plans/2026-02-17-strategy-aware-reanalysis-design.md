# Strategy-Aware Re-Analysis

## Problem

When a user re-analyzes a project, the research agent evaluates broad market demand without knowing the user's refined strategic direction. Strategy and positioning foundation documents are created after the initial analysis and may evolve over time. Re-analysis needs to evaluate SEO demand, competitors, and market fit for the user's specific strategic angle — not the generic market.

## Solution

When re-analyzing, automatically fetch the project's strategy and positioning foundation documents and inject them into the research agent's context. This shifts the entire research focus — keywords, competitors, WTP, and scoring — to align with the user's current strategic direction.

## Design

### 1. Re-Analyze Panel Update

**Component:** `src/components/ReanalyzeForm.tsx`

Note: `ReanalyzeForm` is an inline expandable card (not a modal/dialog). It toggles between a button and an inline form panel.

When strategy and/or positioning foundation docs exist for this idea, the panel displays them above the existing "additional context" text area:

- Each doc shows: name, version number, last-edited or generated date (e.g., "Strategy v2 — updated Feb 15")
- Each doc has an expand/collapse toggle to preview the content
- If no foundation docs exist, the panel renders identically to today
- The "additional context" free-text area remains for user input on top of foundation context
- **Submit guard change:** The current component requires non-empty textarea text to submit. When foundation docs are present, relax this guard — allow submission with empty textarea since the foundation docs provide sufficient context for re-analysis.

**Data source:** The analysis page (`src/app/project/[id]/analysis/page.tsx`) fetches foundation docs for the idea and passes them as a prop to `ReanalyzeForm`. The panel is purely informational — the POST payload to `/api/analyze/[id]` does not change. Foundation docs are fetched server-side by the API route.

### 2. Server-Side Foundation Context Injection

**API route:** `src/app/api/analyze/[id]/route.ts`

When a re-analysis is triggered, **inside the `after()` callback** (so the HTTP response is not delayed):

1. Fetch strategy and positioning docs using `getFoundationDoc(ideaId, 'strategy')` and `getFoundationDoc(ideaId, 'positioning')` from `src/lib/db.ts` (2 targeted Redis calls, not `getAllFoundationDocs` which makes 6)
2. If either fetch fails (Redis timeout, corruption), log the error and proceed without foundation context — foundation enrichment is supplementary, not required
3. Call `buildFoundationContext(docs)` to format them into a structured prompt block
4. Prepend the result to the `additionalContext` string before passing to `runResearchAgentAuto()`

**Foundation context builder:** `src/lib/research-agent-prompts.ts`

New function `buildFoundationContext(docs: FoundationDocument[]): string` that produces:

```
STRATEGIC CONTEXT (from foundation documents):

## Strategy (v2, last updated Feb 15)
[Strategy document content, truncated to 4,000 characters]

## Positioning (v1, generated Feb 12)
[Positioning document content, truncated to 4,000 characters]

Use this strategic context to focus your research. When selecting keywords,
analyzing competitors, and evaluating market demand, prioritize areas aligned
with this strategic direction rather than the broad market.
```

Returns empty string when no relevant docs exist.

**Token budget:** Each foundation doc's content is truncated to 4,000 characters (matching the existing `idea.documentContent` truncation pattern in `createPrompt`). Combined max: ~8,000 characters of foundation context. This is added to every LLM call (competitors, SEO pipeline, WTP, scoring) via the `additionalContext` string.

**Why piggyback on additionalContext:** The `additionalContext` parameter is already threaded through `createPrompt()`, the SEO pipeline, and all scoring functions. Prepending foundation context to this string requires zero signature changes to `runResearchAgentAuto`, `createPrompt`, or any SEO pipeline function.

**V2 agent path note:** The V2 agentic path (`runResearchAgentV2`) also receives `additionalContext` but injects it differently — as a system message and into tool-scoped prompts. The prepended foundation context will flow through both paths. This is acceptable since both V1 and V2 use `additionalContext` to provide research context to the LLM. No special V2 handling needed.

### 3. Which Foundation Docs Are Included

Only **strategy** and **positioning**. Not SEO Strategy or other downstream docs.

Rationale: SEO Strategy is built from analysis results + strategy + positioning. Including it in re-analysis would be circular — feeding old SEO conclusions into the analysis that's supposed to replace them. Strategy and positioning are upstream inputs that define the direction; the analysis validates whether that direction has market demand.

### 4. Behavior Matrix

| Scenario | Foundation docs injected | Modal shows docs |
|----------|------------------------|-----------------|
| First analysis (no foundation docs exist) | None | No foundation section |
| Re-analysis, no foundation docs exist | None | No foundation section |
| Re-analysis, strategy exists | Strategy only | Strategy listed |
| Re-analysis, strategy + positioning exist | Both | Both listed |
| Re-analysis, positioning exists but not strategy | Positioning only | Positioning listed |
| Re-analysis, all foundation docs exist | Strategy + positioning only | Strategy + positioning listed |
| Re-analysis, foundation docs exist, textarea empty | Strategy + positioning (no user text) | Docs listed, submit enabled |
| Re-analysis, Redis fetch fails for foundation docs | None (graceful degradation) | No foundation section shown |

## Files Changed

| File | Change |
|------|--------|
| `src/components/ReanalyzeForm.tsx` | Accept `foundationDocs` prop, render doc list with expand/collapse in panel, relax submit guard when docs present |
| `src/app/project/[id]/analysis/page.tsx` | Fetch foundation docs for the idea, pass to ReanalyzeForm |
| `src/app/api/analyze/[id]/route.ts` | Fetch strategy + positioning docs, build context, prepend to additionalContext |
| `src/lib/research-agent-prompts.ts` | Add `buildFoundationContext()` helper |

## Files NOT Changed

- `src/lib/research-agent.ts` — no signature changes, additionalContext already flows through
- SEO pipeline functions — already receive additionalContext
- Foundation API routes — untouched
- `src/types/index.ts` — no new types needed
- `src/lib/db.ts` — existing `getFoundationDoc(ideaId, docType)` function used as-is

## Tests

| Test file | What it verifies |
|-----------|-----------------|
| `src/lib/__tests__/research-agent-prompts.test.ts` | `buildFoundationContext`: returns empty string when no docs; formats strategy only; formats both strategy + positioning; includes version and date metadata; ignores non-strategy/positioning docs; truncates docs exceeding 4,000 characters |
| `src/components/__tests__/ReanalyzeForm.test.tsx` | Renders foundation doc list when docs provided; hides section when no docs; expand/collapse toggles work; still renders additional context textarea; submit enabled with empty textarea when foundation docs present; submit disabled with empty textarea when no foundation docs |
| `src/app/api/analyze/[id]/__tests__/route.test.ts` | Foundation docs fetched and prepended when they exist; original behavior preserved when no docs exist; only strategy + positioning fetched (not other doc types); graceful degradation when Redis fetch fails (analysis proceeds without foundation context) |

## Decision Log

| Decision | Chosen | Alternatives considered | Rationale |
|----------|--------|------------------------|-----------|
| Research scope | Shift research focus | Lens-only scoring, user toggle | If strategy targets a niche, you need demand data for that niche, not the broad market |
| Doc inclusion | Auto-include with info display | User toggles, silent inclusion | Users should see what's influencing analysis, but don't need to opt in/out |
| Which docs | Strategy + positioning only | Include SEO strategy, include all | SEO strategy is downstream of analysis — including it would be circular |
| Integration method | Prepend to additionalContext | Separate parameter | Zero signature changes across 4+ functions; additionalContext already flows everywhere |
| Staleness banners | Not included | Banner on foundation page | Small user base, users know when to regenerate; unnecessary complexity |
| Error handling | Graceful degradation | Abort re-analysis, require foundation docs | Foundation context is supplementary; analysis should always be able to proceed |
| Token budget | 4,000 chars per doc | No limit, summarize instead | Matches existing `documentContent` truncation pattern; predictable cost |
| Submit guard | Relax when docs present | Always require text | Users should be able to re-analyze with only foundation docs as context |
