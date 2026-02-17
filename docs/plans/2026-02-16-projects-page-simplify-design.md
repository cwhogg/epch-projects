# Projects Page Simplification

**Date:** 2026-02-16
**Status:** Design
**Scope:** `src/app/page.tsx` (card rendering + data fetching)

## Prerequisites

This design depends on the validation canvas feature branch (`feature/validation-canvas` in `.worktrees/validation-canvas`) being merged to main first. Specifically, it requires:
- `AssumptionType` and `AssumptionStatus` types in `src/types/index.ts`
- `getAssumption()` function exported from `src/lib/db.ts`

Without these, the card UI can still be built — it will render the "Awaiting validation" fallback for all projects — but the validation segments won't show real data.

## Problem

The projects listing page is visually noisy. Each card displays a name, tier badge, truncated description, and a pipeline progress row with 5 inline indicators (dots, badges, text counts). The eye has to parse too many competing elements per card. The design principles say the emotional job is momentum — "what's the state of things, and what do I do next?" — but the current cards answer "here's everything about this project" instead.

Worse, the pipeline indicators (Foundation 4/6, Website Live, Content 3/8) track execution steps, not validation. Knowing that a website is deployed says nothing about whether the business idea is validated.

## Decision

Replace the current card internals with a two-element layout: **name row + validation status segments**. The segments represent the 5 assumption types from the Validation Canvas, not pipeline stages. Keep the same card height and use the freed space for breathing room (whitespace).

## Card Anatomy

### With Canvas Data

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  The Deep Mirror       TIER 2                    ›  │
│                                                     │
│  ██████ ██████ ░░░░░░ ░░░░░░ ░░░░░░                │
│  Demand  Reach  Engage  WTP  Differ                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Without Canvas Data

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Midnight Collective   TIER 1                    ›  │
│                                                     │
│  Awaiting validation                                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Row 1: Project Identity

- Project name: Fraunces, `text-lg`, `font-medium`, `--text-primary`
- Tier badge: existing `badge` + `badge-success`/`badge-warning`/`badge-danger` classes
- Chevron: right-aligned, `--text-muted`, same as today
- No description text (moves to detail page)

### Row 2: Validation Status Segments (or fallback)

**When canvas data exists:** Five equal-width segments in a flex container (`flex-1` each), separated by `gap-0.5` (2px). Each segment is a `div` with `rounded-full`, `h-2`. The entire segment is filled with a single color based on the assumption's status — no partial fills.

Assumption labels sit directly below each segment: `text-[11px]`, `font-medium`, `uppercase`, `tracking-wide`, `--text-muted`. Centered under each segment. Shortened for space:

| Assumption | Label |
|------------|-------|
| Demand | Demand |
| Reachability | Reach |
| Engagement | Engage |
| WTP | WTP |
| Differentiation | Differ |

**When no canvas data exists:** Show a single line of text: "Awaiting validation" in `text-sm`, `--text-muted`. No segments, no bars — avoids a fake-data appearance.

### Spacing

- Card padding: `p-4 sm:p-6` (matches design principles: `p-4` mobile, `p-5 sm:p-6` desktop)
- Gap between name row and validation segments: `mt-4`
- Gap between cards: `gap-4` (up from current `gap-3`)

## Segment Color Logic

Each segment is one solid color based on the assumption status. No percentages or partial fills — just discrete states.

| Status | Color | Token | Meaning |
|--------|-------|-------|---------|
| `untested` | Gray | `--border-default` | No experiment has run |
| `testing` | Amber | `--accent-amber` | Active experiment in progress |
| `validated` | Green | `--accent-emerald` | Evidence confirms assumption |
| `invalidated` | Red | `--color-danger` | Evidence contradicts assumption |
| `pivoted` | Coral | `--accent-coral` | Curator approved a pivot, re-testing |

Colors follow the existing Tier 2 semantic system. The traffic-light mental model works naturally: green = good, amber = in progress, red = problem, gray = nothing yet. Coral for pivoted uses the Tier 1 action color — "something is actively being reconsidered."

## Mobile Behavior

The segmented bar scales naturally with flex. Below `sm` breakpoint, hide the assumption labels (`hidden sm:flex` on the labels row). The colored segments are self-explanatory — the detail page has the full validation canvas.

## Data Changes

### `ProjectSummary` Interface

Add assumption statuses to the existing interface:

```typescript
interface ProjectSummary {
  analysis: Analysis;
  foundationCount: number;        // can keep for detail page
  websiteStatus: string | null;   // can keep for detail page
  contentTotal: number;           // can keep for detail page
  contentComplete: number;        // can keep for detail page
  hasGSCLink: boolean;
  // NEW
  assumptions: Record<AssumptionType, AssumptionStatus> | null;
}
```

### `getProjectSummaries()` Changes

Add a call to fetch assumption statuses for each project. Use `getAssumption()` from `src/lib/db.ts` (not `validation-canvas.ts`). If no canvas data exists, `assumptions` is `null` (renders the "Awaiting validation" fallback).

The existing pipeline data fields (`foundationCount`, `websiteStatus`, etc.) can remain in the interface — they're still used on detail pages — but they're no longer rendered on the projects listing.

## What Changes

**Modified:** `src/app/page.tsx`
- Card rendering: lines 111-199 replaced with name row + validation segments
- Card class: switch from `card-static` to `card` (which has hover lift + coral glow per design principles)
- Data fetching: `getProjectSummaries()` adds assumption status lookups
- `ProjectSummary` interface: adds `assumptions` field

**Removed from cards:**
- Description text (`project.analysis.summary`)
- Foundation dots (6 small circles)
- Website status badge
- Content "X complete / Y total" text
- Analytics "--" placeholder
- All inline pipeline stage labels and indicators
- Inline Tailwind hover utilities (replaced by `.card` class behavior)

**Unchanged:**
- Sort order (by overall score descending)
- Card link behavior (entire card clickable)
- Header section (title, subtitle, CTA button)
- Empty state (no projects at all)
- Staggered `animate-slide-up` entrance animation

## Testing

- **Segment color mapping:** Unit test that maps each `AssumptionStatus` to the correct CSS token/class
- **Null fallback:** Test that `getProjectSummaries()` returns `assumptions: null` when no canvas data exists, and that the card renders "Awaiting validation" text instead of segments
- **Error path:** Test that `getAssumption()` rejecting doesn't crash the page — falls back to `null` gracefully

## What This Does NOT Do

- No new components — segments rendered inline in `page.tsx`
- No changes to the validation canvas module itself
- No auto-generation of assumptions — projects get canvas data when curators generate it
- No changes to other pages
