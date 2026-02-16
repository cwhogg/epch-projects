# Navigation Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Restructure navigation from stage-oriented (7 tabs) to project-oriented (3 tabs), with a project list home page, project dashboard hub, and separate analysis detail page.

**Source Design Doc:** `docs/plans/2026-02-16-nav-redesign-design.md`

**Architecture:** The current app has 7 nav tabs mapping to pipeline stages. This plan replaces them with 3 tabs (Projects, Ideation, Analytics), rewrites the home page as a project list, converts the analysis detail page into a project dashboard with pipeline summary cards, and moves analysis content to a new sub-page. All existing detail pages (`/analyses/[id]/foundation`, `/content`, `/painted-door`, `/analytics`) remain unchanged.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Vitest, @testing-library/react (new dev dependency)

---

### Task 1: Install test dependencies for component tests

**Files:**
- Modify: `package.json`

The project has vitest but no React Testing Library or jsdom. We need these for component-level tests.

**Step 1: Install dev dependencies**

Run:
```bash
npm install -D @testing-library/react @testing-library/jest-dom jsdom
```

**Step 2: Update vitest config to support jsdom**

Add `environment: 'jsdom'` to `vitest.config.ts` so React component tests can render:

```typescript
// vitest.config.ts — add environment to the test block
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/.worktrees/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**Step 3: Run existing tests to verify nothing broke**

Run: `npx vitest run`
Expected: All existing tests pass

**Step 4: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add @testing-library/react and jsdom for component tests"
```

---

### Task 2: Extract ScoreRing component

**Files:**
- Create: `src/components/ScoreRing.tsx`
- Create: `src/components/__tests__/ScoreRing.test.tsx`
- Modify: `src/app/analyses/[id]/page.tsx:89-148` (remove inline ScoreRing, add import)

The `ScoreRing` component is currently defined inline in `src/app/analyses/[id]/page.tsx` at lines 89-148. Extract it to a shared component so both the dashboard Analysis card and the analysis detail page can use it.

**Step 1: Write the failing test**

Create `src/components/__tests__/ScoreRing.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScoreRing from '../ScoreRing';

describe('ScoreRing', () => {
  it('renders the score value', () => {
    render(<ScoreRing score={8} label="SEO" />);
    expect(screen.getByText('8')).toBeDefined();
  });

  it('renders the label', () => {
    render(<ScoreRing score={8} label="SEO" />);
    expect(screen.getByText('SEO')).toBeDefined();
  });

  it('renders ? when score is null', () => {
    render(<ScoreRing score={null} label="Unknown" />);
    expect(screen.getByText('?')).toBeDefined();
  });

  it('uses green color for score >= 7', () => {
    const { container } = render(<ScoreRing score={8} label="SEO" />);
    const circle = container.querySelectorAll('circle')[1];
    expect(circle?.getAttribute('stroke')).toBe('var(--accent-emerald)');
  });

  it('uses amber color for score 4-6', () => {
    const { container } = render(<ScoreRing score={5} label="WTP" />);
    const circle = container.querySelectorAll('circle')[1];
    expect(circle?.getAttribute('stroke')).toBe('var(--accent-amber)');
  });

  it('uses danger color for score < 4', () => {
    const { container } = render(<ScoreRing score={2} label="Low" />);
    const circle = container.querySelectorAll('circle')[1];
    expect(circle?.getAttribute('stroke')).toBe('var(--color-danger)');
  });

  it('respects custom size prop', () => {
    const { container } = render(<ScoreRing score={8} label="Overall" size={80} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('80');
    expect(svg?.getAttribute('height')).toBe('80');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/ScoreRing.test.tsx`
Expected: FAIL — module not found

**Step 3: Create the extracted component**

Create `src/components/ScoreRing.tsx` — copy lines 88-148 from `src/app/analyses/[id]/page.tsx` and add the export:

```tsx
export default function ScoreRing({ score, label, size = 72 }: { score: number | null; label: string; size?: number }) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percent = score !== null ? score / 10 : 0;
  const offset = circumference - percent * circumference;

  const getColor = () => {
    if (score === null) return 'var(--text-muted)';
    if (score >= 7) return 'var(--accent-emerald)';
    if (score >= 4) return 'var(--accent-amber)';
    return 'var(--color-danger)';
  };

  const getGlow = () => {
    if (score === null || score < 7) return 'none';
    return `drop-shadow(0 0 6px ${getColor()}50)`;
  };

  return (
    <div className="flex flex-col items-center gap-2 group">
      <div
        className="relative transition-transform duration-200 group-hover:scale-105"
        style={{ width: size, height: size, filter: getGlow() }}
      >
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border-default)"
            strokeWidth={strokeWidth}
          />
          {score !== null && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={getColor()}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
          )}
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center font-display font-semibold"
          style={{ fontSize: size * 0.35, color: score !== null ? getColor() : 'var(--text-muted)' }}
        >
          {score !== null ? score : '?'}
        </div>
      </div>
      <span className="text-xs text-center transition-colors group-hover:text-[var(--text-secondary)]" style={{ color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/ScoreRing.test.tsx`
Expected: PASS (all 7 tests)

**Step 5: Update the original page to import the extracted component**

In `src/app/analyses/[id]/page.tsx`:
- Remove the inline `ScoreRing` function (lines 88-148)
- Add import: `import ScoreRing from '@/components/ScoreRing';`
- The JSX at lines 428-433 that uses `<ScoreRing ... />` stays unchanged

**Step 6: Run all tests + build to verify no regressions**

Run: `npx vitest run && npm run build`
Expected: All tests pass, build succeeds

**Step 7: Commit**

```bash
git add src/components/ScoreRing.tsx src/components/__tests__/ScoreRing.test.tsx src/app/analyses/\[id\]/page.tsx
git commit -m "refactor: extract ScoreRing to shared component"
```

---

### Task 3: Extract SEODeepDive component

**Files:**
- Create: `src/components/SEODeepDive.tsx`
- Modify: `src/app/analyses/[id]/page.tsx:150-315` (remove inline SEODeepDive, add import)

The `SEODeepDive` component is currently inline at lines 150-315. Extract it for reuse in the new analysis detail page.

**Step 1: Create the extracted component**

Create `src/components/SEODeepDive.tsx` — copy the `SEOSynthesisData` interface (lines 17-25) and the `SEODeepDive` function (lines 150-315) from `src/app/analyses/[id]/page.tsx`:

```tsx
interface SEOSynthesisData {
  synthesis: {
    topKeywords: { keyword: string; intentType: string; estimatedVolume: string; estimatedCompetitiveness: string; relevanceToMillionARR: string; contentGapHypothesis: string }[];
    serpValidated: { keyword: string; hasContentGap: boolean; serpInsight: string; competitorDomains: string[]; serpData: { peopleAlsoAsk: { question: string }[] } }[];
    comparison: { agreedKeywords: string[]; claudeUniqueKeywords: string[]; openaiUniqueKeywords: string[] } | null;
    dataSources: string[];
    synthesisNarrative: string;
  };
}

export default function SEODeepDive({ seoDataJson }: { seoDataJson?: string }) {
  // ... exact copy of the existing function body from lines 151-315
}
```

**Step 2: Update the original page to import the extracted component**

In `src/app/analyses/[id]/page.tsx`:
- Remove the `SEOSynthesisData` interface (lines 17-25)
- Remove the inline `SEODeepDive` function (lines 150-315)
- Add import: `import SEODeepDive from '@/components/SEODeepDive';`
- The JSX at line 460 that uses `<SEODeepDive seoDataJson={content.seoData} />` stays unchanged

**Step 3: Run all tests + build to verify no regressions**

Run: `npx vitest run && npm run build`
Expected: All tests pass, build succeeds

**Step 4: Commit**

```bash
git add src/components/SEODeepDive.tsx src/app/analyses/\[id\]/page.tsx
git commit -m "refactor: extract SEODeepDive to shared component"
```

---

### Task 4: Update NavLinks — 7 tabs to 3

**Files:**
- Modify: `src/components/NavLinks.tsx`

**Step 1: Replace the 7-item navItems array with 3 items**

Replace the `navItems` array in `src/components/NavLinks.tsx` (lines 7-15):

```tsx
const navItems = [
  { href: '/', label: 'Projects' },
  { href: '/ideas/new', label: 'Ideation' },
  { href: '/analytics', label: 'Analytics' },
];
```

No other changes needed — the component renders from this array.

**Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/NavLinks.tsx
git commit -m "feat: update desktop nav to 3 tabs (Projects, Ideation, Analytics)"
```

---

### Task 5: Update MobileNav — 7 tabs to 3

**Files:**
- Modify: `src/components/MobileNav.tsx`

**Step 1: Replace the 7-item tabs array with 3 items**

Replace the `tabs` array in `src/components/MobileNav.tsx` (lines 10-87) with 3 tabs matching the mockup's mobile nav:

```tsx
const tabs = [
  {
    href: '/',
    label: 'Projects',
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
    href: '/ideas/new',
    label: 'Ideation',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
      </svg>
    ),
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20V10" />
        <path d="M18 20V4" />
        <path d="M6 20v-4" />
      </svg>
    ),
  },
];
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/MobileNav.tsx
git commit -m "feat: update mobile nav to 3 tabs (Projects, Ideation, Analytics)"
```

---

### Task 6: Update nav-utils and its tests

**Files:**
- Modify: `src/lib/nav-utils.ts`
- Modify: `src/lib/__tests__/nav-utils.test.ts`

The `isActive` function needs to handle 3 new routes: `/` (Projects), `/ideas/new` (Ideation), `/analytics` (Analytics). The old 7-tab cases can be removed.

**Step 1: Write the updated tests**

Rewrite `src/lib/__tests__/nav-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isActive } from '../nav-utils';

const NAV_ITEMS = ['/', '/ideas/new', '/analytics'];

function activeTabsFor(pathname: string): string[] {
  return NAV_ITEMS.filter((href) => isActive(pathname, href));
}

describe('isActive (project-centric nav)', () => {
  describe('/ (Projects) tab', () => {
    it('activates on /', () => {
      expect(isActive('/', '/')).toBe(true);
    });

    it('activates on /analyses/abc (project dashboard)', () => {
      expect(isActive('/analyses/abc', '/')).toBe(true);
    });

    it('activates on /analyses/abc/analysis', () => {
      expect(isActive('/analyses/abc/analysis', '/')).toBe(true);
    });

    it('activates on /analyses/abc/foundation', () => {
      expect(isActive('/analyses/abc/foundation', '/')).toBe(true);
    });

    it('activates on /analyses/abc/content', () => {
      expect(isActive('/analyses/abc/content', '/')).toBe(true);
    });

    it('activates on /analyses/abc/painted-door', () => {
      expect(isActive('/analyses/abc/painted-door', '/')).toBe(true);
    });

    it('activates on /analyses/abc/analytics', () => {
      expect(isActive('/analyses/abc/analytics', '/')).toBe(true);
    });

    it('does not activate on /ideas/new', () => {
      expect(isActive('/ideas/new', '/')).toBe(false);
    });

    it('does not activate on /analytics', () => {
      expect(isActive('/analytics', '/')).toBe(false);
    });
  });

  describe('/ideas/new (Ideation) tab', () => {
    it('activates on /ideas/new', () => {
      expect(isActive('/ideas/new', '/ideas/new')).toBe(true);
    });

    it('activates on /ideas/abc/analyze', () => {
      expect(isActive('/ideas/abc/analyze', '/ideas/new')).toBe(true);
    });

    it('does not activate on /', () => {
      expect(isActive('/', '/ideas/new')).toBe(false);
    });
  });

  describe('/analytics (Analytics) tab', () => {
    it('activates on /analytics', () => {
      expect(isActive('/analytics', '/analytics')).toBe(true);
    });

    it('activates on /testing', () => {
      expect(isActive('/testing', '/analytics')).toBe(true);
    });

    it('does not activate on /', () => {
      expect(isActive('/', '/analytics')).toBe(false);
    });

    it('does not activate on /analyses/abc/analytics (per-project analytics is Projects)', () => {
      expect(isActive('/analyses/abc/analytics', '/analytics')).toBe(false);
    });
  });

  describe('no path triggers multiple tabs', () => {
    const testPaths = [
      '/',
      '/analyses/abc',
      '/analyses/abc/analysis',
      '/analyses/abc/foundation',
      '/analyses/abc/content',
      '/analyses/abc/analytics',
      '/analyses/abc/painted-door',
      '/ideas/new',
      '/ideas/abc/analyze',
      '/analytics',
      '/testing',
    ];

    it.each(testPaths)('"%s" activates at most one tab', (pathname) => {
      const active = activeTabsFor(pathname);
      expect(active.length).toBeLessThanOrEqual(1);
    });

    it.each(testPaths)('"%s" activates at least one tab', (pathname) => {
      const active = activeTabsFor(pathname);
      expect(active.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('orphaned pages (no tab active)', () => {
    const orphanedPaths = [
      '/analysis',
      '/foundation',
      '/website',
      '/content',
      '/optimization',
      '/ideation',
    ];

    it.each(orphanedPaths)('"%s" activates no tab', (pathname) => {
      const active = activeTabsFor(pathname);
      expect(active.length).toBe(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/nav-utils.test.ts`
Expected: FAIL — current `isActive` doesn't handle `/` or `/ideas/new` as href

**Step 3: Rewrite isActive**

Replace `src/lib/nav-utils.ts`:

```typescript
export function isActive(pathname: string, href: string): boolean {
  switch (href) {
    case '/':
      // Projects tab: home + all project sub-pages
      return pathname === '/' || pathname.startsWith('/analyses/');
    case '/ideas/new':
      // Ideation tab: idea creation + analysis trigger
      return pathname.startsWith('/ideas/');
    case '/analytics':
      // Analytics tab: cross-site analytics + testing dashboard
      // But NOT per-project analytics (/analyses/[id]/analytics)
      return pathname === '/analytics' || pathname === '/testing';
    default:
      return false;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/nav-utils.test.ts`
Expected: PASS (all tests)

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/lib/nav-utils.ts src/lib/__tests__/nav-utils.test.ts
git commit -m "feat: rewrite nav-utils isActive for 3-tab project-centric nav"
```

---

### Task 7: Create analysis detail page

**Files:**
- Create: `src/app/analyses/[id]/analysis/page.tsx`
- Create: `src/components/CollapsibleAnalysis.tsx` (client component for expand/collapse)

This is the new page at `/analyses/[id]/analysis` that contains all the analysis content moved from the current `/analyses/[id]` page: score rings, risks, SEO deep dive, full analysis (collapsible), and Reanalyze/Delete buttons.

**Step 1: Create the CollapsibleAnalysis client component**

Create `src/components/CollapsibleAnalysis.tsx`:

```tsx
'use client';

import { useState } from 'react';
import MarkdownContent from '@/components/MarkdownContent';

export default function CollapsibleAnalysis({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  if (!content) return null;

  return (
    <div className="card-static p-5 sm:p-6 animate-slide-up stagger-4">
      <h2 className="font-display text-base mb-4" style={{ color: 'var(--text-primary)' }}>
        Full Analysis
      </h2>
      <div className="relative">
        <div
          className="overflow-hidden transition-[max-height] duration-400 ease-in-out"
          style={{ maxHeight: expanded ? '5000px' : '200px' }}
        >
          <div className="prose-editorial">
            <MarkdownContent content={content} />
          </div>
        </div>
        {!expanded && (
          <div
            className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, transparent, var(--bg-card))' }}
          />
        )}
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-center gap-1.5 w-full pt-2.5 mt-2 text-sm font-medium transition-colors"
        style={{ color: 'var(--accent-coral)', borderTop: '1px solid var(--border-subtle)' }}
      >
        <span>{expanded ? 'Collapse' : 'Show full analysis'}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>
  );
}
```

**Step 2: Create the analysis detail page**

Create `src/app/analyses/[id]/analysis/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAnalysisFromDb, getAnalysisContent, isRedisConfigured } from '@/lib/db';
import { getAnalysis } from '@/lib/data';
import ScoreRing from '@/components/ScoreRing';
import SEODeepDive from '@/components/SEODeepDive';
import ReanalyzeForm from '@/components/ReanalyzeForm';
import DeleteButton from '@/components/DeleteButton';
import CollapsibleAnalysis from '@/components/CollapsibleAnalysis';
import { Analysis } from '@/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

function getBadgeClass(rec: string) {
  switch (rec) {
    case 'Tier 1': return 'badge-success';
    case 'Tier 2': return 'badge-warning';
    case 'Tier 3': return 'badge-danger';
    default: return 'badge-neutral';
  }
}

function getConfidenceStyle(conf: string) {
  switch (conf) {
    case 'High': return { color: 'var(--accent-emerald)' };
    case 'Medium': return { color: 'var(--accent-amber)' };
    case 'Low': return { color: 'var(--color-danger)' };
    default: return { color: 'var(--text-muted)' };
  }
}

async function getPageData(id: string) {
  if (isRedisConfigured()) {
    const analysis = await getAnalysisFromDb(id);
    if (analysis) {
      const content = await getAnalysisContent(id);
      return { analysis, content: content || { main: 'Analysis content not available' } };
    }
  }
  const fallback = getAnalysis(id);
  if (!fallback) return null;
  return { analysis: fallback.analysis, content: fallback.content };
}

export default async function AnalysisDetailPage({ params }: PageProps) {
  const { id } = await params;
  const result = await getPageData(id);

  if (!result) {
    notFound();
  }

  const { analysis, content } = result;

  const getHeaderGradient = () => {
    switch (analysis.recommendation) {
      case 'Tier 1': return 'radial-gradient(ellipse at top left, rgba(52, 211, 153, 0.1) 0%, transparent 50%)';
      case 'Tier 2': return 'radial-gradient(ellipse at top left, rgba(251, 191, 36, 0.08) 0%, transparent 50%)';
      case 'Tier 3': return 'radial-gradient(ellipse at top left, rgba(248, 113, 113, 0.08) 0%, transparent 50%)';
      default: return 'none';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <header
        className="animate-slide-up stagger-1 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2 pb-6 rounded-xl"
        style={{ background: getHeaderGradient() }}
      >
        <Link
          href={`/analyses/${id}`}
          className="inline-flex items-center gap-1 text-sm mb-4 transition-colors hover:text-[var(--accent-coral)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back to Project
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display" style={{ color: 'var(--text-primary)' }}>
              Analysis — {analysis.ideaName}
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Analyzed on {new Date(analysis.completedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-3">
              <span className={`badge ${getBadgeClass(analysis.recommendation)}`}>
                {analysis.recommendation}
              </span>
              <span className="text-sm font-medium" style={getConfidenceStyle(analysis.confidence)}>
                {analysis.confidence}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ReanalyzeForm ideaId={analysis.id} />
              <DeleteButton ideaId={analysis.id} ideaName={analysis.ideaName} />
            </div>
          </div>
        </div>
      </header>

      {/* Scores Grid */}
      <div className="card-static p-5 sm:p-6 animate-slide-up stagger-2">
        <h2 className="font-display text-base mb-5" style={{ color: 'var(--text-primary)' }}>
          Scores
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 sm:gap-6 justify-items-center">
          <ScoreRing score={analysis.scores.seoOpportunity} label="SEO" />
          <ScoreRing score={analysis.scores.competitiveLandscape} label="Competition" />
          <ScoreRing score={analysis.scores.willingnessToPay} label="WTP" />
          <ScoreRing score={analysis.scores.differentiationPotential} label="Differentiation" />
          <ScoreRing score={analysis.scores.expertiseAlignment} label="Expertise" />
          <ScoreRing score={analysis.scores.overall} label="Overall" size={80} />
        </div>
      </div>

      {/* Risks */}
      {analysis.risks && analysis.risks.length > 0 && (
        <div className="card-static p-5 sm:p-6 animate-slide-up stagger-3">
          <h2 className="font-display text-base mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Key Risks
          </h2>
          <ul className="space-y-2">
            {analysis.risks.map((risk, index) => (
              <li key={index} className="flex items-start gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--color-danger)' }}>•</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* SEO Deep Dive */}
      <SEODeepDive seoDataJson={content.seoData} />

      {/* Full Analysis — Collapsible */}
      <CollapsibleAnalysis content={content.main} />
    </div>
  );
}
```

Note: The `getAnalysis` function from `@/lib/data` returns `{ analysis, content }` for the filesystem fallback. Verify the shape matches — the original page at `src/app/analyses/[id]/page.tsx` line 57-59 shows the fallback spreads the result, which includes both `analysis` and `content`. The `getPageData` function here mirrors that pattern.

**Step 3: Build to verify the page compiles**

Run: `npm run build`
Expected: Build succeeds. The new route `/analyses/[id]/analysis` should appear in the build output.

**Step 4: Commit**

```bash
git add src/app/analyses/\[id\]/analysis/page.tsx src/components/CollapsibleAnalysis.tsx
git commit -m "feat: add analysis detail page at /analyses/[id]/analysis"
```

---

### Task 8: Rewrite project dashboard

**Files:**
- Modify: `src/app/analyses/[id]/page.tsx` (complete rewrite)

The existing analysis detail page becomes the project dashboard with pipeline summary cards. All analysis content has been moved to `/analyses/[id]/analysis` in Task 7.

> **Behavior change:** The dashboard header no longer includes "Foundation Docs", "Reanalyze", and "Delete" buttons. Foundation access moves to the Foundation summary card link. Reanalyze/Delete move to the analysis detail page at `/analyses/[id]/analysis`. The "View Site" / "Create Website" button remains in the header.

**Step 1: Rewrite the page**

Replace the entire content of `src/app/analyses/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAnalysisFromDb, getAnalysisContent, getContentCalendar, getContentPieces, getGSCLink, getGSCAnalytics, isRedisConfigured } from '@/lib/db';
import { getAllFoundationDocs } from '@/lib/db';
import { getPaintedDoorSite, getEmailSignupCount } from '@/lib/painted-door-db';
import { getAnalysis } from '@/lib/data';
import ScoreRing from '@/components/ScoreRing';
import { Analysis, FoundationDocType, FOUNDATION_DOC_TYPES } from '@/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface DashboardData {
  analysis: Analysis;
  seoData?: string;
  foundationDocs: Partial<Record<FoundationDocType, boolean>>;
  foundationCount: number;
  websiteStatus: string | null;
  websiteDomain: string | null;
  websiteSignups: number;
  contentTotal: number;
  contentComplete: number;
  contentPending: number;
  contentTypes: string[];
  hasGSCLink: boolean;
  gscImpressions: number | null;
  gscClicks: number | null;
  gscCTR: number | null;
  risks: string[];
  agreedKeywords: number;
  serpValidated: number;
}

const FOUNDATION_LABELS: Record<FoundationDocType, string> = {
  'strategy': 'Strategy',
  'positioning': 'Positioning',
  'brand-voice': 'Brand Voice',
  'design-principles': 'Design Principles',
  'seo-strategy': 'SEO Strategy',
  'social-media-strategy': 'Social Media',
};

function getBadgeClass(rec: string) {
  switch (rec) {
    case 'Tier 1': return 'badge-success';
    case 'Tier 2': return 'badge-warning';
    case 'Tier 3': return 'badge-danger';
    default: return 'badge-neutral';
  }
}

function getConfidenceStyle(conf: string) {
  switch (conf) {
    case 'High': return { color: 'var(--accent-emerald)' };
    case 'Medium': return { color: 'var(--accent-amber)' };
    case 'Low': return { color: 'var(--color-danger)' };
    default: return { color: 'var(--text-muted)' };
  }
}

function getWebsiteStatusStyle(status: string) {
  switch (status) {
    case 'live': return { bg: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)' };
    case 'deploying':
    case 'pushing':
    case 'generating': return { bg: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)' };
    case 'failed': return { bg: 'rgba(248, 113, 113, 0.15)', color: 'var(--color-danger)' };
    default: return { bg: 'rgba(113, 113, 122, 0.1)', color: 'var(--text-muted)' };
  }
}

function getWebsiteStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

async function getDashboardData(id: string): Promise<DashboardData | null> {
  if (isRedisConfigured()) {
    const analysis = await getAnalysisFromDb(id);
    if (!analysis) return null;

    const [content, foundationDocsMap, calendar, pieces, gscLink, pdSite] = await Promise.all([
      getAnalysisContent(id),
      getAllFoundationDocs(analysis.ideaId).catch(() => ({})),
      getContentCalendar(id),
      getContentPieces(id),
      getGSCLink(id),
      getPaintedDoorSite(id).catch(() => null),
    ]);

    // Parse SEO data for analysis card summary
    let agreedKeywords = 0;
    let serpValidated = 0;
    if (content?.seoData) {
      try {
        const seo = JSON.parse(content.seoData);
        agreedKeywords = seo.synthesis?.comparison?.agreedKeywords?.length ?? 0;
        serpValidated = seo.synthesis?.serpValidated?.filter((v: { hasContentGap: boolean }) => v.hasContentGap)?.length ?? 0;
      } catch { /* ignore parse errors */ }
    }

    // Get signup count if site exists
    const websiteSignups = pdSite ? await getEmailSignupCount(pdSite.id).catch(() => 0) : 0;

    // Get GSC summary metrics if linked
    let gscImpressions: number | null = null;
    let gscClicks: number | null = null;
    let gscCTR: number | null = null;
    if (gscLink) {
      const gscData = await getGSCAnalytics(analysis.ideaId).catch(() => null);
      if (gscData?.timeSeries?.length) {
        // Sum last 7 days
        const last7 = gscData.timeSeries.slice(-7);
        gscImpressions = last7.reduce((sum, d) => sum + d.impressions, 0);
        gscClicks = last7.reduce((sum, d) => sum + d.clicks, 0);
        gscCTR = gscImpressions > 0 ? (gscClicks / gscImpressions) * 100 : 0;
      }
    }

    const foundationDocs: Partial<Record<FoundationDocType, boolean>> = {};
    for (const docType of FOUNDATION_DOC_TYPES) {
      foundationDocs[docType] = docType in foundationDocsMap;
    }

    const completePieces = pieces.filter(p => p.status === 'complete');
    const pendingPieces = pieces.filter(p => p.status === 'pending' || p.status === 'generating');
    const contentTypes = [...new Set(pieces.map(p => p.type))];

    return {
      analysis,
      seoData: content?.seoData,
      foundationDocs,
      foundationCount: Object.keys(foundationDocsMap).length,
      websiteStatus: pdSite?.status ?? null,
      websiteDomain: pdSite?.siteUrl ?? null,
      websiteSignups,
      contentTotal: calendar?.pieces.length ?? 0,
      contentComplete: completePieces.length,
      contentPending: pendingPieces.length,
      contentTypes: contentTypes.map(t => t.replace(/-/g, ' ')),
      hasGSCLink: !!gscLink,
      gscImpressions,
      gscClicks,
      gscCTR,
      risks: analysis.risks ?? [],
      agreedKeywords,
      serpValidated,
    };
  }

  // Filesystem fallback
  const fallback = getAnalysis(id);
  if (!fallback) return null;
  return {
    analysis: fallback.analysis,
    foundationDocs: {},
    foundationCount: 0,
    websiteStatus: null,
    websiteDomain: null,
    websiteSignups: 0,
    contentTotal: 0,
    contentComplete: 0,
    contentPending: 0,
    contentTypes: [],
    hasGSCLink: false,
    gscImpressions: null,
    gscClicks: null,
    gscCTR: null,
    risks: fallback.analysis.risks ?? [],
    agreedKeywords: 0,
    serpValidated: 0,
  };
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default async function ProjectDashboard({ params }: PageProps) {
  const { id } = await params;
  const data = await getDashboardData(id);

  if (!data) {
    notFound();
  }

  const { analysis } = data;

  const getHeaderGradient = () => {
    switch (analysis.recommendation) {
      case 'Tier 1': return 'radial-gradient(ellipse at top left, rgba(52, 211, 153, 0.1) 0%, transparent 50%)';
      case 'Tier 2': return 'radial-gradient(ellipse at top left, rgba(251, 191, 36, 0.08) 0%, transparent 50%)';
      case 'Tier 3': return 'radial-gradient(ellipse at top left, rgba(248, 113, 113, 0.08) 0%, transparent 50%)';
      default: return 'none';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <header
        className="animate-slide-up stagger-1 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2 pb-6 rounded-xl"
        style={{ background: getHeaderGradient() }}
      >
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm mb-4 transition-colors hover:text-[var(--accent-coral)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back to Projects
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display" style={{ color: 'var(--text-primary)' }}>
              {analysis.ideaName}
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Analyzed on {new Date(analysis.completedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-3">
              <span className={`badge ${getBadgeClass(analysis.recommendation)}`}>
                {analysis.recommendation}
              </span>
              <span className="text-sm font-medium" style={getConfidenceStyle(analysis.confidence)}>
                {analysis.confidence}
              </span>
            </div>
            {data.websiteStatus === 'live' && data.websiteDomain && (
              <a
                href={data.websiteDomain.startsWith('http') ? data.websiteDomain : `https://${data.websiteDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost text-sm"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                View Site
              </a>
            )}
            {!data.websiteStatus && (
              <Link href={`/analyses/${id}/painted-door`} className="btn btn-ghost text-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                Create Website
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Pipeline Summary Cards */}
      <div className="flex flex-col gap-3">

        {/* Analysis Card */}
        <Link href={`/analyses/${id}/analysis`} className="card-static p-5 block transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg animate-slide-up stagger-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Analysis</span>
            <svg className="transition-transform" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </div>
          <div className="flex items-center gap-5 mt-3">
            <ScoreRing score={analysis.scores.overall} label="" size={44} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-display text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                  {analysis.recommendation} — {analysis.recommendation === 'Tier 1' ? 'Pursue' : analysis.recommendation === 'Tier 2' ? 'Explore' : analysis.recommendation === 'Tier 3' ? 'Deprioritize' : ''}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  SEO {analysis.scores.seoOpportunity ?? '?'} · Competition {analysis.scores.competitiveLandscape ?? '?'} · WTP {analysis.scores.willingnessToPay ?? '?'} · Differentiation {analysis.scores.differentiationPotential ?? '?'} · Expertise {analysis.scores.expertiseAlignment ?? '?'}
                </span>
              </div>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {data.risks.length > 0 ? `${data.risks.length} key risk${data.risks.length !== 1 ? 's' : ''} identified` : 'No risks flagged'}
                {data.agreedKeywords > 0 ? ` · ${data.agreedKeywords} agreed keywords` : ''}
                {data.serpValidated > 0 ? ` · ${data.serpValidated} SERP-validated content gaps` : ''}
              </p>
            </div>
          </div>
        </Link>

        {/* Foundation Card */}
        <Link href={`/analyses/${id}/foundation`} className="card-static p-5 block transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg animate-slide-up stagger-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Foundation Documents</span>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-1">
                  {FOUNDATION_DOC_TYPES.map((dt) => (
                    <div
                      key={dt}
                      className="w-2 h-2 rounded-full"
                      style={{ background: data.foundationDocs[dt] ? 'var(--accent-emerald)' : 'var(--border-default)' }}
                    />
                  ))}
                </div>
                <span className="text-xs font-medium" style={{ color: data.foundationCount === 6 ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                  {data.foundationCount}/6
                </span>
              </div>
            </div>
            <svg className="transition-transform" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </div>
          {data.foundationCount > 0 ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3">
              {FOUNDATION_DOC_TYPES.map((dt) => (
                <div key={dt} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: data.foundationDocs[dt] ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-elevated)',
                      color: data.foundationDocs[dt] ? 'var(--accent-emerald)' : 'var(--text-muted)',
                    }}
                  >
                    {data.foundationDocs[dt] ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    ) : (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /></svg>
                    )}
                  </div>
                  {FOUNDATION_LABELS[dt]}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>Not started</p>
          )}
        </Link>

        {/* Website Card */}
        <Link href={`/analyses/${id}/painted-door`} className="card-static p-5 block transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg animate-slide-up stagger-4">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Painted Door Site</span>
            <svg className="transition-transform" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </div>
          {data.websiteStatus ? (
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <span
                className="text-xs font-medium px-2 py-0.5 rounded flex items-center gap-1.5"
                style={{ background: getWebsiteStatusStyle(data.websiteStatus).bg, color: getWebsiteStatusStyle(data.websiteStatus).color }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
                {getWebsiteStatusLabel(data.websiteStatus)}
              </span>
              {data.websiteDomain && (
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {data.websiteDomain.replace(/^https?:\/\//, '')}
                </span>
              )}
              {data.websiteStatus === 'live' && data.websiteSignups > 0 && (
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {data.websiteSignups} signup{data.websiteSignups !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>Not started</p>
          )}
        </Link>

        {/* Content Card */}
        <Link href={`/analyses/${id}/content`} className="card-static p-5 block transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg animate-slide-up stagger-5">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Content Pipeline</span>
            <svg className="transition-transform" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </div>
          {data.contentTotal > 0 ? (
            <div className="flex items-center gap-6 mt-2 flex-wrap">
              <div className="text-center">
                <div className="font-display text-xl font-medium" style={{ color: 'var(--accent-emerald)' }}>{data.contentComplete}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Complete</div>
              </div>
              <div className="text-center">
                <div className="font-display text-xl font-medium" style={{ color: 'var(--accent-amber)' }}>{data.contentPending}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Pending</div>
              </div>
              <div className="text-center">
                <div className="font-display text-xl font-medium" style={{ color: 'var(--text-secondary)' }}>{data.contentTotal}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Total</div>
              </div>
              {data.contentTypes.length > 0 && (
                <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
                  {data.contentTypes.join(', ')}
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>Not started</p>
          )}
        </Link>

        {/* Performance Card (conditional) */}
        {data.hasGSCLink && data.gscImpressions !== null && (
          <Link href={`/analyses/${id}/analytics`} className="card-static p-5 block transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg animate-slide-up stagger-6">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Performance</span>
              <svg className="transition-transform" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            </div>
            <div className="flex items-center gap-6 mt-2 flex-wrap">
              <div className="text-center">
                <div className="font-display text-xl font-medium" style={{ color: 'var(--text-primary)' }}>{formatNumber(data.gscImpressions)}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Impressions</div>
              </div>
              <div className="text-center">
                <div className="font-display text-xl font-medium" style={{ color: 'var(--text-primary)' }}>{formatNumber(data.gscClicks!)}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Clicks</div>
              </div>
              <div className="text-center">
                <div className="font-display text-xl font-medium" style={{ color: 'var(--text-primary)' }}>{data.gscCTR!.toFixed(1)}%</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>CTR</div>
              </div>
              <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>Last 7 days · GSC</span>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/app/analyses/\[id\]/page.tsx
git commit -m "feat: rewrite /analyses/[id] as project dashboard with pipeline summary cards"
```

---

### Task 9: Rewrite home page as project list

**Files:**
- Modify: `src/app/page.tsx` (complete rewrite)

The home page changes from pipeline stage cards to a project list sorted by analysis score.

**Step 1: Rewrite the page**

Replace the entire content of `src/app/page.tsx`:

```tsx
import Link from 'next/link';
import { getAnalysesFromDb, getAllContentCalendars, isRedisConfigured, getAllFoundationDocs } from '@/lib/db';
import { getAllPaintedDoorSites } from '@/lib/painted-door-db';
import { getAnalyses } from '@/lib/data';
import { Analysis, PaintedDoorSite, ContentCalendar, FoundationDocType, FOUNDATION_DOC_TYPES } from '@/types';

export const dynamic = 'force-dynamic';

interface ProjectSummary {
  analysis: Analysis;
  foundationCount: number;
  websiteStatus: string | null;
  contentTotal: number;
  contentComplete: number;
  hasGSCLink: boolean;
}

function getBadgeClass(rec: string) {
  switch (rec) {
    case 'Tier 1': return 'badge-success';
    case 'Tier 2': return 'badge-warning';
    case 'Tier 3': return 'badge-danger';
    default: return 'badge-neutral';
  }
}

function getWebsiteStatusStyle(status: string) {
  switch (status) {
    case 'live': return 'pipeline-status-live';
    case 'deploying':
    case 'pushing':
    case 'generating': return 'pipeline-status-deploying';
    case 'failed': return 'pipeline-status-failed';
    default: return 'pipeline-status-none';
  }
}

async function getProjectSummaries(): Promise<ProjectSummary[]> {
  if (!isRedisConfigured()) {
    const analyses = getAnalyses();
    return analyses.map((a) => ({
      analysis: a.analysis,
      foundationCount: 0,
      websiteStatus: null,
      contentTotal: 0,
      contentComplete: 0,
      hasGSCLink: false,
    }));
  }

  const [analyses, allSites, allCalendars] = await Promise.all([
    getAnalysesFromDb(),
    getAllPaintedDoorSites(),
    getAllContentCalendars(),
  ]);

  const summaries = await Promise.all(analyses.map(async (analysis) => {
    const docs = await getAllFoundationDocs(analysis.ideaId).catch(() => ({}));
    const site = allSites.find((s: PaintedDoorSite) => s.ideaId === analysis.ideaId);
    const calendar = allCalendars.find((c: ContentCalendar) => c.ideaId === analysis.ideaId);

    return {
      analysis,
      foundationCount: Object.keys(docs).length,
      websiteStatus: site?.status ?? null,
      contentTotal: calendar?.pieces.length ?? 0,
      contentComplete: calendar?.pieces.filter(p => p.status === 'complete').length ?? 0,
      hasGSCLink: false, // Avoid N+1 Redis calls for GSC links on home page
    };
  }));

  // Sort by overall score descending
  return summaries.sort((a, b) =>
    (b.analysis.scores.overall ?? 0) - (a.analysis.scores.overall ?? 0)
  );
}

export default async function Home() {
  const projects = await getProjectSummaries();

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <header className="animate-slide-up stagger-1 relative">
        <div
          className="absolute -top-10 right-0 w-96 h-72 rounded-full pointer-events-none hidden sm:block"
          style={{
            background: 'radial-gradient(ellipse, rgba(255, 107, 91, 0.1) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display" style={{ color: 'var(--text-primary)' }}>
              Projects
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Track every product from idea to optimized SEO test
            </p>
          </div>
          <Link
            href="/ideas/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all self-start"
            style={{
              background: 'linear-gradient(135deg, #ff6b5b 0%, #ff8f6b 100%)',
              color: '#fff',
              boxShadow: '0 4px 14px rgba(255, 107, 91, 0.4)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Test New Product
          </Link>
        </div>
      </header>

      {/* Project List */}
      {projects.length > 0 ? (
        <div className="flex flex-col gap-3">
          {projects.map((project, i) => (
            <Link
              key={project.analysis.id}
              href={`/analyses/${project.analysis.id}`}
              className="card-static p-5 block transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg animate-slide-up"
              style={{ animationDelay: `${0.1 + i * 0.05}s` }}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                      {project.analysis.ideaName}
                    </span>
                    <span className={`badge ${getBadgeClass(project.analysis.recommendation)}`}>
                      {project.analysis.recommendation}
                    </span>
                  </div>
                  <p className="text-sm mt-1 line-clamp-1" style={{ color: 'var(--text-secondary)' }}>
                    {project.analysis.summary}
                  </p>
                </div>
                <svg className="shrink-0 mt-1 transition-transform" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>

              {/* Pipeline Progress Row */}
              <div className="flex gap-5 mt-4 flex-wrap text-xs" style={{ color: 'var(--text-muted)' }}>
                {/* Analysis — always complete */}
                <div className="flex items-center gap-2">
                  <span className="font-medium">Analysis</span>
                  <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-emerald)' }} />
                </div>

                {/* Foundation */}
                <div className="flex items-center gap-2">
                  <span className="font-medium">Foundation</span>
                  <div className="flex gap-0.5">
                    {FOUNDATION_DOC_TYPES.map((_, idx) => (
                      <div
                        key={idx}
                        className="w-[7px] h-[7px] rounded-full"
                        style={{ background: idx < project.foundationCount ? 'var(--accent-emerald)' : 'var(--border-default)' }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.6875rem' }}>{project.foundationCount}/6</span>
                </div>

                {/* Website */}
                <div className="flex items-center gap-2">
                  <span className="font-medium">Website</span>
                  {project.websiteStatus ? (
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded"
                      style={{
                        background: project.websiteStatus === 'live' ? 'rgba(16, 185, 129, 0.15)'
                          : project.websiteStatus === 'failed' ? 'rgba(248, 113, 113, 0.15)'
                          : ['deploying', 'pushing', 'generating'].includes(project.websiteStatus) ? 'rgba(245, 158, 11, 0.15)'
                          : 'rgba(113, 113, 122, 0.1)',
                        color: project.websiteStatus === 'live' ? 'var(--accent-emerald)'
                          : project.websiteStatus === 'failed' ? 'var(--color-danger)'
                          : ['deploying', 'pushing', 'generating'].includes(project.websiteStatus) ? 'var(--accent-amber)'
                          : 'var(--text-muted)',
                      }}
                    >
                      {project.websiteStatus.charAt(0).toUpperCase() + project.websiteStatus.slice(1)}
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.6875rem' }}>Not Started</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex items-center gap-2">
                  <span className="font-medium">Content</span>
                  {project.contentTotal > 0 ? (
                    <span style={{ fontSize: '0.6875rem' }}>{project.contentComplete} complete / {project.contentTotal} total</span>
                  ) : (
                    <span style={{ fontSize: '0.6875rem' }}>Not started</span>
                  )}
                </div>

                {/* Analytics */}
                <div className="flex items-center gap-2">
                  <span className="font-medium">Analytics</span>
                  <span style={{ fontSize: '0.6875rem' }}>--</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 animate-slide-up stagger-2">
          <p className="text-lg font-display" style={{ color: 'var(--text-secondary)' }}>
            No projects yet.
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Start by testing a new product idea.
          </p>
          <Link
            href="/ideas/new"
            className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: 'linear-gradient(135deg, #ff6b5b 0%, #ff8f6b 100%)',
              color: '#fff',
              boxShadow: '0 4px 14px rgba(255, 107, 91, 0.4)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Test New Product
          </Link>
        </div>
      )}
    </div>
  );
}
```

Note: The home page intentionally skips GSC link checks per project (`hasGSCLink: false`) to avoid N+1 Redis calls. The design doc mentions this as acceptable and suggests a cache key if it becomes slow. The Analytics column shows `--` for all projects on the home page — GSC status is visible on the project dashboard's Performance card.

**Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: rewrite home page as project list with pipeline progress"
```

---

### Task 10: Verify analytics redirect still works

**Files:**
- Read (no change): `src/app/analytics/page.tsx`

**Step 1: Verify the analytics redirect page exists and is unchanged**

Read `src/app/analytics/page.tsx` — it should still contain:
```tsx
import { redirect } from 'next/navigation';

export default function AnalyticsRedirect() {
  redirect('/testing');
}
```

This page already exists and redirects `/analytics` to `/testing`. No changes needed.

**Step 2: Build to verify the route works**

Run: `npm run build`
Expected: Build succeeds, `/analytics` route appears in build output

---

### Task 11: Full build, lint, and test verification

**Step 1: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Run production build**

Run: `npm run build`
Expected: Build succeeds with exit code 0. Verify these routes appear in the output:
- `/` (home — project list)
- `/analyses/[id]` (project dashboard)
- `/analyses/[id]/analysis` (analysis detail)
- `/analytics` (redirect to /testing)

**Step 4: Commit any lint fixes if needed**

```bash
git add -A
git commit -m "fix: lint fixes from nav redesign"
```

---

### Task 12: Update architecture docs

**Files:**
- Modify: `docs/architecture.md`

The architecture doc's Mermaid diagrams and Quick Reference tables reference the old navigation structure. Update them to reflect the project-centric layout.

**Step 1: Update the Client pages in High-Level Architecture diagram**

In the `graph TB` Mermaid block (lines 11-21), update the `HOME` and `DETAIL` nodes and add `ANALYSIS_DETAIL`:

Replace:
```
HOME["/ (Home)<br/>Pipeline overview"]
```
With:
```
HOME["/ (Home)<br/>Project list"]
```

Replace:
```
DETAIL["/analyses/[id]<br/>Analysis detail tabs"]
```
With:
```
DETAIL["/analyses/[id]<br/>Project dashboard"]
ANALYSIS_DETAIL["/analyses/[id]/analysis<br/>Analysis detail"]
```

**Step 2: Update the Pages table in Quick Reference**

In the Quick Reference Pages table (lines 627-645), update:

| Current | New |
|---------|-----|
| `Home \| src/app/page.tsx \| Pipeline overview with stage cards and counts` | `Home \| src/app/page.tsx \| Project list with pipeline progress indicators` |
| `Analysis Detail \| src/app/analyses/[id]/page.tsx \| Analysis overview (scores, recommendation)` | `Project Dashboard \| src/app/analyses/[id]/page.tsx \| Project hub with pipeline summary cards` |

Add new row:
| `Analysis Detail \| src/app/analyses/[id]/analysis/page.tsx \| Analysis scores, risks, SEO deep dive, full analysis` |

**Step 3: Update the Components table**

In the Components table (lines 717-730), add the new components:

| `ScoreRing.tsx` | Animated SVG score ring visualization |
| `SEODeepDive.tsx` | SEO synthesis data display (cross-reference, keywords) |
| `CollapsibleAnalysis.tsx` | Expandable/collapsible full analysis markdown section |

**Step 4: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: update architecture reference for project-centric navigation"
```

---

## Decision Log

### Summary

| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Component test infrastructure | Add @testing-library/react + jsdom | Skip component tests, use Playwright |
| 2 | ScoreRing extraction approach | Copy function to new file, update import | Move to shared utils, create barrel export |
| 3 | Dashboard data fetching | Single `getDashboardData()` function with parallel calls | Separate client-side fetching per card, React Suspense boundaries |
| 4 | Home page GSC check | Skip GSC link check (hardcode `false`) | Check all GSC links (N+1 Redis), batch check |
| 5 | Collapsible analysis implementation | Client component with useState + CSS max-height | HTML details/summary, CSS-only with checkbox hack |
| 6 | Nav-utils orphaned pages | Return `false` for all old routes | Keep backward compatibility with old routes |

### Appendix: Decision Details

#### Decision 1: Component test infrastructure
**Chose:** Add `@testing-library/react` and `jsdom` as dev dependencies.
**Why:** The project already uses vitest for unit tests but has no component testing capability. The design doc specifies component-level tests (render checks, link verification). RTL is the React ecosystem standard and integrates cleanly with vitest via the jsdom environment. The alternative of skipping component tests entirely would leave the UI-heavy changes untested. Playwright (E2E) is too heavy for unit-level component checks and requires a running dev server.
**Alternatives rejected:**
- Skip component tests: Leaves the core UI changes untested.
- Playwright E2E: Overkill for component render tests, slower, requires dev server.

#### Decision 3: Dashboard data fetching
**Chose:** Single server-side `getDashboardData()` function with `Promise.all()` for parallel data fetching.
**Why:** Matches the existing pattern in `getAnalysisData()` at `src/app/analyses/[id]/page.tsx:36-60`. Server components can fetch all data in a single pass without waterfalls. The dashboard needs data from 6+ sources (analysis, content, foundation, website, GSC, signup count), and parallel fetching keeps latency low. Client-side fetching would cause visible loading states for each card. Suspense boundaries would add complexity for minimal visual benefit on a page that loads fast.
**Alternatives rejected:**
- Client-side fetching per card: Visible loading jank, more API routes needed.
- Suspense boundaries: Over-engineered for the data volume.

#### Decision 4: Home page GSC check
**Chose:** Skip GSC link checks on the home page, show `--` in the Analytics column.
**Why:** `getAllFoundationDocs` makes 6 serial Redis GET calls per project (one per doc type). For 20 projects that's ~120 Redis calls on the home page load. Adding GSC link checks would add another N calls for marginal UX benefit. The home page's Analytics column provides minimal value compared to the project dashboard's Performance card, which does show GSC data. The design doc's mockup shows `Active` vs `--` for analytics, but since we can't check GSC links without N+1, we show `--` consistently and let the Performance card on the dashboard tell the full story. If foundation doc loading becomes slow, add a `project_summary:{ideaId}` cache key.
**Alternatives rejected:**
- Check all GSC links: Adds N+1 Redis calls for marginal UX benefit on the home page.
- Batch check: No batch GSC link API exists; would need to implement one.

#### Decision 5: Collapsible analysis
**Chose:** Client component with `useState` + CSS `max-height` transition.
**Why:** Matches the mockup's interaction pattern (gradient fade, toggle button, smooth animation). The design doc specifically mentions this pattern: "use `max-height: none` for the expanded state rather than a fixed pixel value." Using `useState` is the simplest React approach for toggle state. CSS-only approaches (checkbox hack, details/summary) either lack animation control or have browser inconsistencies.
**Alternatives rejected:**
- HTML details/summary: No smooth animation, inconsistent browser styling.
- CSS-only checkbox: Hacky, harder to maintain, no gradient fade support.

#### Decision 6: Nav-utils orphaned pages
**Chose:** `isActive()` returns `false` for all old routes (`/analysis`, `/foundation`, `/website`, etc.).
**Why:** These pages are intentionally orphaned from navigation per the design doc. No nav tab should highlight when visiting them. This is the cleanest implementation — the function only knows about the 3 new routes. If a user directly navigates to `/analysis`, no tab lights up, which correctly communicates "you're on a page not in the main nav."
**Alternatives rejected:**
- Keep backward compatibility: Would mean 3 tabs try to own routes they shouldn't, causing confusion.

---

Plan complete and saved to `docs/plans/2026-02-16-nav-redesign-plan.md` (committed to main).

## Next Steps

### Option A: Interactive execution (smaller plans)
Copy into a new Claude Code session:
> `cd /Users/ericpage/software/epch-projects/.worktrees/nav-redesign` then use `/executing-plans` to execute `/Users/ericpage/software/epch-projects/docs/plans/2026-02-16-nav-redesign-plan.md`.

### Option B: Ralph loop execution (larger plans)
Run from the worktree directory:
```bash
cd /Users/ericpage/software/epch-projects/.worktrees/nav-redesign && rm -f .ralph-done && while :; do claude -p "$(cat ~/.claude/ralph_loops/EXECUTE-PLAN.md)

Plan: /Users/ericpage/software/epch-projects/docs/plans/2026-02-16-nav-redesign-plan.md
Worktree: /Users/ericpage/software/epch-projects/.worktrees/nav-redesign" && [ -f .ralph-done ] && rm .ralph-done && break; done
```
