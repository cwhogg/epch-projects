# Foundation Tab Promotion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Promote Foundation Documents from a sub-page of Analysis to a first-class 7th top-level tab in the navigation, with a new aggregate page listing all ideas and their foundation doc status.

**Source Design Doc:** `docs/plans/2026-02-16-foundation-tab-promotion-design.md`

**Architecture:** Extract duplicated `isActive` routing logic into a shared module, add Foundation to both desktop and mobile navs, and create a server component aggregate page following the existing `/content` page pattern. Data comes from existing `getAnalysesFromDb()` + `getAllFoundationDocs()` functions in `src/lib/db.ts`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Upstash Redis

---

### Task 1: Write tests for shared `isActive` function

**Files:**
- Create: `src/lib/__tests__/nav-utils.test.ts`

**Step 1: Write the test file**

Create `src/lib/__tests__/nav-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isActive } from '@/lib/nav-utils';

describe('isActive', () => {
  describe('/ideation tab', () => {
    it('matches /ideation exactly', () => {
      expect(isActive('/ideation', '/ideation')).toBe(true);
    });

    it('does not match other paths', () => {
      expect(isActive('/analysis', '/ideation')).toBe(false);
    });
  });

  describe('/analysis tab', () => {
    it('matches /analysis exactly', () => {
      expect(isActive('/analysis', '/analysis')).toBe(true);
    });

    it('matches /analyses/abc (analysis detail)', () => {
      expect(isActive('/analyses/abc', '/analysis')).toBe(true);
    });

    it('matches /ideas/abc', () => {
      expect(isActive('/ideas/abc', '/analysis')).toBe(true);
    });

    it('does not match /analyses/abc/content', () => {
      expect(isActive('/analyses/abc/content', '/analysis')).toBe(false);
    });

    it('does not match /analyses/abc/analytics', () => {
      expect(isActive('/analyses/abc/analytics', '/analysis')).toBe(false);
    });

    it('does not match /analyses/abc/painted-door', () => {
      expect(isActive('/analyses/abc/painted-door', '/analysis')).toBe(false);
    });

    it('does not match /analyses/abc/foundation', () => {
      expect(isActive('/analyses/abc/foundation', '/analysis')).toBe(false);
    });
  });

  describe('/foundation tab', () => {
    it('matches /foundation exactly', () => {
      expect(isActive('/foundation', '/foundation')).toBe(true);
    });

    it('matches /analyses/abc/foundation (foundation detail)', () => {
      expect(isActive('/analyses/abc/foundation', '/foundation')).toBe(true);
    });

    it('does not match /analysis', () => {
      expect(isActive('/analysis', '/foundation')).toBe(false);
    });

    it('does not match /analyses/abc (analysis detail)', () => {
      expect(isActive('/analyses/abc', '/foundation')).toBe(false);
    });

    it('does not match /analyses/abc/content', () => {
      expect(isActive('/analyses/abc/content', '/foundation')).toBe(false);
    });
  });

  describe('/website tab', () => {
    it('matches /website exactly', () => {
      expect(isActive('/website', '/website')).toBe(true);
    });

    it('matches paths containing /painted-door', () => {
      expect(isActive('/analyses/abc/painted-door', '/website')).toBe(true);
    });
  });

  describe('/content tab', () => {
    it('matches /content exactly', () => {
      expect(isActive('/content', '/content')).toBe(true);
    });

    it('matches paths containing /content', () => {
      expect(isActive('/analyses/abc/content', '/content')).toBe(true);
    });
  });

  describe('/testing tab', () => {
    it('matches /testing exactly', () => {
      expect(isActive('/testing', '/testing')).toBe(true);
    });

    it('matches paths containing /analytics', () => {
      expect(isActive('/analyses/abc/analytics', '/testing')).toBe(true);
    });
  });

  describe('/optimization tab', () => {
    it('matches /optimization exactly', () => {
      expect(isActive('/optimization', '/optimization')).toBe(true);
    });

    it('does not match other paths', () => {
      expect(isActive('/analysis', '/optimization')).toBe(false);
    });
  });

  describe('no dual activation', () => {
    const allTabs = ['/ideation', '/analysis', '/foundation', '/website', '/content', '/testing', '/optimization'];
    const testPaths = [
      '/foundation',
      '/analyses/abc/foundation',
      '/analysis',
      '/analyses/abc',
      '/analyses/abc/content',
      '/analyses/abc/analytics',
      '/analyses/abc/painted-door',
      '/ideation',
      '/website',
      '/content',
      '/testing',
      '/optimization',
      '/ideas/abc',
    ];

    testPaths.forEach((path) => {
      it(`only one tab active for path: ${path}`, () => {
        const activeTabs = allTabs.filter((tab) => isActive(path, tab));
        expect(activeTabs.length).toBeLessThanOrEqual(1);
      });
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/nav-utils.test.ts`
Expected: FAIL — module `@/lib/nav-utils` does not exist

**Step 3: Commit**

```
git add src/lib/__tests__/nav-utils.test.ts
git commit -m "test: add unit tests for shared isActive nav function"
```

---

### Task 2: Implement shared `isActive` function

**Files:**
- Create: `src/lib/nav-utils.ts`

**Step 1: Create the shared module**

Create `src/lib/nav-utils.ts`:

```typescript
export function isActive(pathname: string, href: string): boolean {
  switch (href) {
    case '/ideation':
      return pathname === '/ideation';
    case '/analysis':
      return (
        pathname === '/analysis' ||
        (pathname.startsWith('/analyses/') &&
          !pathname.includes('/content') &&
          !pathname.includes('/analytics') &&
          !pathname.includes('/painted-door') &&
          !pathname.includes('/foundation')) ||
        pathname.startsWith('/ideas/')
      );
    case '/foundation':
      return (
        pathname === '/foundation' ||
        (pathname.startsWith('/analyses/') && pathname.endsWith('/foundation'))
      );
    case '/website':
      return pathname === '/website' || pathname.includes('/painted-door');
    case '/content':
      return pathname === '/content' || pathname.includes('/content');
    case '/testing':
      return pathname === '/testing' || pathname.includes('/analytics');
    case '/optimization':
      return pathname === '/optimization';
    default:
      return false;
  }
}
```

Key changes from the original:
- Added `/foundation` case using `endsWith('/foundation')` for precise matching
- Added `!pathname.includes('/foundation')` to the `/analysis` case exclusion list
- Added explicit parentheses for readability in the `/analysis` case (precedence was already correct)

**Step 2: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/nav-utils.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```
git add src/lib/nav-utils.ts
git commit -m "feat: extract shared isActive nav function with foundation support"
```

---

### Task 3: Update NavLinks to use shared `isActive` and add Foundation tab

**Files:**
- Modify: `src/components/NavLinks.tsx`

**Step 1: Rewrite NavLinks.tsx**

Replace the entire contents of `src/components/NavLinks.tsx` with:

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActive } from '@/lib/nav-utils';

const navItems = [
  { href: '/ideation', label: 'Ideation' },
  { href: '/analysis', label: 'Analysis' },
  { href: '/foundation', label: 'Foundation' },
  { href: '/website', label: 'Website' },
  { href: '/content', label: 'Content' },
  { href: '/testing', label: 'Testing' },
  { href: '/optimization', label: 'Optimization' },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-0.5">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="btn-ghost rounded-lg text-sm hidden sm:flex"
          style={isActive(pathname, item.href) ? { color: 'var(--accent-coral)' } : undefined}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
```

Changes:
- Removed local `isActive` function, imported from `@/lib/nav-utils`
- Added `{ href: '/foundation', label: 'Foundation' }` between Analysis and Website
- Changed `gap-1` to `gap-0.5` to fit 7 tabs

> **Behavior change:** The `/analyses/[id]/foundation` route previously highlighted the Analysis tab. After this change, it highlights the Foundation tab instead.

**Step 2: Run existing tests and build**

Run: `npx vitest run && npm run build`
Expected: All tests pass, build succeeds

**Step 3: Commit**

```
git add src/components/NavLinks.tsx
git commit -m "feat: add Foundation tab to desktop nav"
```

---

### Task 4: Update MobileNav to use shared `isActive` and add Foundation tab

**Files:**
- Modify: `src/components/MobileNav.tsx`

**Step 1: Rewrite MobileNav.tsx**

Replace the entire contents of `src/components/MobileNav.tsx` with:

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActive } from '@/lib/nav-utils';

export default function MobileNav() {
  const pathname = usePathname();

  const tabs = [
    {
      href: '/ideation',
      label: 'Ideas',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
        </svg>
      ),
    },
    {
      href: '/analysis',
      label: 'Analysis',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
    },
    {
      href: '/foundation',
      label: 'Foundation',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      href: '/website',
      label: 'Website',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
    },
    {
      href: '/content',
      label: 'Content',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
    },
    {
      href: '/testing',
      label: 'Testing',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20V10" />
          <path d="M18 20V4" />
          <path d="M6 20v-4" />
        </svg>
      ),
    },
    {
      href: '/optimization',
      label: 'Optimize',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      ),
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 sm:hidden nav-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors"
            style={{
              color: isActive(pathname, tab.href) ? 'var(--accent-coral)' : 'var(--text-muted)',
            }}
          >
            {tab.icon}
            <span className="text-[10px] font-medium">{tab.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
```

Changes:
- Removed local `isActive` function, imported from `@/lib/nav-utils`
- Added Foundation tab between Analysis and Website with a grid/layers icon (4 squares — distinct from Content's document icon)

**Step 2: Run tests and build**

Run: `npx vitest run && npm run build`
Expected: All tests pass, build succeeds

**Step 3: Commit**

```
git add src/components/MobileNav.tsx
git commit -m "feat: add Foundation tab to mobile nav"
```

---

### Task 5: Write tests for Foundation page data helper

**Files:**
- Create: `src/lib/__tests__/foundation-page.test.ts`

The aggregate page needs a data helper that computes card view data from analyses + foundation docs. Extract this as a testable pure function.

**Step 1: Write the test file**

Create `src/lib/__tests__/foundation-page.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { Analysis, FoundationDocType, FoundationDocument } from '@/types';
import { getFoundationCardData, type FoundationCardData } from '@/lib/foundation-helpers';

const makeAnalysis = (overrides: Partial<Analysis> = {}): Analysis => ({
  id: 'test-id',
  ideaId: 'test-idea',
  ideaName: 'Test Idea',
  scores: {
    seoOpportunity: null,
    competitiveLandscape: null,
    willingnessToPay: null,
    differentiationPotential: null,
    expertiseAlignment: null,
    overall: null,
  },
  confidence: 'Medium',
  recommendation: 'Tier 2',
  summary: 'Test summary',
  risks: [],
  completedAt: '2026-01-01T00:00:00.000Z',
  hasCompetitorAnalysis: false,
  hasKeywordAnalysis: false,
  ...overrides,
});

const makeDoc = (type: FoundationDocType): FoundationDocument => ({
  id: type,
  ideaId: 'test-idea',
  type,
  content: `Test ${type} content`,
  advisorId: 'test-advisor',
  generatedAt: '2026-01-01T00:00:00.000Z',
  editedAt: null,
  version: 1,
});

describe('getFoundationCardData', () => {
  it('returns empty array when no analyses provided', () => {
    const result = getFoundationCardData([], new Map());
    expect(result).toEqual([]);
  });

  it('computes 0/6 for an idea with no foundation docs', () => {
    const analyses = [makeAnalysis({ id: 'a1', ideaId: 'idea-1', ideaName: 'Idea One' })];
    const docsMap = new Map<string, Partial<Record<FoundationDocType, FoundationDocument>>>();
    docsMap.set('idea-1', {});

    const result = getFoundationCardData(analyses, docsMap);

    expect(result).toHaveLength(1);
    expect(result[0].ideaId).toBe('idea-1');
    expect(result[0].ideaName).toBe('Idea One');
    expect(result[0].completedCount).toBe(0);
    expect(result[0].totalCount).toBe(6);
    expect(result[0].actionLabel).toBe('Generate All');
  });

  it('computes 4/6 for an idea with partial docs', () => {
    const analyses = [makeAnalysis({ id: 'a1', ideaId: 'idea-1' })];
    const docsMap = new Map<string, Partial<Record<FoundationDocType, FoundationDocument>>>();
    docsMap.set('idea-1', {
      strategy: makeDoc('strategy'),
      positioning: makeDoc('positioning'),
      'brand-voice': makeDoc('brand-voice'),
      'design-principles': makeDoc('design-principles'),
    });

    const result = getFoundationCardData(analyses, docsMap);

    expect(result[0].completedCount).toBe(4);
    expect(result[0].actionLabel).toBe('Generate Missing');
  });

  it('computes 6/6 for an idea with all docs', () => {
    const analyses = [makeAnalysis({ id: 'a1', ideaId: 'idea-1' })];
    const docsMap = new Map<string, Partial<Record<FoundationDocType, FoundationDocument>>>();
    docsMap.set('idea-1', {
      strategy: makeDoc('strategy'),
      positioning: makeDoc('positioning'),
      'brand-voice': makeDoc('brand-voice'),
      'design-principles': makeDoc('design-principles'),
      'seo-strategy': makeDoc('seo-strategy'),
      'social-media-strategy': makeDoc('social-media-strategy'),
    });

    const result = getFoundationCardData(analyses, docsMap);

    expect(result[0].completedCount).toBe(6);
    expect(result[0].actionLabel).toBeNull();
  });

  it('maps doc types in FOUNDATION_DOC_TYPES order', () => {
    const { FOUNDATION_DOC_TYPES } = require('@/types');
    const analyses = [makeAnalysis({ id: 'a1', ideaId: 'idea-1' })];
    const docsMap = new Map<string, Partial<Record<FoundationDocType, FoundationDocument>>>();

    const result = getFoundationCardData(analyses, docsMap);
    const docTypes = result[0].docs.map((d: { type: string }) => d.type);

    expect(docTypes).toEqual(FOUNDATION_DOC_TYPES);
  });

  it('includes per-doc completion status for all 6 types', () => {
    const analyses = [makeAnalysis({ id: 'a1', ideaId: 'idea-1' })];
    const docsMap = new Map<string, Partial<Record<FoundationDocType, FoundationDocument>>>();
    docsMap.set('idea-1', {
      strategy: makeDoc('strategy'),
    });

    const result = getFoundationCardData(analyses, docsMap);

    expect(result[0].docs).toHaveLength(6);
    expect(result[0].docs[0]).toEqual({ type: 'strategy', label: 'Strategy', complete: true });
    expect(result[0].docs[1]).toEqual({ type: 'positioning', label: 'Positioning', complete: false });
    expect(result[0].docs[5]).toEqual({ type: 'social-media-strategy', label: 'Social Media', complete: false });
  });

  it('handles missing docsMap entry (treats as 0 docs)', () => {
    const analyses = [makeAnalysis({ id: 'a1', ideaId: 'idea-1' })];
    const docsMap = new Map<string, Partial<Record<FoundationDocType, FoundationDocument>>>();
    // No entry for idea-1

    const result = getFoundationCardData(analyses, docsMap);

    expect(result[0].completedCount).toBe(0);
    expect(result[0].actionLabel).toBe('Generate All');
  });

  it('returns cards sorted by analysis order (most recent first)', () => {
    const analyses = [
      makeAnalysis({ id: 'a1', ideaId: 'idea-1', ideaName: 'First', completedAt: '2026-02-01T00:00:00.000Z' }),
      makeAnalysis({ id: 'a2', ideaId: 'idea-2', ideaName: 'Second', completedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const docsMap = new Map<string, Partial<Record<FoundationDocType, FoundationDocument>>>();

    const result = getFoundationCardData(analyses, docsMap);

    expect(result[0].ideaName).toBe('First');
    expect(result[1].ideaName).toBe('Second');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/foundation-page.test.ts`
Expected: FAIL — module `@/lib/foundation-helpers` does not exist

**Step 3: Commit**

```
git add src/lib/__tests__/foundation-page.test.ts
git commit -m "test: add tests for foundation page data helper"
```

---

### Task 6: Implement Foundation page data helper

**Files:**
- Create: `src/lib/foundation-helpers.ts`

**Step 1: Create the helper module**

Create `src/lib/foundation-helpers.ts`:

```typescript
import { FOUNDATION_DOC_TYPES } from '@/types';
import type { Analysis, FoundationDocType, FoundationDocument } from '@/types';

const DOC_LABELS: Record<FoundationDocType, string> = {
  'strategy': 'Strategy',
  'positioning': 'Positioning',
  'brand-voice': 'Brand Voice',
  'design-principles': 'Design Principles',
  'seo-strategy': 'SEO Strategy',
  'social-media-strategy': 'Social Media',
};

export interface FoundationCardData {
  ideaId: string;
  ideaName: string;
  analysisId: string;
  completedCount: number;
  totalCount: number;
  actionLabel: 'Generate All' | 'Generate Missing' | null;
  docs: { type: FoundationDocType; label: string; complete: boolean }[];
}

export function getFoundationCardData(
  analyses: Analysis[],
  docsMap: Map<string, Partial<Record<FoundationDocType, FoundationDocument>>>,
): FoundationCardData[] {
  return analyses.map((analysis) => {
    const foundationDocs = docsMap.get(analysis.ideaId) || {};
    const completedCount = Object.keys(foundationDocs).length;
    const totalCount = FOUNDATION_DOC_TYPES.length;

    let actionLabel: 'Generate All' | 'Generate Missing' | null = null;
    if (completedCount === 0) {
      actionLabel = 'Generate All';
    } else if (completedCount < totalCount) {
      actionLabel = 'Generate Missing';
    }

    const docs = FOUNDATION_DOC_TYPES.map((type) => ({
      type,
      label: DOC_LABELS[type],
      complete: !!foundationDocs[type],
    }));

    return {
      ideaId: analysis.ideaId,
      ideaName: analysis.ideaName,
      analysisId: analysis.id,
      completedCount,
      totalCount,
      actionLabel,
      docs,
    };
  });
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/foundation-page.test.ts`
Expected: All tests PASS

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```
git add src/lib/foundation-helpers.ts
git commit -m "feat: add foundation page data helper"
```

---

### Task 7: Create Foundation aggregate page

**Files:**
- Create: `src/app/foundation/page.tsx`

This follows the server component pattern from `src/app/content/page.tsx`.

**Step 1: Create the page**

Create `src/app/foundation/page.tsx`:

```typescript
import Link from 'next/link';
import { getAnalysesFromDb, getAllFoundationDocs } from '@/lib/db';
import { isRedisConfigured } from '@/lib/redis';
import { getFoundationCardData } from '@/lib/foundation-helpers';
import type { FoundationDocType, FoundationDocument } from '@/types';

export const dynamic = 'force-dynamic';

async function getData() {
  if (!isRedisConfigured()) {
    return { cards: [] };
  }

  const analyses = await getAnalysesFromDb();

  const docsEntries = await Promise.all(
    analyses.map(async (analysis) => {
      const docs = await getAllFoundationDocs(analysis.ideaId);
      return [analysis.ideaId, docs] as [string, Partial<Record<FoundationDocType, FoundationDocument>>];
    })
  );
  const docsMap = new Map(docsEntries);

  return { cards: getFoundationCardData(analyses, docsMap) };
}

export default async function FoundationPage() {
  const { cards } = await getData();

  return (
    <div className="space-y-8 sm:space-y-12">
      {/* Header */}
      <header className="animate-slide-up stagger-1 relative">
        <div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none hidden sm:block"
          style={{
            background: 'radial-gradient(circle, rgba(52, 211, 153, 0.12) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        <h1 className="text-2xl sm:text-3xl font-display relative" style={{ color: 'var(--text-primary)' }}>
          Foundation
        </h1>
        <p className="mt-2 text-sm sm:text-base relative" style={{ color: 'var(--text-secondary)' }}>
          Foundation documents across all analyzed ideas.
        </p>
      </header>

      {cards.length === 0 ? (
        <div className="card-static p-8 sm:p-12 text-center animate-slide-up stagger-2">
          <div
            className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(52, 211, 153, 0.12)' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <h2 className="text-xl font-display mb-2" style={{ color: 'var(--text-primary)' }}>
            No foundation documents yet
          </h2>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
            Analyze an idea first, then generate its foundation documents.
          </p>
          <Link href="/analysis" className="btn btn-primary">
            Go to Analysis
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-slide-up stagger-2">
          {cards.map((card, index) => (
            <div
              key={card.ideaId}
              className="card p-5 flex flex-col"
              style={{ animationDelay: `${0.1 + index * 0.05}s` }}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="font-display font-medium text-base" style={{ color: 'var(--text-primary)' }}>
                  {card.ideaName}
                </h3>
                <span className="text-xs shrink-0 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {card.completedCount}/{card.totalCount} documents
                </span>
              </div>

              {/* Progress bar */}
              <div
                className="w-full rounded-full mb-3"
                style={{ height: '4px', background: 'var(--bg-elevated)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(card.completedCount / card.totalCount) * 100}%`,
                    background: 'var(--accent-emerald)',
                  }}
                />
              </div>

              {/* Doc type pills */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {card.docs.map((doc) => (
                  <span
                    key={doc.type}
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={
                      doc.complete
                        ? { background: 'rgba(52, 211, 153, 0.15)', color: 'var(--accent-emerald)' }
                        : { background: 'var(--bg-elevated)', color: 'var(--text-muted)' }
                    }
                  >
                    {doc.label}
                  </span>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 mt-auto pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                {card.actionLabel && (
                  <Link
                    href={`/analyses/${card.analysisId}/foundation`}
                    className="btn btn-primary text-xs"
                    style={{ padding: '0.5rem 0.75rem' }}
                  >
                    {card.actionLabel}
                  </Link>
                )}
                <Link
                  href={`/analyses/${card.analysisId}/foundation`}
                  className="text-xs font-medium ml-auto"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  View Details →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Run full test suite and build**

Run: `npx vitest run && npm run build`
Expected: All tests pass, build succeeds with no errors

**Step 3: Commit**

```
git add src/app/foundation/page.tsx
git commit -m "feat: add foundation aggregate page"
```

---

### Task 8: Final verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Run production build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 3: Run lint**

Run: `npm run lint`
Expected: No lint errors

**Step 4: Verify dev server**

Run: `npm run dev` and visit `/foundation` — verify the page loads. If there are no analyses, verify the empty state renders. If there are analyses, verify cards show with correct doc counts.

---

## Decision Log

### Summary
| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | "Generate Missing" button behavior | Link to detail page | Client component with direct API call |
| 2 | Icon for Foundation mobile tab | Grid/layers (4 squares) | Stacked layers, building blocks |
| 3 | Page test approach | Test data helper as pure function | React Testing Library component tests, no tests |
| 4 | Progress bar emerald accent | `var(--accent-emerald)` design token | Hardcoded hex color, coral accent |
| 5 | Doc pill labels | Shortened labels in helper module | Reuse DOC_CONFIG from detail page |

### Appendix: Decision Details

#### Decision 1: "Generate Missing" button behavior
**Chose:** Link to detail page (`/analyses/${id}/foundation`)
**Why:** The existing foundation detail page already has the generation UI with polling, progress indicators, and error handling. Making the aggregate page button a link avoids duplicating that client-side logic. The aggregate page stays a pure server component, consistent with the `/content` page pattern. The user clicks "Generate Missing", lands on the detail page, and clicks the existing Generate button there. This is marginally more clicks but vastly less code and zero risk of inconsistent generation UX.
**Alternatives rejected:**
- Client component with direct API call: Would require a client component wrapper, POST to `/api/foundation/${ideaId}`, then `router.push()` to the detail page. Adds ~40 lines of client code and a new component for marginal UX benefit. The detail page already handles generation state, so redirecting there is the natural flow.

#### Decision 2: Icon for Foundation mobile tab
**Chose:** Grid/layers icon (4 rounded squares in a 2x2 grid)
**Why:** The design doc specifies "a layers icon (overlapping squares — distinct from the document icon used by Content)." The 4-square grid pattern conveys "collection of foundational elements" while being visually distinct from Content's document icon, Analysis's magnifying glass, and Website's globe. It's a standard icon pattern recognizable at 20x20px.
**Alternatives rejected:**
- Stacked layers: Could be confused with a "stack" or "database" icon. Less recognizable at small sizes.
- Building blocks: Too abstract, doesn't convey documents/foundation clearly.

#### Decision 3: Page test approach
**Chose:** Test the data helper `getFoundationCardData` as a pure function in `src/lib/__tests__/foundation-page.test.ts`
**Why:** The codebase has no component test infrastructure — no `@testing-library/react`, no `jsdom`, no component tests anywhere. Adding React Testing Library + jsdom + component test infrastructure for a single page would be over-engineering. The high-value logic (computing doc counts, choosing action labels, mapping doc completion status) is in the data helper, which is a pure function that's easy to test thoroughly. The page component itself is thin server-component rendering with no conditional logic beyond what the helper provides.
**Alternatives rejected:**
- React Testing Library: Would require adding `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` to dev dependencies, configuring vitest with jsdom environment, and building component test patterns. This is a legitimate investment but belongs in a separate infrastructure task, not a feature PR.
- No tests: The design doc specifies tests, and the `isActive` function + data helper both have meaningful logic worth testing. Skipping tests would leave the routing logic unverified.

#### Decision 4: Progress bar emerald accent
**Chose:** `var(--accent-emerald)` CSS variable from the existing design system
**Why:** The design doc specifies "emerald fill proportional to completion." The codebase already defines `--accent-emerald` in the design system and uses it for success/completion indicators throughout (content page "ready" badges, analysis "active" badges). Using the design token ensures the color stays consistent with the rest of the app if the palette changes.
**Alternatives rejected:**
- Hardcoded hex: Brittle, wouldn't update with theme changes.
- Coral accent: Reserved for active navigation state and primary actions.

#### Decision 5: Doc pill labels
**Chose:** Shortened labels defined in `foundation-helpers.ts` (e.g., "Positioning" instead of "Positioning Statement", "Social Media" instead of "Social Media Strategy")
**Why:** The aggregate page cards need to display 6 pills in a constrained width. The full labels from the detail page's `DOC_CONFIG` ("Positioning Statement", "Social Media Strategy") are too long for pill badges at `text-xs`. The shortened labels match the mockup in the design doc and still communicate which document type each pill represents. The labels are colocated with the helper function since they're only used in the aggregate view.
**Alternatives rejected:**
- Reuse `DOC_CONFIG` from detail page: This is a client component constant not exported from the module. Even if extracted, the labels are too long for pills. Different contexts warrant different label lengths.
