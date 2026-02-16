# Navigation Redesign — Project-Centric Architecture

*February 16, 2026*

## Problem

The app's navigation is stage-oriented — 7 tabs (Ideation, Analysis, Foundation, Website, Content, Testing, Optimization) that each show cross-project views of a single pipeline stage. The home page replicates this structure as 6 clickable stage cards (all stages except Foundation), adding no value beyond the nav tabs.

The natural mental model is project-oriented: "what's happening with this product idea?" Users think in terms of projects, not pipeline stages. The current structure forces users to hop between tabs to get a complete picture of any single project.

## Solution

Restructure navigation around projects as the primary entry point:

1. **Home page** — list of all projects with pipeline progress at a glance
2. **Top nav** — only cross-cutting concerns (Ideation, Analytics)
3. **Project dashboard** — `/analyses/[id]` becomes the project hub with summary cards linking to detail pages

The content pipeline work (Phase 1 gaps, Phase 2 critique engine) is unaffected — foundation docs, content, website, and analytics detail pages stay at their current routes. They're accessed from the project dashboard instead of from top-level nav tabs.

---

## Navigation

### Desktop (Top Bar)

Three links, left-aligned after the logo:

| Label | Route | Purpose |
|-------|-------|---------|
| Projects | `/` | Home — project list |
| Ideation | `/ideas/new` | Create new product ideas |
| Analytics | `/analytics` | Cross-site performance metrics |

The EPCH logo also links home (`/`).

### Mobile (Bottom Bar)

Three tabs replacing the current 7:

| Icon | Label | Route |
|------|-------|-------|
| Grid/Home | Projects | `/` |
| Lightbulb | Ideation | `/ideas/new` |
| Chart | Analytics | `/analytics` |

### Removed from Navigation

All 7 current tabs are removed: Ideation, Analysis, Foundation, Website, Content, Testing, Optimization. The underlying pages continue to exist at their current URLs (reachable by direct URL) but are no longer linked from navigation. No page deletion required.

### Analytics Page

New route: `/analytics`. Initially redirects to `/testing` (the existing cross-project testing dashboard). Later evolves into a dedicated cross-site analytics view aggregating impressions, clicks, signups, and content performance across all projects.

---

## Home Page — Project List

**Route:** `/` (replaces the current pipeline stage view)

**Mockup:** `docs/mockups/nav-redesign/home-project-list.html`

### Layout

Header section with title and CTA, followed by a vertical list of project cards sorted by analysis score (descending).

### Project Card

Each card shows:

- **Project name** — from `Analysis.ideaName`
- **Tier badge** — Tier 1/2/3 from analysis recommendation (color-coded)
- **One-line description** — from the analysis summary, truncated
- **Pipeline progress indicators** — compact stage indicators showing:
  - **Analysis** — always complete (filled dot, since the project exists)
  - **Foundation** — X/6 filled dots showing document completion count
  - **Website** — status label (Live, Deploying, Pushing, Generating, Not Started; red badge for Failed)
  - **Content** — "X complete / Y total" piece counts (`ContentPiece.status === 'complete'` means generated, not necessarily published to a live site)
  - **Analytics** — active indicator if GSC data is connected

The entire card is clickable, linking to `/analyses/[id]`.

### Data Source

The project list is built from `getAnalysesFromDb()`, enriched with:

- `getAllFoundationDocs(ideaId)` for foundation doc count
- `getAllPaintedDoorSites()` for website status per idea
- `getAllContentCalendars()` for content piece counts

This is a new data aggregation. See Implementation Notes for details on Redis call counts and caching strategy.

### Sort Order

Projects sorted by analysis score (descending), matching the current leaderboard behavior.

### Empty State

When no projects exist: centered message "No projects yet. Start by testing a new product idea." with a prominent CTA button linking to `/ideas/new`.

---

## Project Dashboard

**Route:** `/analyses/[id]` (replaces the existing analysis detail page)

**Mockup:** `docs/mockups/nav-redesign/project-dashboard.html`

The current analysis detail page is restructured into a project hub. Analysis content (scores, risks, SEO deep dive, full analysis markdown) moves to a new analysis detail page at `/analyses/[id]/analysis`. The dashboard shows the project header and full-width pipeline summary cards.

### Layout

Full-width stacked cards (one per pipeline stage), each providing a summary with enough detail to assess status at a glance. The header's back link changes from "Back" (linking to `/analysis`) to "Back to Projects" (linking to `/`).

Header action buttons: View Site (or Create Website if no site exists). Foundation Docs, Reanalyze, and Delete buttons are removed from the dashboard — Foundation Docs is covered by the Foundation card, and Reanalyze/Delete move to the analysis detail page.

### Pipeline Summary Cards

Five full-width cards stacked vertically. Each card is clickable and links to its detail page:

**Analysis Card:**
- Title: "Analysis"
- Mini score ring (overall score) + tier badge + confidence
- Inline breakdown of all 5 dimension scores (SEO, Competition, WTP, Differentiation, Expertise)
- Summary line: top risk + top keyword (one line each)
- Links to: `/analyses/[id]/analysis`

**Foundation Card:**
- Title: "Foundation Documents"
- Progress: dot indicators showing completion + "X/6 complete" text
- 2-column list of all 6 doc names with check marks for completed docs
- Links to: `/analyses/[id]/foundation`
- Shows "Not started" if no docs exist

**Website Card:**
- Title: "Painted Door Site"
- Status badge: Live (green), Deploying (amber), Generating (amber), Pushing (amber), Failed (red), Not Started (muted)
- Detail: domain name + signup count if live
- Links to: `/analyses/[id]/painted-door`

**Content Card:**
- Title: "Content Pipeline"
- Three stat columns: Complete / Pending / Total piece counts (`complete` = generated content; pending = not yet generated)
- Content type hints derived from actual `ContentType` values on the pieces (blog-post, comparison, faq)
- Links to: `/analyses/[id]/content`
- Shows "Not started" if no calendar exists

**Performance Card (conditional):**
Only rendered when GSC data is connected for this project:
- Title: "Performance"
- Three stat columns: Impressions / Clicks / CTR (last 7 days)
- Links to: `/analyses/[id]/analytics`

---

## Analysis Detail Page

**Route:** `/analyses/[id]/analysis` (new page)

**Mockup:** `docs/mockups/nav-redesign/analysis-detail.html`

Contains all the analysis content that previously lived on `/analyses/[id]`. Visually identical to the existing live analysis page with three changes: updated global navigation (3 links replacing 7), "Back to Project" breadcrumb linking to `/analyses/[id]`, and a collapsible Full Analysis section.

### Layout

- **Header:** Project name, analysis date, tier badge, confidence level, Reanalyze + Delete buttons
- **Scores:** 6 ring visualizations (SEO, Competition, WTP, Differentiation, Expertise, Overall)
- **Key Risks:** Bullet list of risks from the analysis
- **SEO Deep Dive:** LLM cross-reference summary, SERP-validated keywords, top keywords table
- **Full Analysis:** Collapsible/expandable markdown section. Collapsed by default with a gradient fade and "Show full analysis" toggle button. Click to expand to full height.

### Data Source

Uses the same `getAnalysisData()` function from the existing page. No new data fetching required — the function already loads `analysis`, `content` (including `seoData`), and related metadata.

---

## Routing Changes

### Modified Routes

| Route | Current Purpose | New Purpose |
|-------|----------------|-------------|
| `/` | Pipeline stage view (6 stage cards) | Project list |
| `/analyses/[id]` | Analysis detail (scores, risks, markdown) | Project dashboard (pipeline summary cards) |

### New Routes

| Route | Purpose | Accessed From |
|-------|---------|---------------|
| `/analyses/[id]/analysis` | Analysis detail (scores, risks, SEO, full analysis) | Dashboard Analysis card |
| `/analytics` | Cross-site analytics. Initially redirects to `/testing`. | Nav Analytics link |

### Unchanged Routes

| Route | Purpose | Accessed From |
|-------|---------|---------------|
| `/analyses/[id]/foundation` | Foundation docs panel | Dashboard Foundation card |
| `/analyses/[id]/content` | Content calendar | Dashboard Content card |
| `/analyses/[id]/content/[pieceId]` | Content piece detail | Content calendar |
| `/analyses/[id]/content/generate` | Content generation wizard | Content calendar |
| `/analyses/[id]/painted-door` | Website builder | Dashboard Website card |
| `/analyses/[id]/analytics` | SEO performance | Dashboard Performance card |
| `/ideas/new` | Create new idea form | Nav Ideation link |
| `/api/*` | All API routes | Unchanged |

### Orphaned from Navigation (Still Accessible by URL)

| Route | Current Nav Tab | Status |
|-------|----------------|--------|
| `/analysis` | Analysis | No nav link. Useful as power-user leaderboard view. |
| `/content` | Content | No nav link. Cross-project content calendars. |
| `/website` | Website | No nav link. Cross-project painted door sites. |
| `/testing` | Testing | Redirected from `/analytics` initially. |
| `/foundation` | Foundation | No nav link. Cross-project foundation docs. |
| `/ideation` | Ideation | Replaced by nav link to `/ideas/new`. |
| `/optimization` | Optimization | Placeholder. Can be removed later. |

---

## Interaction with Content Pipeline Work

### Phase 1 Gaps Plan

Phase 1 gaps work may already be merged to main (no active worktree exists for it). If tasks 6-8 (foundation panel UI rewrite) are complete, the back link text change ("Back to Analysis" → "Back to Project") applies to the already-landed foundation panel. If still in progress, the change applies when the panel work lands.

The foundation panel at `/analyses/[id]/foundation/page.tsx` stays at its current route. The only change: it's now accessed from the project dashboard summary card instead of a top-level nav tab.

### Phase 2 (Critique Engine)

Entirely backend. No routing impact. The critique progress UI (View 3 in the content pipeline design doc) renders within the existing project context — no changes needed.

### Content Pipeline Mockups

| Mockup | Status |
|--------|--------|
| `content-pipeline/foundation-panel.html` | **Reused** — section within project context |
| `content-pipeline/expanded-document-view.html` | **Reused** — drill-in from foundation panel |
| `content-pipeline/generation-progress.html` | **Reused** — works within project context |
| `content-pipeline/advisor-interview.html` | **Reused** — Phase 4a target, unchanged |
| `foundation-tab-promotion/desktop-nav.html` | **Delete** — superseded by project-centric nav |
| `foundation-tab-promotion/mobile-nav.html` | **Delete** — superseded by project-centric nav |
| `foundation-tab-promotion/foundation-page.html` | **Delete** — superseded by project-centric nav |

---

## Files Changed

### Must Create

| File | Purpose |
|------|--------|
| `src/app/analyses/[id]/analysis/page.tsx` | Analysis detail page — scores, risks, SEO deep dive, full analysis (collapsible). Reuses `ReanalyzeForm`, `DeleteButton`, `MarkdownContent` components. Uses extracted `ScoreRing` and `SEODeepDive`. |
| `src/components/ScoreRing.tsx` | Extracted from `src/app/analyses/[id]/page.tsx` (currently inline at line 89). Used by both the dashboard Analysis card and the analysis detail page. |
| `src/components/SEODeepDive.tsx` | Extracted from `src/app/analyses/[id]/page.tsx` (currently inline at line 150). Used by the analysis detail page. |

### Must Modify

| File | Change |
|------|--------|
| `src/app/page.tsx` | Complete rewrite — pipeline view to project list |
| `src/app/analyses/[id]/page.tsx` | Complete rewrite — analysis detail becomes project dashboard with pipeline summary cards |
| `src/components/NavLinks.tsx` | Replace 7 tabs with 3 (Projects, Ideation, Analytics) |
| `src/components/MobileNav.tsx` | Replace 7 tabs with 3 |

### Must Modify (Already Exists)

| File | Change |
|------|--------|
| `src/app/analytics/page.tsx` | Already exists with redirect to `/testing`. Update if analytics page evolves beyond redirect. |

### Already Deleted

The `docs/mockups/foundation-tab-promotion/` mockups (desktop-nav, mobile-nav, foundation-page) were already deleted in commit `8349a8b`.

### Unchanged

All API routes, `/analyses/[id]/foundation`, `/analyses/[id]/content`, `/analyses/[id]/painted-door`, `/analyses/[id]/analytics` pages, all backend code, all existing tests.

---

## Testing Strategy

### Unit Tests

**`src/app/__tests__/page.test.tsx` (new):**
- Renders project cards for each analysis
- Shows pipeline progress indicators (foundation doc count, website status, content counts)
- Cards link to `/analyses/[id]`
- Empty state renders when no analyses exist
- Error state renders on fetch failure

**`src/app/analyses/[id]/__tests__/page.test.tsx` (new):**
- Summary cards section renders with correct data
- Analysis card shows overall score, tier, and links to analysis detail
- Foundation card shows correct doc count and links to foundation page
- Website card shows correct status and signup count
- Content card shows correct piece counts
- Performance card only rendered when GSC data exists
- Cards not rendered when no data exists for that section

**`src/app/analyses/[id]/analysis/__tests__/page.test.tsx` (new):**
- Score rings render with correct values for all 6 dimensions
- Key Risks section renders risk list
- SEO Deep Dive renders when seoData exists, hidden when absent
- Full Analysis section is collapsible (collapsed by default)
- Reanalyze and Delete buttons render
- Back link points to `/analyses/[id]`

**`src/components/__tests__/NavLinks.test.tsx` (new):**
- Renders 3 nav items (Projects, Ideation, Analytics)
- Active state highlights correctly for each route
- No longer renders Analysis, Foundation, Website, Content, Testing, Optimization

**`src/components/__tests__/MobileNav.test.tsx` (new):**
- Renders 3 bottom tabs with correct icons
- Active state highlights correctly

### Integration Tests

- Navigate from home to project card to project dashboard to foundation panel to back to dashboard
- Verify all summary card links resolve to correct pages
- Verify analytics redirect to testing page

### Visual Verification

- Desktop nav at various widths (3 tabs should never wrap)
- Mobile nav with 3 tabs (adequate touch targets)
- Project cards with various pipeline completion states
- Dashboard summary cards with missing data (no website, no content, no analytics)
- Empty project list state

---

## Implementation Notes

### Data Aggregation for Home Page

The home page needs to aggregate pipeline status across multiple Redis keys per project:

```typescript
async function getProjectSummaries(): Promise<ProjectSummary[]> {
  const [analyses, allSites, allCalendars] = await Promise.all([
    getAnalysesFromDb(),
    getAllPaintedDoorSites(),
    getAllContentCalendars(),
  ]);

  // Batch foundation doc counts — one call per analysis
  const summaries = await Promise.all(analyses.map(async (analysis) => {
    const docs = await getAllFoundationDocs(analysis.ideaId);
    const site = allSites.find(s => s.ideaId === analysis.ideaId);
    const calendar = allCalendars.find(c => c.ideaId === analysis.ideaId);

    return {
      analysis,
      foundationCount: Object.keys(docs).length,
      websiteStatus: site?.status ?? null,
      websiteSignups: site?.signupCount ?? 0,
      contentTotal: calendar?.pieces.length ?? 0,
      contentComplete: calendar?.pieces.filter(p => p.status === 'complete').length ?? 0, // 'complete' = generated, not necessarily published to live site
    };
  }));

  // Sort by overall score descending
  return summaries.sort((a, b) =>
    (b.analysis.scores.overall ?? 0) - (a.analysis.scores.overall ?? 0)
  );
}
```

Cross-project queries (`getAllPaintedDoorSites`, `getAllContentCalendars`) are called once and filtered per project to avoid N+1 Redis calls. Per-project `getAllFoundationDocs` is the only N-call — it makes 6 serial Redis calls per project (one per doc type). For < 20 projects (~120 Redis calls total), this is acceptable. If it becomes slow, add a `project_summary:{ideaId}` cache key.

**Error handling:** Wrap the per-project `getAllFoundationDocs` call in a try/catch, defaulting `foundationCount` to 0 on failure. Follow the existing `.catch(() => null)` pattern used for `getPaintedDoorSite` elsewhere. One project's foundation doc failure should not tank the entire home page.

### Dashboard Summary Cards — Server Component

The existing analysis detail page (`/analyses/[id]/page.tsx`) is already a server component that fetches `paintedDoorSite`, `contentCalendar`, `contentPieceCount`, and `hasGSCLink` in its `getAnalysisData()` function. This data feeds the pipeline summary cards. Two new data sources to add: foundation doc count (via `getAllFoundationDocs`) and signup count (via `getEmailSignupCount` or by returning the full `PaintedDoorSite` object instead of `{ siteUrl, status }`). The `ScoreRing`, `SEODeepDive`, `ReanalyzeForm`, `DeleteButton`, and `MarkdownContent` components move to the new analysis detail page at `/analyses/[id]/analysis/page.tsx`.

### Analysis Detail Page — Collapsible Full Analysis

The Full Analysis section uses a client component for the expand/collapse toggle. The section renders collapsed by default (CSS `max-height` with overflow hidden + gradient fade). A toggle button switches between collapsed and expanded states. Implementation note: use `max-height: none` for the expanded state rather than a fixed pixel value, since analysis markdown length is variable. This is the only client interaction on the analysis detail page — the rest remains a server component.

### Light Mode

The app respects system color preference via `@media (prefers-color-scheme: light)` in `globals.css`. The mockups demonstrate dark mode only. Implementation must use the existing CSS custom properties (which automatically switch between light and dark) rather than hard-coded color values.

---

## Decision Log

### Summary

| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Primary navigation model | Project-centric (3 tabs) | Stage-centric (7 tabs, current), hybrid |
| 2 | Home page content | Project list with pipeline progress | Pipeline stages (current), leaderboard |
| 3 | Project dashboard layout | Full-width stacked summary cards (analysis detail on sub-page) | Compact grid, inline sections, tabbed sections |
| 4 | URL structure | Keep `/analyses/[id]` | Rename to `/projects/[id]` |
| 5 | Cross-project listing pages | Orphan from nav, keep accessible by URL | Delete, move under `/admin/` |
| 6 | Foundation-tab-promotion mockups | Delete | Keep for reference |
| 7 | Analytics route | New `/analytics`, initially redirect to `/testing` | Reuse `/testing` route |
| 8 | Content pipeline interaction | No changes to in-progress work | Refactor routes to `/projects/*` |
| 9 | Analysis detail page | Separate sub-page at `/analyses/[id]/analysis` | Keep inline on dashboard, tabbed sections |
| 10 | Full Analysis section | Collapsible, collapsed by default | Always expanded, remove entirely |

### Decision Details

#### Decision 1: Project-Centric Navigation

**Chose:** 3-tab navigation (Projects, Ideation, Analytics).

**Why:** The stage-oriented nav forces users to think in pipeline stages rather than projects. With multiple projects at different stages, the natural question is "what's happening with Project X?" not "what's in the Content stage across all projects?" Reducing from 7 tabs to 3 also dramatically improves mobile usability — each tab gets more touch target space.

**Alternatives rejected:**
- Stage-centric (7 tabs): Current design. Duplicates home page, overwhelming on mobile, wrong mental model.
- Hybrid (projects + some stage tabs): Half-measures that don't commit to either model. Users would be confused about when to use stage tabs vs project drill-in.

#### Decision 2: Minimal Project Cards

**Chose:** Project name, description, and compact pipeline progress dots/indicators.

**Why:** The home page should help users pick which project to work on. Detailed scores, analysis data, and pipeline specifics are available on the project dashboard. The home page needs enough at a glance to know: what's the project, how far along is it, what needs attention.

**Alternatives rejected:**
- Score-forward (analysis score rings prominent): Too much detail for a list view. Scores are meaningful only in context, available on the dashboard.
- Status-forward (prominent status label): Too reductive — a single status label can't capture a multi-stage pipeline.

#### Decision 3: Full-Width Stacked Summary Cards

**Chose:** Full-width stacked summary cards on the dashboard, with analysis content moved to a sub-page.

**Why:** Full-width cards give each pipeline stage room for meaningful detail (score breakdowns, doc checklists, stat columns) without forcing users to click through for basic status. A compact grid was too cramped — important details were hidden behind clicks. Moving analysis content to `/analyses/[id]/analysis` keeps the dashboard focused on pipeline status. The analysis detail page is essentially the existing live page with minimal changes (nav, breadcrumb, collapsible Full Analysis).

**Alternatives rejected:**
- Compact grid (3-4 columns): Too little space per card, critical details hidden.
- Inline sections (analysis content on dashboard): Dashboard becomes miles long, mixing pipeline status with analysis detail.
- Tabbed sections: Hides content behind clicks, adds UI complexity.

#### Decision 4: Keep Existing URLs

**Chose:** Keep `/analyses/[id]` as the project URL.

**Why:** Changing to `/projects/[id]` would require updating every route, every link, and the in-progress content pipeline worktree. The URL is an implementation detail — navigation and page content are what users experience. Can rename later if it nags.

#### Decision 5: Orphan Cross-Project Pages

**Chose:** Remove from nav but keep pages accessible by direct URL.

**Why:** Some cross-project views have niche value (e.g., `/website` shows all live sites at once). Deleting them adds unnecessary churn. Simply removing nav links is sufficient — power users can still reach them.

#### Decision 7: New Analytics Route

**Chose:** Create `/analytics` that initially redirects to `/testing`.

**Why:** Establishes the route for the future cross-site analytics experience while reusing the existing testing dashboard in the interim. The user specifically called out Analytics as a cross-cutting concern that belongs in the top nav.

#### Decision 9: Analysis Detail as Sub-Page

**Chose:** Move analysis content (scores, risks, SEO, full analysis) to `/analyses/[id]/analysis`.

**Why:** The dashboard's purpose is pipeline status at a glance. Mixing analysis detail (score rings, risk lists, SEO deep dive, full markdown) with pipeline summary cards creates a disjointed page. The analysis content is substantial enough to warrant its own page. The analysis detail page is visually identical to the existing live page — minimal implementation effort.

#### Decision 10: Collapsible Full Analysis

**Chose:** Full Analysis section collapsed by default with a "Show full analysis" toggle.

**Why:** The full analysis markdown can be very long. Collapsing it by default keeps the analysis detail page scannable — users see scores, risks, and SEO data without scrolling past walls of text. One click to expand when they want the full narrative.
