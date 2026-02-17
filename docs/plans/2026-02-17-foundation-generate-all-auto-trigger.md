# Foundation "Generate All" Auto-Trigger Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Make the "Generate All" / "Generate Missing" button on the foundation dashboard actually trigger generation when the user arrives on the detail page.

**Source Design Doc:** `docs/plans/2026-02-16-foundation-generate-all-fix.md`

**Architecture:** The dashboard (server component) adds a `?autoGenerate=true` query param to its navigation Link. The detail page (client component) reads that param on mount via `useSearchParams`, triggers `handleGenerate()` once data loads, and cleans the URL. A ref prevents double-triggering during polling cycles. The detail page uses a Suspense-wrapped inner component pattern (matching the existing `useSearchParams` usage in `src/app/content/[id]/generate/page.tsx`).

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest + @testing-library/react

**Spec drift notes:** The design doc (`2026-02-16-foundation-generate-all-fix.md`) references a stale route path `src/app/analyses/[id]/foundation/page.tsx` — that route was moved to `src/app/foundation/[id]/page.tsx`. The design also uses `?generate=all` as the param name; this plan uses `?autoGenerate=true` for clarity (both dashboard and detail page use the new name). The design's `docCount === 0` guard is intentionally dropped because `handleGenerate()` without arguments already generates only missing docs, making the guard redundant.

---

### Task 1: Add query param to dashboard Link

**Files:**
- Modify: `src/app/foundation/page.tsx:153-158`

**Step 1: Edit the Link href**

Change the "Generate All" / "Generate Missing" Link to include `?autoGenerate=true`:

```tsx
// Before (line 153-158):
<Link
  href={`/foundation/${idea.ideaId}`}
  className="btn btn-primary text-xs"
>
  {hasAny ? 'Generate Missing' : 'Generate All'}
</Link>

// After:
<Link
  href={`/foundation/${idea.ideaId}?autoGenerate=true`}
  className="btn btn-primary text-xs"
>
  {hasAny ? 'Generate Missing' : 'Generate All'}
</Link>
```

This is a server component — no imports needed.

**Step 2: Commit**

```bash
git add src/app/foundation/page.tsx
git commit -m "feat: add autoGenerate query param to foundation dashboard link"
```

---

### Task 2: Refactor detail page with Suspense boundary and add auto-generate effect

The codebase's existing `useSearchParams` usage (`src/app/content/[id]/generate/page.tsx`) uses an inner component wrapped in `<Suspense>`. This task follows that pattern.

**Files:**
- Modify: `src/app/foundation/[id]/page.tsx:3` (imports)
- Modify: `src/app/foundation/[id]/page.tsx:71-284` (extract inner component, wrap in Suspense)

**Step 1: Update imports**

On line 3 (the React import — note: line 1 is `'use client'`, line 2 is blank), add `useRef` and `Suspense`. Add `useSearchParams` from `next/navigation`:

```tsx
// Before (line 3):
import { useEffect, useState, useCallback, use, type CSSProperties } from 'react';

// After (line 3):
import { useEffect, useState, useCallback, useRef, use, Suspense, type CSSProperties } from 'react';
```

Add after line 4 (`import Link from 'next/link';`):

```tsx
import { useSearchParams } from 'next/navigation';
```

**Step 2: Extract inner component and add Suspense wrapper**

Rename the existing `FoundationPage` function to `FoundationPageInner` and create a new `FoundationPage` wrapper:

```tsx
// The existing function signature (line 71) changes from:
export default function FoundationPage({ params }: PageProps) {

// To:
function FoundationPageInner({ params }: PageProps) {
```

Then add `useSearchParams` and the ref at the top of `FoundationPageInner`, after line 72 (`const { id: ideaId } = use(params);`):

```tsx
const searchParams = useSearchParams();
const autoGenerateConsumed = useRef(false);
```

**Step 3: Add auto-generate effect**

After the polling `useEffect` (after the `}, [data, fetchData]);` on line 97), add:

```tsx
// Auto-trigger generation when arriving from dashboard with ?autoGenerate=true
useEffect(() => {
  if (
    searchParams.get('autoGenerate') === 'true' &&
    data &&
    data.progress.status !== 'running' &&
    !generating &&
    !autoGenerateConsumed.current
  ) {
    autoGenerateConsumed.current = true;
    handleGenerate();
    // Clean URL so refresh doesn't re-trigger
    window.history.replaceState({}, '', window.location.pathname);
  }
}, [data]); // eslint-disable-line react-hooks/exhaustive-deps
```

**Why this works:**
- `data` dependency: effect runs when initial fetch completes (and on subsequent polls, but the ref guard prevents re-triggering)
- `autoGenerateConsumed` ref: prevents double-trigger when polling updates `data`
- `data.progress.status !== 'running'`: doesn't re-trigger if generation is already in progress (e.g., started from another tab)
- `!generating`: doesn't trigger if a local generation call is already in flight
- No `docCount === 0` guard: intentionally dropped from the design doc's spec because `handleGenerate()` without arguments generates only missing docs — the guard is redundant
- `window.history.replaceState`: cleans the URL so manual refresh doesn't re-trigger. Uses `replaceState` instead of `router.replace` because this is a one-shot URL cleanup that should not trigger a Next.js navigation cycle or data refetch.
- `eslint-disable-line`: `handleGenerate`, `searchParams`, and `generating` are intentionally excluded — we only want this to fire when data loads, not on every render cycle

**Step 4: Add the Suspense-wrapped export**

At the end of the file (after the closing `}` of `FoundationPageInner`), add the new default export:

```tsx
export default function FoundationPage({ params }: PageProps) {
  return (
    <Suspense>
      <FoundationPageInner params={params} />
    </Suspense>
  );
}
```

Remove the `export default` from `FoundationPageInner` (it should just be `function FoundationPageInner`).

**Step 5: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds with no type errors related to the changes.

**Step 6: Commit**

```bash
git add src/app/foundation/[id]/page.tsx
git commit -m "feat: auto-trigger generation when arriving from dashboard"
```

---

### Task 3: Write tests for auto-generate behavior

**Files:**
- Create: `src/app/foundation/[id]/__tests__/page.test.tsx`

**Step 1: Write the test file**

```tsx
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock the sub-components to avoid their complexity
vi.mock('../CollapsedDocCard', () => ({
  default: () => <div data-testid="collapsed-card" />,
}));

vi.mock('../ExpandedDocCard', () => ({
  default: () => <div data-testid="expanded-card" />,
}));

// Spy on window.history.replaceState
const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

let fetchMock: Mock;

beforeEach(() => {
  vi.clearAllMocks();
  // Reset search params
  mockSearchParams.delete('autoGenerate');

  // Default fetch mock: GET returns not_started, POST succeeds
  fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (opts?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ message: 'Started' }),
      });
    }
    // GET
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        progress: { status: 'not_started' },
        docs: {},
      }),
    });
  });
  global.fetch = fetchMock;
});

// Helper: import the page component (must be after mocks)
async function renderPage() {
  const { default: FoundationPage } = await import('../page');
  const { container } = render(
    <FoundationPage params={Promise.resolve({ id: 'idea-123' })} />
  );
  return container;
}

describe('Foundation detail page auto-generate', () => {
  it('triggers generation when autoGenerate=true and no docs exist', async () => {
    mockSearchParams.set('autoGenerate', 'true');

    const container = await renderPage();

    // Smoke check: component rendered
    expect(container.innerHTML).not.toBe('');

    await waitFor(() => {
      // Should have called GET (initial fetch) then POST (auto-generate)
      const postCalls = fetchMock.mock.calls.filter(
        ([, opts]: [string, RequestInit?]) => opts?.method === 'POST'
      );
      expect(postCalls).toHaveLength(1);
      expect(postCalls[0][0]).toBe('/api/foundation/idea-123');
    });

    // Should clean the URL
    expect(replaceStateSpy).toHaveBeenCalledWith({}, '', window.location.pathname);
  });

  it('does NOT trigger generation without autoGenerate param', async () => {
    const container = await renderPage();

    // Smoke check
    expect(container.innerHTML).not.toBe('');

    // Wait for initial GET to complete
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // Should NOT have made a POST call
    const postCalls = fetchMock.mock.calls.filter(
      ([, opts]: [string, RequestInit?]) => opts?.method === 'POST'
    );
    expect(postCalls).toHaveLength(0);
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it('does NOT trigger generation when already running', async () => {
    mockSearchParams.set('autoGenerate', 'true');

    // Return running status from GET
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'Started' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          progress: {
            status: 'running',
            currentStep: 'Generating strategy...',
            docs: { strategy: 'running' },
          },
          docs: {},
        }),
      });
    });

    await renderPage();

    // Wait for initial GET
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // Give effects time to fire
    await new Promise((r) => setTimeout(r, 50));

    // Should NOT have made a POST call
    const postCalls = fetchMock.mock.calls.filter(
      ([, opts]: [string, RequestInit?]) => opts?.method === 'POST'
    );
    expect(postCalls).toHaveLength(0);
  });

  it('handles POST failure gracefully during auto-generate', async () => {
    mockSearchParams.set('autoGenerate', 'true');

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Already running' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          progress: { status: 'not_started' },
          docs: {},
        }),
      });
    });

    // Should not throw — error is caught by handleGenerate's try/catch
    await renderPage();

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        ([, opts]: [string, RequestInit?]) => opts?.method === 'POST'
      );
      expect(postCalls).toHaveLength(1);
    });

    // URL should still be cleaned (replaceState fires before async POST resolves)
    expect(replaceStateSpy).toHaveBeenCalled();
  });

  it('handles fetch network error gracefully during auto-generate', async () => {
    mockSearchParams.set('autoGenerate', 'true');

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          progress: { status: 'not_started' },
          docs: {},
        }),
      });
    });

    // Should not throw
    await renderPage();

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        ([, opts]: [string, RequestInit?]) => opts?.method === 'POST'
      );
      expect(postCalls).toHaveLength(1);
    });
  });
});
```

**Step 2: Run the tests**

Run: `npx vitest run src/app/foundation/[id]/__tests__/page.test.tsx`
Expected: All 5 tests pass.

**Step 3: Run the full test suite**

Run: `npm test`
Expected: All tests pass, no regressions.

**Step 4: Commit**

```bash
git add src/app/foundation/[id]/__tests__/page.test.tsx
git commit -m "test: add auto-generate behavior tests for foundation detail page"
```

---

### Task 4: Final verification

**Step 1: Run lint**

Run: `npm run lint`
Expected: No lint errors.

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass.

**Step 4: Commit any lint/build fixes if needed**

---

## Manual Steps (Post-Automation)

1. Start local dev server (`npm run dev`)
2. Navigate to `/foundation`
3. Click "Generate All" on an idea card with no docs — verify it navigates to the detail page AND generation starts automatically
4. Click "Generate Missing" on an idea card with some docs — verify same auto-trigger behavior
5. Refresh the detail page — verify generation does NOT re-trigger (URL param was cleaned)
6. Navigate directly to `/foundation/{id}` (no query param) — verify the page loads normally with no auto-trigger

---

## Decision Log

### Summary
| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Auto-trigger mechanism | `useSearchParams` + `useRef` guard | `window.location.search`, state variable |
| 2 | URL cleanup method | `window.history.replaceState` | `router.replace`, leave param in URL |
| 3 | Double-trigger prevention | `useRef` (consumed flag) | `useState`, remove from dep array |
| 4 | Query param name | `autoGenerate=true` | `generate=all` (design doc) |
| 5 | Suspense boundary pattern | Inner component + `<Suspense>` wrapper | Direct `useSearchParams` in page export |

### Appendix: Decision Details

#### Decision 1: Auto-trigger mechanism
**Chose:** `useSearchParams()` from `next/navigation` with a `useRef` to track consumption.
**Why:** `useSearchParams` is the idiomatic Next.js way to read query params in client components. It integrates with the App Router's navigation system. The page is already a client component (`'use client'`), so there's no SSR penalty from using this hook.
**Alternatives rejected:**
- `window.location.search`: Works but bypasses Next.js's navigation system. Could cause issues if Next.js ever needs to know about the search params for prefetching or caching.
- State variable (`useState`): Causes an extra re-render when setting state to `false` after consuming the param. The ref approach is zero-cost.

#### Decision 2: URL cleanup method
**Chose:** `window.history.replaceState({}, '', window.location.pathname)`
**Why:** Silently removes the query param without triggering a navigation or re-render. This is exactly what we want — the param is a one-shot signal, not part of the page state. Note: the codebase does use `router.replace` in `src/app/foundation/[id]/edit/[docType]/page.tsx:51` for URL cleanup, but that context involves page-level navigation state, not a one-shot param. `replaceState` is a better fit here since we don't want to trigger the App Router's data refetching.
**Alternatives rejected:**
- `router.replace(pathname)`: Triggers a Next.js soft navigation. While it wouldn't necessarily cause a visible flash, it enters the App Router's navigation cycle unnecessarily for a simple URL cleanup.
- Leave param in URL: Refresh would re-trigger generation, which is confusing and could cause issues if generation is already running.

#### Decision 3: Double-trigger prevention
**Chose:** `useRef(false)` that gets set to `true` after first trigger.
**Why:** The `useEffect` depends on `data`, which changes every 3 seconds during polling. Without a guard, auto-generate would fire on every poll cycle (though the API has stale detection, hitting it repeatedly is wasteful). The ref is the lightest-weight guard — no re-renders, no state management.
**Alternatives rejected:**
- `useState`: Would cause an unnecessary re-render cycle just to flip a boolean.
- Removing `data` from deps: Can't — we need `data` loaded before we can check `data.progress.status !== 'running'`. The initial render has `data === null`.

#### Decision 4: Query param name
**Chose:** `autoGenerate=true` instead of the design doc's `generate=all`.
**Why:** `autoGenerate=true` is a clearer signal of intent — the param triggers automatic generation behavior, not a specific generation mode. The `handleGenerate()` function called without arguments already determines what to generate (all docs or just missing ones) based on existing state.
**Alternatives rejected:**
- `generate=all` (design doc): Implies a specific mode ("all") which doesn't match the behavior when some docs exist — the same button reads "Generate Missing" but the param would say "all". `autoGenerate=true` is mode-agnostic.

#### Decision 5: Suspense boundary pattern
**Chose:** Extract page body into `FoundationPageInner`, wrap in `<Suspense>` in the exported `FoundationPage`.
**Why:** `useSearchParams()` in Next.js App Router requires a Suspense boundary to avoid de-opting the entire page to client-side rendering during static analysis. The codebase already uses this exact pattern in `src/app/content/[id]/generate/page.tsx` (inner component `ContentGeneratePageInner` + `Suspense` wrapper). Following the established pattern.
**Alternatives rejected:**
- Direct `useSearchParams` in page export: Would cause a Next.js build warning or error about missing Suspense boundary. Inconsistent with existing codebase pattern.
