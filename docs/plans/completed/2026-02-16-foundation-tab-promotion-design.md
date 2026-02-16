# Foundation Tab Promotion

**Date:** 2026-02-16
**Status:** Approved
**Scope:** Promote Foundation Documents from a sub-page of Analysis to a first-class top-level tab.

## Problem

Foundation Documents are hidden under Analysis (`/analyses/[id]/foundation`), accessible only via a button in the analysis detail header. But foundation docs are foundational to everything downstream (website, content, testing). The current placement buries them. Meanwhile, the analysis page is a one-time operation that doesn't warrant higher prominence than the documents it produces.

## Decision

Add "Foundation" as the 7th top-level tab in the navigation. Position it between Analysis and Website to reflect the natural pipeline order:

**Ideation > Analysis > Foundation > Website > Content > Testing > Optimization**

## Changes Required

### 1. New aggregate page: `/foundation` (`src/app/foundation/page.tsx`)

Server component following the same pattern as `/content`, `/website`, and `/analysis`. Lists all analyzed ideas with their foundation document status.

**Data per idea:**
- Idea name (from analysis)
- Doc completion count (e.g., "4/6 documents")
- Per-doc status badges (complete/pending)
- Link to the existing detail page (`/analyses/[id]/foundation`)
- "Generate All" action for ideas with missing docs

**Data source:** Iterate all analyses from `getAnalysesFromDb()`, call `getAllFoundationDocs(id)` for each using `Promise.all` across analyses (matching the parallelized pattern in `/content`). Note: `getAllFoundationDocs` itself makes 6 sequential Redis calls per idea, so total calls are 6N. Acceptable for a small dataset.

### 2. NavLinks update (`src/components/NavLinks.tsx`)

Add Foundation between Analysis and Website:

```typescript
const navItems = [
  { href: '/ideation', label: 'Ideation' },
  { href: '/analysis', label: 'Analysis' },
  { href: '/foundation', label: 'Foundation' },
  { href: '/website', label: 'Website' },
  { href: '/content', label: 'Content' },
  { href: '/testing', label: 'Testing' },
  { href: '/optimization', label: 'Optimization' },
];
```

Reduce `gap-1` to `gap-0.5` to accommodate the 7th tab comfortably.

Update `isActive()`:
- Add case for `/foundation`: active when `pathname === '/foundation'` or on a foundation detail page (see Routing Logic below for precise matching)
- Update `/analysis` case: add `&& !pathname.includes('/foundation')` to the exclusion list

### 3. MobileNav update (`src/components/MobileNav.tsx`)

Add Foundation tab between Analysis and Website with a layers icon (overlapping squares — distinct from the document icon used by Content). Use label "Foundation" at the existing `text-[10px]` size.

Update the duplicated `isActive()` function with the same logic changes.

### 4. Foundation detail page breadcrumb update

The existing `/analyses/[id]/foundation/page.tsx` has a "Back to Analysis" link. No change needed - this still makes sense since you navigate there from either the analysis detail or the new aggregate page.

### 5. Analysis detail page

Keep the "Foundation Docs" button in the analysis header. It provides contextual access when you're already looking at an analysis. The top-level tab is for the aggregate view.

## Aggregate Page Layout

The `/foundation` page follows the card-list pattern from `/analysis`:

```
Foundation Documents

[Card: SecondLook]
  ████████░░░░ 4/6 documents
  [Strategy ✓] [Positioning ✓] [Brand Voice ✓] [Design Principles ✓] [SEO Strategy ○] [Social Media ○]
  [Generate Missing] [View Details →]

[Card: N of One]
  ░░░░░░░░░░░░ 0/6 documents
  [Strategy ○] [Positioning ○] [Brand Voice ○] [Design Principles ○] [SEO Strategy ○] [Social Media ○]
  [Generate All] [View Details →]

[Card: FocusFrame]
  ████████████ 6/6 documents
  [Strategy ✓] [Positioning ✓] [Brand Voice ✓] [Design Principles ✓] [SEO Strategy ✓] [Social Media ✓]
  [View Details →]
```

**Empty state:** When no analyses exist, show a message directing to the Analysis page with a "Go to Analysis" CTA (matching the empty-state pattern in `/content`).

Each card shows:
- Idea name as heading
- 4px-tall progress bar (emerald fill proportional to completion)
- Completion fraction (e.g., "4/6 documents")
- Doc-tag pills for all 6 doc types — emerald background for complete, gray for pending
- Action button: "Generate All" (0 docs), "Generate Missing" (partial), or just "View Details" (all 6 complete — no redundant "Complete" badge, the filled progress bar and 6/6 are sufficient)
- Link to `/analyses/[id]/foundation`

Use existing `.card` and `.btn` classes from the design system — do not replicate mockup inline styles.

## Routing Logic

The `isActive` function needs careful handling since foundation paths contain `/foundation` but also `/analyses/`:

```typescript
case '/foundation':
  return pathname === '/foundation' ||
    (pathname.startsWith('/analyses/') && pathname.endsWith('/foundation'));
case '/analysis':
  return (pathname === '/analysis') ||
    (pathname.startsWith('/analyses/') &&
      !pathname.includes('/content') &&
      !pathname.includes('/analytics') &&
      !pathname.includes('/painted-door') &&
      !pathname.includes('/foundation')) ||
    pathname.startsWith('/ideas/');
```

Note: Uses explicit parentheses to clarify `||`/`&&` precedence (the existing code relies on precedence by coincidence). The `/foundation` case uses precise path matching (`endsWith`) instead of `includes` to avoid false positives on hypothetical paths containing "foundation".

## Mobile Considerations

7 tabs in the bottom bar at `text-[10px]` with icons. On a 375px-wide phone, each tab gets ~53px. Existing labels ("Ideas", "Analysis", "Website", "Content", "Testing", "Optimize") all fit. "Foundation" is the longest at 10 characters but still fits at 10px font size. The icon provides the primary affordance; the label is secondary.

## Not In Scope

- Reordering or merging existing tabs
- Sidebar navigation
- Any changes to the foundation detail page UI
- New API endpoints (the aggregate page uses existing `getAnalysesFromDb` + `getAllFoundationDocs`)

## Files Changed

| File | Change |
|------|--------|
| `src/app/foundation/page.tsx` | **New** - aggregate page |
| `src/components/NavLinks.tsx` | Add tab, reduce `gap-1` to `gap-0.5`, update isActive |
| `src/components/MobileNav.tsx` | Add tab + update isActive |
| `src/lib/nav-utils.ts` | **New** - extract shared `isActive` function (eliminates duplication between NavLinks and MobileNav) |

## Testing

- `src/app/foundation/page.test.tsx` — aggregate page renders, shows correct doc counts, links work, empty state renders when no analyses exist
- `src/lib/__tests__/nav-utils.test.ts` — unit tests for the shared `isActive` function covering:
  - `/foundation` → Foundation tab active
  - `/analyses/abc/foundation` → Foundation tab active (not Analysis)
  - `/analysis` → Analysis tab active (not Foundation)
  - `/analyses/abc` → Analysis tab active
  - `/analyses/abc/content` → Content tab active (not Analysis, not Foundation)
  - No path triggers multiple tabs simultaneously
