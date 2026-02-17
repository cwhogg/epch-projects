# Website & Content Route Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Move painted-door and content routes out of `/analyses/[id]/...` to top-level `/website/[id]` and `/content/[id]`, and add a "Regenerate Site" button to the deployed-site UI.

**Source Design Doc:** N/A (plan derived from brainstorming session)

**Architecture:** Follows the precedent set by the foundation route move (`/analyses/[id]/foundation` → `/foundation/[id]`). Three route groups move: painted-door (1 page), content (3 pages). Old URLs get permanent redirects in `next.config.ts`. Nav-utils gains two new `startsWith` patterns.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4

---

### Task 1: Update nav-utils tests and implementation

**Files:**
- Modify: `src/lib/__tests__/nav-utils.test.ts`
- Modify: `src/lib/nav-utils.ts`

**Step 1: Update nav-utils tests for new routes**

In `src/lib/__tests__/nav-utils.test.ts`, make the following changes:

1. Replace the `/analyses/abc/content` test case (line 29) with `/content/abc`:

```typescript
    it('activates on /content/abc (content detail)', () => {
      expect(isActive('/content/abc', '/')).toBe(true);
    });
```

2. Replace the `/analyses/abc/painted-door` test case (line 33) with `/website/abc`:

```typescript
    it('activates on /website/abc (website detail)', () => {
      expect(isActive('/website/abc', '/')).toBe(true);
    });
```

3. In the `testPaths` array (lines 82-94), replace `/analyses/abc/content` with `/content/abc` and `/analyses/abc/painted-door` with `/website/abc`.

4. In the `orphanedPaths` array (lines 108-115), remove `/website` and `/content` (they're no longer orphaned — subpaths like `/website/abc` now activate the Projects tab). Keep the bare paths as orphaned ONLY if the nav-utils doesn't match them — but since `/website/abc` matches `startsWith('/website/')`, the bare `/website` (no trailing slash) won't match. Verify this works correctly.

Actually, looking more carefully: `/website` (the index page) should NOT activate the Projects tab — it has its own content. The `startsWith('/website/')` pattern (with trailing slash) won't match `/website` (no trailing slash). So `/website` and `/content` should stay in the orphaned list. Good.

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/__tests__/nav-utils.test.ts`
Expected: 2 failures for the new `/content/abc` and `/website/abc` test cases (nav-utils doesn't match them yet)

**Step 3: Update nav-utils implementation**

In `src/lib/nav-utils.ts`, update line 5 to add the new patterns:

Replace:
```typescript
      return pathname === '/' || pathname.startsWith('/analyses/') || /^\/foundation\/[^/]+/.test(pathname);
```

With:
```typescript
      return pathname === '/' || pathname.startsWith('/analyses/') || /^\/foundation\/[^/]+/.test(pathname) || pathname.startsWith('/website/') || pathname.startsWith('/content/');
```

Note: `/content/` with trailing slash won't match the bare `/content` index page (which is intentional — that page is a cross-idea dashboard, not a project sub-page). However, `/content/abc` and `/content/abc/generate` will match.

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/__tests__/nav-utils.test.ts`
Expected: All tests pass

**Step 5: Commit**

```
git add src/lib/nav-utils.ts src/lib/__tests__/nav-utils.test.ts
git commit -m "feat: add /website/ and /content/ to nav-utils Projects tab"
```

---

### Task 2: Create /website/[id] page with regenerate button

**Files:**
- Create: `src/app/website/[id]/page.tsx`

**Step 1: Create the website/[id] directory and page**

Copy `src/app/analyses/[id]/painted-door/page.tsx` to `src/app/website/[id]/page.tsx`.

Then apply these changes to the new file:

1. **Update the "Create Content" link** (line 200) — change the href from `/analyses/${analysisId}/content` to `/content/${analysisId}`:

Replace:
```typescript
              <Link
                href={`/analyses/${analysisId}/content`}
```

With:
```typescript
              <Link
                href={`/content/${analysisId}`}
```

2. **Add a "Regenerate Site" button** between the "See Site" link and the "Create Content" link in the complete state action buttons (after line 198, before the Create Content Link). Insert this button:

```tsx
              <button
                onClick={async () => { await resetProgress(); triggerGeneration(); }}
                className="btn btn-ghost text-sm"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Regenerate Site
              </button>
```

The "Back to Analysis" link (line 162, href `/analyses/${analysisId}`) stays unchanged — it correctly points to the project dashboard.

**Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/app/website/\\[id\\]/page.tsx 2>&1 | head -20` (or just run a quick build check)

Actually, since this is a Next.js app, a simpler check is:

Run: `npm run lint`
Expected: No errors related to the new file

**Step 3: Commit**

```
git add src/app/website/[id]/page.tsx
git commit -m "feat: add /website/[id] route with regenerate button"
```

---

### Task 3: Create /content/[id] pages

**Files:**
- Create: `src/app/content/[id]/page.tsx`
- Create: `src/app/content/[id]/[pieceId]/page.tsx`
- Create: `src/app/content/[id]/generate/page.tsx`

**Step 1: Create /content/[id]/page.tsx**

Copy `src/app/analyses/[id]/content/page.tsx` to `src/app/content/[id]/page.tsx`.

No internal link changes needed — the "Back to Analysis" links (lines 59 and 125) correctly point to `/analyses/${analysisId}` (the project dashboard).

**Step 2: Create /content/[id]/[pieceId]/page.tsx**

Copy `src/app/analyses/[id]/content/[pieceId]/page.tsx` to `src/app/content/[id]/[pieceId]/page.tsx`.

Update internal links in the new file:

1. Line 96 — "Back to Content Options" link in error state:

Replace:
```typescript
          <Link href={`/analyses/${analysisId}/content`} className="btn btn-primary">
```

With:
```typescript
          <Link href={`/content/${analysisId}`} className="btn btn-primary">
```

2. Line 112 — "Back to Content Options" link in header:

Replace:
```typescript
          href={`/analyses/${analysisId}/content`}
```

With:
```typescript
          href={`/content/${analysisId}`}
```

**Step 3: Create /content/[id]/generate/page.tsx**

Copy `src/app/analyses/[id]/content/generate/page.tsx` to `src/app/content/[id]/generate/page.tsx`.

Update internal links in the new file:

1. Line 102 — redirect after generation completes:

Replace:
```typescript
          router.push(`/analyses/${analysisId}/content`);
```

With:
```typescript
          router.push(`/content/${analysisId}`);
```

2. Line 169 — "Back to Content Options" link in error state:

Replace:
```typescript
            <Link href={`/analyses/${analysisId}/content`} className="btn btn-primary">
```

With:
```typescript
            <Link href={`/content/${analysisId}`} className="btn btn-primary">
```

3. Line 397 — "Back to Content Options" link in footer:

Replace:
```typescript
            href={`/analyses/${analysisId}/content`}
```

With:
```typescript
            href={`/content/${analysisId}`}
```

**Step 4: Verify all files compile**

Run: `npm run lint`
Expected: No errors

**Step 5: Commit**

```
git add src/app/content/[id]/page.tsx src/app/content/[id]/[pieceId]/page.tsx src/app/content/[id]/generate/page.tsx
git commit -m "feat: add /content/[id] routes"
```

---

### Task 4: Add redirects for old URLs

**Files:**
- Modify: `next.config.ts:8-16`

**Step 1: Add redirect entries**

In `next.config.ts`, expand the `redirects()` return array. The `generate` redirect MUST come before the `:pieceId` redirect because Next.js matches in order and `:pieceId` would catch `generate` as a dynamic segment.

Replace the entire `async redirects()` block:

```typescript
  async redirects() {
    return [
      {
        source: '/analyses/:id/foundation',
        destination: '/foundation/:id',
        permanent: true,
      },
    ];
  },
```

With:

```typescript
  async redirects() {
    return [
      {
        source: '/analyses/:id/foundation',
        destination: '/foundation/:id',
        permanent: true,
      },
      {
        source: '/analyses/:id/painted-door',
        destination: '/website/:id',
        permanent: true,
      },
      {
        source: '/analyses/:id/content/generate',
        destination: '/content/:id/generate',
        permanent: true,
      },
      {
        source: '/analyses/:id/content/:pieceId',
        destination: '/content/:id/:pieceId',
        permanent: true,
      },
      {
        source: '/analyses/:id/content',
        destination: '/content/:id',
        permanent: true,
      },
    ];
  },
```

**Step 2: Commit**

```
git add next.config.ts
git commit -m "feat: add permanent redirects for old painted-door and content URLs"
```

---

### Task 5: Update all link references across the codebase

**Files:**
- Modify: `src/app/analyses/[id]/page.tsx:249,351,382`
- Modify: `src/app/website/page.tsx:68`
- Modify: `src/app/content/page.tsx:115`
- Modify: `src/components/website/SiteCardActions.tsx:89`
- Modify: `src/components/ContentCalendarCard.tsx:128,200`
- Modify: `src/hooks/useContentCalendar.ts:213`

**Step 1: Update analyses/[id]/page.tsx** (project dashboard)

Three links to update:

1. Line 249 — "Create Website" button (no-site state):

Replace:
```typescript
              <Link href={`/analyses/${id}/painted-door`} className="btn btn-ghost text-sm">
```

With:
```typescript
              <Link href={`/website/${id}`} className="btn btn-ghost text-sm">
```

2. Line 351 — Website card link:

Replace:
```typescript
        <Link href={`/analyses/${id}/painted-door`} className="card-static p-5 block transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg animate-slide-up stagger-4">
```

With:
```typescript
        <Link href={`/website/${id}`} className="card-static p-5 block transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg animate-slide-up stagger-4">
```

3. Line 382 — Content card link:

Replace:
```typescript
        <Link href={`/analyses/${id}/content`} className="card-static p-5 block transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg animate-slide-up stagger-5">
```

With:
```typescript
        <Link href={`/content/${id}`} className="card-static p-5 block transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg animate-slide-up stagger-5">
```

**Step 2: Update website/page.tsx** (website index)

Line 68 — detailsHref for painted door sites:

Replace:
```typescript
          detailsHref: `/analyses/${site.ideaId}/painted-door`,
```

With:
```typescript
          detailsHref: `/website/${site.ideaId}`,
```

**Step 3: Update content/page.tsx** (content index)

Line 115 — calendar card link:

Replace:
```typescript
                <Link href={`/analyses/${cal.ideaId}/content`} className="block flex-1">
```

With:
```typescript
                <Link href={`/content/${cal.ideaId}`} className="block flex-1">
```

**Step 4: Update SiteCardActions.tsx**

Line 89 — "Create Content" link:

Replace:
```typescript
            href={`/analyses/${ideaId}/content`}
```

With:
```typescript
            href={`/content/${ideaId}`}
```

**Step 5: Update ContentCalendarCard.tsx**

Two links to update:

1. Line 128 — checkmark link to completed piece:

Replace:
```typescript
              href={`/analyses/${analysisId}/content/${piece.id}`}
```

With:
```typescript
              href={`/content/${analysisId}/${piece.id}`}
```

2. Line 200 — title link to completed piece:

Replace:
```typescript
                href={`/analyses/${analysisId}/content/${piece.id}`}
```

With:
```typescript
                href={`/content/${analysisId}/${piece.id}`}
```

**Step 6: Update useContentCalendar.ts**

Line 213 — generation redirect:

Replace:
```typescript
    router.push(`/analyses/${analysisId}/content/generate`);
```

With:
```typescript
    router.push(`/content/${analysisId}/generate`);
```

**Step 7: Commit**

```
git add src/app/analyses/[id]/page.tsx src/app/website/page.tsx src/app/content/page.tsx src/components/website/SiteCardActions.tsx src/components/ContentCalendarCard.tsx src/hooks/useContentCalendar.ts
git commit -m "refactor: update all internal links to new /website/ and /content/ routes"
```

---

### Task 6: Delete old route directories

**Files:**
- Delete: `src/app/analyses/[id]/painted-door/page.tsx`
- Delete: `src/app/analyses/[id]/content/page.tsx`
- Delete: `src/app/analyses/[id]/content/[pieceId]/page.tsx`
- Delete: `src/app/analyses/[id]/content/generate/page.tsx`

**Step 1: Delete old files**

```bash
rm src/app/analyses/[id]/painted-door/page.tsx
rmdir src/app/analyses/[id]/painted-door
rm src/app/analyses/[id]/content/generate/page.tsx
rmdir src/app/analyses/[id]/content/generate
rm src/app/analyses/[id]/content/[pieceId]/page.tsx
rmdir src/app/analyses/[id]/content/[pieceId]
rm src/app/analyses/[id]/content/page.tsx
rmdir src/app/analyses/[id]/content
```

Verify the `/analyses/[id]/` directory still contains its other pages (`page.tsx`, `analysis/`, `analytics/`, `utils.ts`).

**Step 2: Commit**

```
git add -u src/app/analyses/[id]/painted-door/ src/app/analyses/[id]/content/
git commit -m "chore: remove old painted-door and content route files (now at /website/ and /content/)"
```

---

### Task 7: Update architecture.md

**Files:**
- Modify: `docs/architecture.md`

**Step 1: Update route references in architecture.md**

In the Module Dependency Map mermaid diagram (around lines 88-103), update:

Replace:
```
        P_CONTENT_TAB["analyses/[id]/content/page.tsx"]
        P_FOUNDATION["analyses/[id]/foundation/page.tsx"]
        P_PAINTED_DOOR["analyses/[id]/painted-door/page.tsx"]
```

With:
```
        P_CONTENT_TAB["content/[id]/page.tsx"]
        P_FOUNDATION["foundation/[id]/page.tsx"]
        P_PAINTED_DOOR["website/[id]/page.tsx"]
```

Replace:
```
        P_CONTENT_VIEW["analyses/[id]/content/[pieceId]/page.tsx"]
        P_GENERATE["analyses/[id]/content/generate/page.tsx"]
```

With:
```
        P_CONTENT_VIEW["content/[id]/[pieceId]/page.tsx"]
        P_GENERATE["content/[id]/generate/page.tsx"]
```

In the Quick Reference Pages table (around lines 663-681), update:

Replace:
```
| Content Tab | `src/app/analyses/[id]/content/page.tsx` | Content calendar and piece management |
| Generate Content | `src/app/analyses/[id]/content/generate/page.tsx` | Content generation progress view |
| View Piece | `src/app/analyses/[id]/content/[pieceId]/page.tsx` | Individual content piece view |
| Foundation Tab | `src/app/analyses/[id]/foundation/page.tsx` | Foundation document viewer/generator |
| Painted Door Tab | `src/app/analyses/[id]/painted-door/page.tsx` | Website generation status |
```

With:
```
| Content Tab | `src/app/content/[id]/page.tsx` | Content calendar and piece management |
| Generate Content | `src/app/content/[id]/generate/page.tsx` | Content generation progress view |
| View Piece | `src/app/content/[id]/[pieceId]/page.tsx` | Individual content piece view |
| Foundation Tab | `src/app/foundation/[id]/page.tsx` | Foundation document viewer/generator |
| Website Tab | `src/app/website/[id]/page.tsx` | Website generation status + regenerate |
```

In the Content Pipeline Flow mermaid diagram (around line 384), update:

Replace:
```
    START["User visits /analyses/[id]/content"] --> CALENDAR{"Calendar exists?"}
```

With:
```
    START["User visits /content/[id]"] --> CALENDAR{"Calendar exists?"}
```

In the High-Level Architecture mermaid diagram (around lines 16-17), update:

Replace:
```
        DETAIL["/analyses/[id]<br/>Analysis detail tabs"]
        CONTENT["/content<br/>Content overview"]
        WEBSITE["/website<br/>Painted door sites"]
```

With:
```
        DETAIL["/analyses/[id]<br/>Project dashboard"]
        CONTENT_OV["/content<br/>Content overview"]
        CONTENT_DETAIL["/content/[id]<br/>Content calendar"]
        WEBSITE_OV["/website<br/>Painted door sites"]
        WEBSITE_DETAIL["/website/[id]<br/>Site generation"]
```

**Step 2: Commit**

```
git add docs/architecture.md
git commit -m "docs: update architecture.md with new route paths"
```

---

### Task 8: Build and test verification

**Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass

**Step 2: Run the production build**

Run: `npm run build`
Expected: Build succeeds with exit code 0, no type errors, no broken imports

**Step 3: Run lint**

Run: `npm run lint`
Expected: No lint errors

If any step fails, fix the issue and re-run before proceeding.

---

## Decision Log

### Summary
| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Regenerate button implementation | `btn btn-ghost` calling resetProgress then triggerGeneration | Separate API endpoint, confirmation dialog |
| 2 | Redirect ordering | `generate` before `:pieceId` wildcard | Reversing order, using regex constraints |
| 3 | Nav-utils pattern | `startsWith('/website/')` with trailing slash | Regex pattern like foundation, exact path list |
| 4 | Architecture doc scope | Update route labels in all diagram sections | Only update the Quick Reference table |

### Appendix: Decision Details

#### Decision 1: Regenerate button implementation
**Chose:** A `btn btn-ghost` button that calls `await resetProgress(); triggerGeneration()` inline
**Why:** The painted-door page already has `resetProgress()` and `triggerGeneration()` functions wired up (used by the error-state retry/reset buttons). Reusing them for regeneration is the minimal change. No new API endpoint needed — DELETE + POST is the existing pattern. A confirmation dialog was considered but the reset-then-regenerate action is not destructive (the old site remains live until the new one deploys), so it adds friction without safety benefit.
**Alternatives rejected:**
- Separate API endpoint for regeneration: Over-engineering — the existing DELETE + POST combo does exactly this
- Confirmation dialog: The action isn't destructive (old site stays live during regeneration)

#### Decision 2: Redirect ordering
**Chose:** Place `/analyses/:id/content/generate` before `/analyses/:id/content/:pieceId` in the redirect array
**Why:** Next.js matches redirects in array order. The `:pieceId` parameter is a wildcard that would match the literal string `generate`, causing `/analyses/abc/content/generate` to redirect to `/content/abc/generate` via the wrong rule (`:pieceId` = `generate`). While the end result URL would be the same in this case, it's cleaner to match the specific route first. The bare `/analyses/:id/content` redirect goes last since it has no sub-path ambiguity.
**Alternatives rejected:**
- Reversing order: Would cause `generate` to be caught by `:pieceId` wildcard

#### Decision 3: Nav-utils pattern
**Chose:** Simple `startsWith('/website/')` and `startsWith('/content/')` with trailing slash
**Why:** This matches `/website/abc`, `/content/abc`, `/content/abc/generate`, etc. without matching the bare index pages `/website` and `/content`. The trailing slash is key — it prevents the content/website index pages (which are cross-idea dashboards, not project sub-pages) from activating the Projects tab. This is simpler than the regex pattern used for foundation (`/^\/foundation\/[^/]+/`), and the regex constraint isn't needed here because we want ALL sub-paths to match (including `/content/abc/generate` and `/content/abc/piece123`).
**Alternatives rejected:**
- Regex pattern like foundation: Unnecessarily restrictive — we want all sub-paths to match, not just the first level
- Exact path list: Brittle — would need updating if new sub-routes are added
