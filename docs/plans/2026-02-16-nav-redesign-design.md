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

**Route:** `/analyses/[id]` (modifies the existing analysis detail page)

**Mockup:** `docs/mockups/nav-redesign/project-dashboard.html`

The current analysis detail page shows: score visualizations (6 rings), recommendation tier, risks, SEO deep dive, full analysis markdown, and action buttons. The project dashboard keeps all of this and adds a **pipeline summary section** at the top.

### Layout

A compact card grid (3-4 columns on desktop, depending on whether analytics data exists) is inserted between the page header and the existing scores section. The header's back link changes from "Back" (linking to `/analysis`) to "Back to Projects" (linking to `/`).

### Pipeline Summary Cards

Three to four summary cards in a responsive grid (3-4 columns on desktop, 2 columns on tablet, stacking on mobile):

**Foundation Card:**
- Title: "Foundation Documents"
- Progress: dot indicators showing completion + "X/6 complete" text
- Links to: `/analyses/[id]/foundation`
- Shows "Not started" if no docs exist

**Website Card:**
- Title: "Painted Door Site"
- Status badge: Live (green), Deploying (amber), Generating (amber), Pushing (amber), Failed (red), Not Started (muted)
- Detail: signup count if live, domain name if deployed
- Links to: `/analyses/[id]/painted-door`

**Content Card:**
- Title: "Content Pipeline"
- Detail: "X complete, Y pending" piece counts (`complete` = generated content; pending = not yet generated)
- Active/Paused indicator if calendar exists
- Links to: `/analyses/[id]/content`
- Shows "Not started" if no calendar exists

**Analytics Card (conditional):**
Only rendered when GSC data is connected for this project:
- Title: "Performance"
- Detail: last 7 days impressions/clicks snapshot
- Links to: `/analyses/[id]/analytics`

### Existing Content Preserved

Everything currently on the analysis detail page stays below the summary cards:

- Score ring visualizations (6 dimensions)
- Recommendation tier and confidence
- Risks section
- SEO Deep Dive (keywords, SERP analysis)
- Full analysis markdown (collapsible)
- Action buttons (Create Website, Foundation Docs, Reanalyze, Delete)

The existing action buttons remain — they provide contextual actions that complement the summary cards.

---

## Routing Changes

### Modified Routes

| Route | Current Purpose | New Purpose |
|-------|----------------|-------------|
| `/` | Pipeline stage view (6 stage cards) | Project list |
| `/analyses/[id]` | Analysis detail (scores, risks, markdown) | Project dashboard (summary cards + analysis detail) |

### Unchanged Routes

| Route | Purpose | Accessed From |
|-------|---------|---------------|
| `/analyses/[id]/foundation` | Foundation docs panel | Dashboard Foundation card |
| `/analyses/[id]/content` | Content calendar | Dashboard Content card |
| `/analyses/[id]/content/[pieceId]` | Content piece detail | Content calendar |
| `/analyses/[id]/content/generate` | Content generation wizard | Content calendar |
| `/analyses/[id]/painted-door` | Website builder | Dashboard Website card |
| `/analyses/[id]/analytics` | SEO performance | Dashboard Analytics card |
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

### New Route

| Route | Purpose |
|-------|---------|
| `/analytics` | Cross-site analytics. Initially redirects to `/testing`. |

---

## Interaction with Content Pipeline Work

### Phase 1 Gaps Plan (In-Progress Worktree)

**Tasks 1-5 (backend):** Completely unaffected. These modify `db.ts`, `foundation-agent.ts`, and API routes — none of which are touched by this redesign.

**Tasks 6-8 (foundation panel UI rewrite):** Unaffected. The foundation panel at `/analyses/[id]/foundation/page.tsx` stays at its current route. The only change: it's now accessed from the project dashboard summary card instead of a top-level nav tab. The panel's back link ("Back to Analysis") should update to say "Back to Project" — a one-line text change.

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

### Must Modify

| File | Change |
|------|--------|
| `src/app/page.tsx` | Complete rewrite — pipeline view to project list |
| `src/app/analyses/[id]/page.tsx` | Add pipeline summary cards section above existing content |
| `src/components/NavLinks.tsx` | Replace 7 tabs with 3 (Projects, Ideation, Analytics) |
| `src/components/MobileNav.tsx` | Replace 7 tabs with 3 |

### Must Modify (Already Exists)

| File | Change |
|------|--------|
| `src/app/analytics/page.tsx` | Already exists with redirect to `/testing`. Update if analytics page evolves beyond redirect. |

### Must Delete

| File | Reason |
|------|--------|
| `docs/mockups/foundation-tab-promotion/desktop-nav.html` | Superseded by project-centric nav |
| `docs/mockups/foundation-tab-promotion/mobile-nav.html` | Superseded by project-centric nav |
| `docs/mockups/foundation-tab-promotion/foundation-page.html` | Superseded by project-centric nav |

### Unchanged

All API routes, all `/analyses/[id]/foundation`, `/analyses/[id]/content`, `/analyses/[id]/painted-door`, `/analyses/[id]/analytics` pages, all backend code, all existing tests.

---

## Testing Strategy

### Unit Tests

**`src/app/__tests__/page.test.tsx` (new or rewrite):**
- Renders project cards for each analysis
- Shows pipeline progress indicators (foundation doc count, website status, content counts)
- Cards link to `/analyses/[id]`
- Empty state renders when no analyses exist
- Error state renders on fetch failure

**`src/app/analyses/[id]/__tests__/page.test.tsx` (new):**
- Summary cards section renders with correct data
- Foundation card shows correct doc count and links to foundation page
- Website card shows correct status and signup count
- Content card shows correct piece counts
- Cards not rendered when no data exists for that section
- Existing analysis detail tests remain unchanged

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

### Dashboard Summary Cards — Server Component

The analysis detail page (`/analyses/[id]/page.tsx`) is already a server component that fetches `paintedDoorSite`, `contentCalendar`, `contentPieceCount`, and `hasGSCLink` in its `getAnalysisData()` function. Foundation doc count is the only new data source to add. The summary cards render from data already being fetched — minimal additional Redis calls.

---

## Decision Log

### Summary

| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Primary navigation model | Project-centric (3 tabs) | Stage-centric (7 tabs, current), hybrid |
| 2 | Home page content | Project list with pipeline progress | Pipeline stages (current), leaderboard |
| 3 | Project dashboard layout | Summary cards + existing analysis detail | Full inline sections, tabbed sections |
| 4 | URL structure | Keep `/analyses/[id]` | Rename to `/projects/[id]` |
| 5 | Cross-project listing pages | Orphan from nav, keep accessible by URL | Delete, move under `/admin/` |
| 6 | Foundation-tab-promotion mockups | Delete | Keep for reference |
| 7 | Analytics route | New `/analytics`, initially redirect to `/testing` | Reuse `/testing` route |
| 8 | Content pipeline interaction | No changes to in-progress work | Refactor routes to `/projects/*` |

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

#### Decision 3: Summary Cards + Existing Detail

**Chose:** Compact summary cards at the top of the existing analysis detail page, linking to detail pages.

**Why:** Keeps the dashboard scannable (summary cards add ~200px of height) while preserving all existing analysis detail below. Avoids a miles-long page (rejected full inline sections) and avoids hiding content behind tabs (rejected tabbed sections). The detail pages (foundation, content, website, analytics) already exist with their own interaction patterns.

**Alternatives rejected:**
- Full inline sections: Every section expanded on one page. Miles-long page, unusable.
- Tabbed sections: Hides content behind clicks, doesn't give at-a-glance overview, adds UI complexity.

#### Decision 4: Keep Existing URLs

**Chose:** Keep `/analyses/[id]` as the project URL.

**Why:** Changing to `/projects/[id]` would require updating every route, every link, and the in-progress content pipeline worktree. The URL is an implementation detail — navigation and page content are what users experience. Can rename later if it nags.

#### Decision 5: Orphan Cross-Project Pages

**Chose:** Remove from nav but keep pages accessible by direct URL.

**Why:** Some cross-project views have niche value (e.g., `/website` shows all live sites at once). Deleting them adds unnecessary churn. Simply removing nav links is sufficient — power users can still reach them.

#### Decision 7: New Analytics Route

**Chose:** Create `/analytics` that initially redirects to `/testing`.

**Why:** Establishes the route for the future cross-site analytics experience while reusing the existing testing dashboard in the interim. The user specifically called out Analytics as a cross-cutting concern that belongs in the top nav.
