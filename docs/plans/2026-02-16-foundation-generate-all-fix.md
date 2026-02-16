# Fix: Dashboard "Generate All" Button Should Trigger Generation

**Status:** Open
**Created:** 2026-02-16
**Context:** Discovered during systematic debugging session. The generation pipeline works correctly; this is purely a UX trigger issue.

## Problem

The "Generate All" button on `/foundation` (the dashboard listing all ideas) is a `<Link>` that navigates to `/analyses/{id}/foundation` but does **not** start generation. The user expects clicking "Generate All" to begin generating documents, but they arrive at the detail page with nothing happening.

**Location:** `src/app/foundation/page.tsx` lines 153-158

```tsx
<Link
  href={`/analyses/${idea.ideaId}/foundation`}
  className="btn btn-primary text-xs"
>
  {hasAny ? 'Generate Missing' : 'Generate All'}
</Link>
```

## Fix

**Option A (simplest):** Add a query param to the Link, and auto-trigger generation on the detail page when the param is present.

1. In `src/app/foundation/page.tsx`, change the Link href:
   ```tsx
   href={`/analyses/${idea.ideaId}/foundation?generate=all`}
   ```

2. In `src/app/analyses/[id]/foundation/page.tsx`, read the query param and auto-trigger:
   ```tsx
   import { useSearchParams } from 'next/navigation';

   const searchParams = useSearchParams();

   useEffect(() => {
     if (searchParams.get('generate') === 'all' && !isRunning && docCount === 0) {
       handleGenerate();
       // Remove the query param so refresh doesn't re-trigger
       window.history.replaceState({}, '', window.location.pathname);
     }
   }, [data]); // after initial data load
   ```

**Option B:** Turn the Link into a button that POSTs to the API first, then navigates via `router.push()`. Requires converting the server component to a client component or extracting the card into a client component.

## Notes

- The detail page's own "Generate All" button (`src/app/analyses/[id]/foundation/page.tsx` line 283) works correctly and triggers generation via POST.
- The generation pipeline is verified working -- all 6 doc types generate successfully.
- The progress deadlock bug that could cause stuck "running" state was fixed in commit `4848102`.
