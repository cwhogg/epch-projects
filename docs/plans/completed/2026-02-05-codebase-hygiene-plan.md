# Codebase Hygiene Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Improve codebase safety, eliminate duplication, centralize configuration, improve loading performance, fix data fetching waste, add error observability, and normalize design tokens — all without changing behavior.

**Architecture:** Mechanical refactoring pass. Extract shared utilities, centralize config, add test coverage for pure functions, swap font loading strategy, and normalize inline styles to CSS variables. Every change is additive or mechanical replacement — no behavioral changes.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Tailwind CSS 4, Upstash Redis, Anthropic SDK, OpenAI SDK, `next/font/google`, `@googleapis/searchconsole`

**Task Dependencies:** Tasks 1-2 are independent. Tasks 3-8 (tests) are independent of each other but should run before refactoring tasks. Tasks 9-12 (consolidation) should run in order. Task 13 (config) depends on Tasks 9-12 completing first for clean diffs. Task 14 before Task 19 (both touch `globals.css`). Tasks 15-16 are independent. Task 17 depends on Task 12 (`buildLeaderboard`). Task 18 is independent. Task 19 should run last among the code changes. Task 20 is final verification.

**Files touched by multiple tasks (execute in task order):**
- `src/lib/seo-analysis.ts` → Tasks 7, 10, 11, 13
- `src/lib/content-agent.ts` → Tasks 10, 11, 13
- `src/lib/painted-door-agent.ts` → Tasks 10, 11, 13
- `src/lib/db.ts` → Tasks 9, 11, 12
- `src/lib/data.ts` → Tasks 8, 11, 12
- `src/lib/github-publish.ts` → Tasks 5, 11
- `src/app/globals.css` → Tasks 14, 19
- `src/app/analyses/[id]/analytics/page.tsx` → Tasks 11, 15, 18, 19

---

### Task 1: Safety Nets — `.gitignore` and `npm audit fix`

**Files:**
- Modify: `.gitignore`
- Modify: `package.json` (via npm)

**Step 1: Add `.env*` patterns to `.gitignore`**

Add to the end of `.gitignore`:

```
# Environment
.env
.env.*
.env.local
```

**Step 2: Verify no `.env` files are tracked**

Run: `git ls-files '*.env*'`
Expected: No output (no env files tracked)

**Step 3: Run `npm audit fix`**

Run: `npm audit fix`
Expected: Updates `next` from `16.1.4` to latest patch. Review output for breaking changes.

**Step 4: Verify build still works**

Run: `npm run build`
Expected: Build succeeds with no new errors.

**Step 5: Commit**

```bash
git add .gitignore package.json package-lock.json
git commit -m "chore: add .env to gitignore and patch Next.js CVEs"
```

---

### Task 2: Install Vitest and Configure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Step 1: Install vitest**

Run: `npm install -D vitest`

**Step 2: Create vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**Step 3: Add test script to package.json**

Add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 4: Create a smoke test to verify setup**

Create `src/lib/__tests__/setup-smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

**Step 5: Run test to verify setup works**

Run: `npm test`
Expected: 1 test passes.

**Step 6: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/lib/__tests__/setup-smoke.test.ts
git commit -m "chore: install vitest and configure test runner"
```

---

### Task 3: Tests for Score Parsers (research-agent.ts)

The functions `parseScores`, `parseRecommendation`, `parseConfidence`, `parseRisks`, `parseSummary` are defined at lines 201-340 of `src/lib/research-agent.ts` and are NOT currently exported. They parse structured data from LLM markdown output via regex.

**Files:**
- Modify: `src/lib/research-agent.ts` (export the parser functions)
- Create: `src/lib/__tests__/research-agent-parsers.test.ts`

**Step 1: Export the parser functions**

In `src/lib/research-agent.ts`, change the five function declarations from:

```typescript
function parseScores(content: string): AnalysisScores {
```

to:

```typescript
export function parseScores(content: string): AnalysisScores {
```

Do the same for `parseRecommendation` (line 255), `parseConfidence` (line 272), `parseRisks` (line 289), and `parseSummary` (line 322).

**Step 2: Write retroactive tests for existing functions**

Create `src/lib/__tests__/research-agent-parsers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  parseScores,
  parseRecommendation,
  parseConfidence,
  parseRisks,
  parseSummary,
} from '../research-agent';

// -- parseScores --

describe('parseScores', () => {
  it('extracts scores from a standard markdown table', () => {
    const content = `
| Dimension | Score |
|-----------|-------|
| SEO Opportunity | 8/10 |
| Competitive Landscape | 6/10 |
| Willingness to Pay | 7/10 |
| Differentiation Potential | 9/10 |
| Expertise Alignment | 5/10 |
`;
    const scores = parseScores(content);
    expect(scores.seoOpportunity).toBe(8);
    expect(scores.competitiveLandscape).toBe(6);
    expect(scores.willingnessToPay).toBe(7);
    expect(scores.differentiationPotential).toBe(9);
    expect(scores.expertiseAlignment).toBe(5);
    expect(scores.overall).toBeTypeOf('number');
  });

  it('returns all nulls when no scores found', () => {
    const scores = parseScores('No scores here at all');
    expect(scores.seoOpportunity).toBeNull();
    expect(scores.competitiveLandscape).toBeNull();
    expect(scores.overall).toBeNull();
  });

  it('handles partial scores (only some dimensions present)', () => {
    const content = '| SEO Opportunity | 7/10 |\n| Willingness to Pay | 5/10 |';
    const scores = parseScores(content);
    expect(scores.seoOpportunity).toBe(7);
    expect(scores.willingnessToPay).toBe(5);
    expect(scores.competitiveLandscape).toBeNull();
  });

  it('handles two-column table format (dimension | score)', () => {
    const content = `
| Dimension | Score |
|-----------|-------|
| SEO Opportunity | 8/10 |
| Competitive Landscape | 4/10 |
`;
    const scores = parseScores(content);
    expect(scores.seoOpportunity).toBe(8);
    expect(scores.competitiveLandscape).toBe(4);
  });
});

// -- parseRecommendation --

describe('parseRecommendation', () => {
  it('extracts Tier 1', () => {
    expect(parseRecommendation('OVERALL RECOMMENDATION: Tier 1')).toBe('Tier 1');
  });

  it('extracts Tier 2', () => {
    expect(parseRecommendation('RECOMMENDATION: Tier 2')).toBe('Tier 2');
  });

  it('extracts Tier 3', () => {
    expect(parseRecommendation('OVERALL RECOMMENDATION: Tier 3')).toBe('Tier 3');
  });

  it('returns Incomplete when no tier found', () => {
    expect(parseRecommendation('No recommendation here')).toBe('Incomplete');
  });

  it('extracts Incomplete explicitly', () => {
    expect(parseRecommendation('RECOMMENDATION: Incomplete')).toBe('Incomplete');
  });

  it('finds tier mentions anywhere in text as fallback', () => {
    expect(parseRecommendation('Based on analysis, this is a Tier 1 idea.')).toBe('Tier 1');
  });
});

// -- parseConfidence --

describe('parseConfidence', () => {
  it('extracts High confidence', () => {
    expect(parseConfidence('CONFIDENCE: High')).toBe('High');
  });

  it('extracts Medium confidence', () => {
    expect(parseConfidence('CONFIDENCE: Medium')).toBe('Medium');
  });

  it('extracts Low confidence', () => {
    expect(parseConfidence('CONFIDENCE: Low')).toBe('Low');
  });

  it('returns Unknown when no confidence found', () => {
    expect(parseConfidence('No confidence info')).toBe('Unknown');
  });

  it('uses the last match when multiple confidence lines exist', () => {
    const content = 'CONFIDENCE: Low\nSome text\nCONFIDENCE: High';
    expect(parseConfidence(content)).toBe('High');
  });

  it('handles case-insensitive input', () => {
    expect(parseConfidence('confidence: high')).toBe('High');
  });
});

// -- parseRisks --

describe('parseRisks', () => {
  it('extracts bullet-pointed risks from KEY RISKS section', () => {
    const content = `KEY RISKS:
- Market is saturated with established players
- Regulatory compliance will be expensive
- Customer acquisition cost could be high
`;
    const risks = parseRisks(content);
    expect(risks.length).toBe(3);
    expect(risks[0]).toContain('Market is saturated');
  });

  it('returns empty array when no risks section', () => {
    expect(parseRisks('No risks here')).toEqual([]);
  });

  it('limits to 5 risks', () => {
    const content = `KEY RISKS:
- Risk one is described here
- Risk two is described here
- Risk three is described here
- Risk four is described here
- Risk five is described here
- Risk six is described here
- Risk seven is described here
`;
    const risks = parseRisks(content);
    expect(risks.length).toBeLessThanOrEqual(5);
  });

  it('filters out short bullet points (< 10 chars)', () => {
    const content = `KEY RISKS:
- Short
- This risk is long enough to pass the filter
`;
    const risks = parseRisks(content);
    expect(risks.length).toBe(1);
  });
});

// -- parseSummary --

describe('parseSummary', () => {
  it('extracts ONE-LINE SUMMARY', () => {
    const content = 'ONE-LINE SUMMARY: This is a promising B2B SaaS idea for healthcare.';
    expect(parseSummary(content)).toBe('This is a promising B2B SaaS idea for healthcare.');
  });

  it('falls back to Summary section', () => {
    const content = `Summary:

This product targets a niche market with high potential.`;
    expect(parseSummary(content)).toContain('niche market');
  });

  it('falls back to OVERALL RECOMMENDATION line', () => {
    const content = 'OVERALL RECOMMENDATION: Tier 1 — pursue aggressively';
    expect(parseSummary(content)).toContain('Tier 1');
  });

  it('returns empty string when nothing matches', () => {
    expect(parseSummary('Random content with no markers')).toBe('');
  });
});
```

**Step 3: Run tests to verify they pass**

Run: `npm test -- src/lib/__tests__/research-agent-parsers.test.ts`
Expected: All tests pass. These are retroactive tests — the functions already exist, we just exported them. If a test fails, it means the test input doesn't match the actual regex patterns. Read the source function body and fix the test input to match.

**Step 4: Commit**

```bash
git add src/lib/research-agent.ts src/lib/__tests__/research-agent-parsers.test.ts
git commit -m "test: add tests for research-agent score parsers"
```

---

### Task 4: Tests for Publish Pipeline (findNextPiecePerTarget)

The function `findNextPiecePerTarget` is at lines 23-72 of `src/lib/publish-pipeline.ts`. It's already exported. It depends on `getAllContentCalendars`, `getContentPieces`, and `isPiecePublished` from `./db`.

**Files:**
- Create: `src/lib/__tests__/publish-pipeline.test.ts`

**Step 1: Write tests with mocked DB dependencies**

Create `src/lib/__tests__/publish-pipeline.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findNextPiecePerTarget } from '../publish-pipeline';

// Mock the db module
vi.mock('../db', () => ({
  getAllContentCalendars: vi.fn(),
  getContentPieces: vi.fn(),
  isPiecePublished: vi.fn(),
  markPiecePublished: vi.fn(),
  addPublishLogEntry: vi.fn(),
  saveContentPiece: vi.fn(),
}));

import {
  getAllContentCalendars,
  getContentPieces,
  isPiecePublished,
} from '../db';

const mockGetAllCalendars = vi.mocked(getAllContentCalendars);
const mockGetContentPieces = vi.mocked(getContentPieces);
const mockIsPiecePublished = vi.mocked(isPiecePublished);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('findNextPiecePerTarget', () => {
  it('returns empty map when no calendars exist', async () => {
    mockGetAllCalendars.mockResolvedValue([]);
    const result = await findNextPiecePerTarget();
    expect(result.size).toBe(0);
  });

  it('skips inactive calendars', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        active: false,
        targetId: 'site-1',
        pieces: [{ id: 'p1', title: 'Test', slug: 'test', type: 'blog-post', status: 'complete', priority: 1 }],
      } as any,
    ]);
    const result = await findNextPiecePerTarget();
    expect(result.size).toBe(0);
  });

  it('skips already-published pieces', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        targetId: 'site-1',
        pieces: [{ id: 'p1', title: 'Test', slug: 'test', type: 'blog-post', status: 'complete', priority: 1 }],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockResolvedValue(true);
    const result = await findNextPiecePerTarget();
    expect(result.size).toBe(0);
  });

  it('skips pieces with status generating', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        targetId: 'site-1',
        pieces: [{ id: 'p1', title: 'Test', slug: 'test', type: 'blog-post', status: 'generating', priority: 1 }],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockResolvedValue(false);
    const result = await findNextPiecePerTarget();
    expect(result.size).toBe(0);
  });

  it('skips landing-page type', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        targetId: 'site-1',
        pieces: [{ id: 'p1', title: 'Test', slug: 'test', type: 'landing-page', status: 'complete', priority: 1 }],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockResolvedValue(false);
    const result = await findNextPiecePerTarget();
    expect(result.size).toBe(0);
  });

  it('prioritizes complete pieces over incomplete', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        targetId: 'site-1',
        pieces: [
          { id: 'p1', title: 'Incomplete', slug: 'incomplete', type: 'blog-post', status: 'pending', priority: 1 },
          { id: 'p2', title: 'Complete', slug: 'complete', type: 'blog-post', status: 'complete', priority: 2 },
        ],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockResolvedValue(false);
    const result = await findNextPiecePerTarget();
    expect(result.get('site-1')?.piece.id).toBe('p2');
  });

  it('uses priority as tiebreaker within same status', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        targetId: 'site-1',
        pieces: [
          { id: 'p1', title: 'Low priority', slug: 'low', type: 'blog-post', status: 'complete', priority: 3 },
          { id: 'p2', title: 'High priority', slug: 'high', type: 'blog-post', status: 'complete', priority: 1 },
        ],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockResolvedValue(false);
    const result = await findNextPiecePerTarget();
    expect(result.get('site-1')?.piece.id).toBe('p2');
  });

  it('returns one candidate per target site', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        targetId: 'site-a',
        pieces: [{ id: 'p1', title: 'A', slug: 'a', type: 'blog-post', status: 'complete', priority: 1 }],
      } as any,
      {
        ideaId: 'idea-2',
        targetId: 'site-b',
        pieces: [{ id: 'p2', title: 'B', slug: 'b', type: 'blog-post', status: 'complete', priority: 1 }],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockResolvedValue(false);
    const result = await findNextPiecePerTarget();
    expect(result.size).toBe(2);
    expect(result.has('site-a')).toBe(true);
    expect(result.has('site-b')).toBe(true);
  });

  it('filters calendars by ideaId when provided', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        targetId: 'site-a',
        pieces: [{ id: 'p1', title: 'A', slug: 'a', type: 'blog-post', status: 'complete', priority: 1 }],
      } as any,
      {
        ideaId: 'idea-2',
        targetId: 'site-b',
        pieces: [{ id: 'p2', title: 'B', slug: 'b', type: 'blog-post', status: 'complete', priority: 1 }],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockResolvedValue(false);
    const result = await findNextPiecePerTarget('idea-1');
    expect(result.size).toBe(1);
    expect(result.has('site-a')).toBe(true);
    expect(result.has('site-b')).toBe(false);
  });

  it('defaults targetId to secondlook', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        pieces: [{ id: 'p1', title: 'A', slug: 'a', type: 'blog-post', status: 'complete', priority: 1 }],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockResolvedValue(false);
    const result = await findNextPiecePerTarget();
    expect(result.has('secondlook')).toBe(true);
  });

  // Error path: getAllContentCalendars fails
  it('propagates error when getAllContentCalendars rejects', async () => {
    mockGetAllCalendars.mockRejectedValue(new Error('Redis connection failed'));
    await expect(findNextPiecePerTarget()).rejects.toThrow('Redis connection failed');
  });

  // Error path: isPiecePublished fails
  it('propagates error when isPiecePublished rejects', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        targetId: 'site-1',
        pieces: [{ id: 'p1', title: 'A', slug: 'a', type: 'blog-post', status: 'complete', priority: 1 }],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockRejectedValue(new Error('Redis timeout'));
    await expect(findNextPiecePerTarget()).rejects.toThrow('Redis timeout');
  });
});
```

**Step 2: Run tests**

Run: `npm test -- src/lib/__tests__/publish-pipeline.test.ts`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add src/lib/__tests__/publish-pipeline.test.ts
git commit -m "test: add tests for publish pipeline candidate selection"
```

---

### Task 5: Tests for Content Transforms (github-publish.ts)

The functions `enrichFrontmatter` (line 15, exported) and `flipDraftToPublished` (line 11, not exported) are in `src/lib/github-publish.ts`. They are pure regex transforms on markdown strings.

**Files:**
- Modify: `src/lib/github-publish.ts` (export `flipDraftToPublished` and `getFilename`)
- Create: `src/lib/__tests__/github-publish.test.ts`

**Step 1: Export `flipDraftToPublished` and `getFilename`**

In `src/lib/github-publish.ts`, change:

```typescript
function flipDraftToPublished(markdown: string): string {
```

to:

```typescript
export function flipDraftToPublished(markdown: string): string {
```

And change:

```typescript
function getFilename(_type: ContentType, slug: string): string {
```

to:

```typescript
export function getFilename(_type: ContentType, slug: string): string {
```

**Step 2: Write tests**

Create `src/lib/__tests__/github-publish.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { enrichFrontmatter, flipDraftToPublished, getFilename } from '../github-publish';
import type { ContentType } from '@/types';

describe('flipDraftToPublished', () => {
  it('replaces status: draft with status: published', () => {
    const md = `---
title: "Test Post"
status: draft
---
# Content`;
    expect(flipDraftToPublished(md)).toContain('status: published');
    expect(flipDraftToPublished(md)).not.toContain('status: draft');
  });

  it('leaves already-published content unchanged', () => {
    const md = `---
status: published
---`;
    expect(flipDraftToPublished(md)).toContain('status: published');
  });

  it('does not touch non-status draft mentions', () => {
    const md = `---
status: draft
---
# Draft ideas for the future`;
    const result = flipDraftToPublished(md);
    expect(result).toContain('Draft ideas');
    expect(result).toContain('status: published');
  });
});

describe('enrichFrontmatter', () => {
  const target = {
    id: 'test',
    repoOwner: 'owner',
    repoName: 'repo',
    branch: 'main',
    pathMap: { 'blog-post': 'content/blog', comparison: 'content/compare', faq: 'content/faq' },
    siteUrl: 'https://example.com',
  } as any;

  it('adds canonicalUrl to frontmatter', () => {
    const md = `---
title: "Test"
generatedAt: "2026-01-01T00:00:00Z"
---
# Content`;
    const result = enrichFrontmatter(md, target, 'blog-post', 'test-slug');
    expect(result).toContain('canonicalUrl: "https://example.com/blog/test-slug"');
  });

  it('replaces generatedAt with date', () => {
    const md = `---
title: "Test"
generatedAt: "2026-01-01T00:00:00Z"
---`;
    const result = enrichFrontmatter(md, target, 'blog-post', 'test-slug');
    expect(result).toContain('date: "');
    expect(result).not.toContain('generatedAt:');
  });

  it('uses /compare path for comparison type', () => {
    const md = `---
title: "Test"
generatedAt: "2026-01-01T00:00:00Z"
---`;
    const result = enrichFrontmatter(md, target, 'comparison', 'x-vs-y');
    expect(result).toContain('canonicalUrl: "https://example.com/compare/x-vs-y"');
  });

  it('uses /faq path for faq type', () => {
    const md = `---
title: "Test"
generatedAt: "2026-01-01T00:00:00Z"
---`;
    const result = enrichFrontmatter(md, target, 'faq', 'common-questions');
    expect(result).toContain('canonicalUrl: "https://example.com/faq/common-questions"');
  });
});

describe('getFilename', () => {
  it('returns slug.md', () => {
    expect(getFilename('blog-post' as ContentType, 'my-post')).toBe('my-post.md');
  });
});
```

**Step 3: Run tests**

Run: `npm test -- src/lib/__tests__/github-publish.test.ts`
Expected: All pass.

**Step 4: Commit**

```bash
git add src/lib/github-publish.ts src/lib/__tests__/github-publish.test.ts
git commit -m "test: add tests for github-publish content transforms"
```

---

### Task 6: Tests for Analytics Pure Functions

The functions `getWeekId` (line 31), `matchUrlToSlug` (line 102), and `detectChanges` (line 182) are in `src/lib/analytics-agent.ts` and are already exported.

**Files:**
- Create: `src/lib/__tests__/analytics-agent.test.ts`

**Step 1: Write tests**

Create `src/lib/__tests__/analytics-agent.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getWeekId, matchUrlToSlug, detectChanges } from '../analytics-agent';

describe('getWeekId', () => {
  it('returns ISO week string format YYYY-Www', () => {
    const result = getWeekId(new Date('2026-01-05'));
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('handles Jan 1 (belongs to previous year week in some years)', () => {
    // Jan 1, 2026 is a Thursday — should be 2026-W01
    const result = getWeekId(new Date('2026-01-01'));
    expect(result).toBe('2026-W01');
  });

  it('handles Dec 31 (may belong to week 1 of next year)', () => {
    // Dec 31, 2026 is a Thursday — should be 2027-W01
    const result = getWeekId(new Date('2026-12-31'));
    expect(result).toBe('2027-W01');
  });

  it('uses current date when no argument provided', () => {
    const result = getWeekId();
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('returns consistent results for same-week dates', () => {
    // Monday and Friday of same week should return same week ID
    const mon = getWeekId(new Date('2026-02-02')); // Monday
    const fri = getWeekId(new Date('2026-02-06')); // Friday
    expect(mon).toBe(fri);
  });
});

describe('matchUrlToSlug', () => {
  it('extracts slug from /blog/some-slug URL', () => {
    expect(matchUrlToSlug('https://example.com/blog/my-article')).toBe('my-article');
  });

  it('extracts slug from deeper path', () => {
    expect(matchUrlToSlug('https://example.com/compare/a-vs-b')).toBe('a-vs-b');
  });

  it('returns null for root URL', () => {
    expect(matchUrlToSlug('https://example.com/')).toBeNull();
  });

  it('returns null for single-segment path', () => {
    expect(matchUrlToSlug('https://example.com/about')).toBeNull();
  });

  it('returns null for invalid URL', () => {
    expect(matchUrlToSlug('not-a-url')).toBeNull();
  });
});

describe('detectChanges', () => {
  const makeSnapshot = (overrides: Record<string, unknown> = {}) => ({
    ideaId: 'idea-1',
    pieceId: 'piece-1',
    slug: 'test-article',
    title: 'Test Article',
    type: 'blog-post' as const,
    weekId: '2026-W05',
    clicks: 10,
    impressions: 100,
    ctr: 0.1,
    position: 15,
    topQueries: [],
    ...overrides,
  });

  it('returns empty array when no changes detected', () => {
    const current = [makeSnapshot()];
    const previous = [makeSnapshot()];
    expect(detectChanges(current, previous)).toEqual([]);
  });

  it('detects first appearance', () => {
    const current = [makeSnapshot({ impressions: 50 })];
    const alerts = detectChanges(current, []);
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('info');
    expect(alerts[0].message).toContain('First appearance');
  });

  it('detects clicks up >= 50%', () => {
    const current = [makeSnapshot({ clicks: 20 })];
    const previous = [makeSnapshot({ clicks: 10 })];
    const alerts = detectChanges(current, previous);
    expect(alerts.some((a) => a.severity === 'positive' && a.metric === 'clicks')).toBe(true);
  });

  it('detects clicks down >= 30%', () => {
    const current = [makeSnapshot({ clicks: 5 })];
    const previous = [makeSnapshot({ clicks: 10 })];
    const alerts = detectChanges(current, previous);
    expect(alerts.some((a) => a.severity === 'warning' && a.metric === 'clicks')).toBe(true);
  });

  it('detects position improved by >= 5', () => {
    const current = [makeSnapshot({ position: 5 })];
    const previous = [makeSnapshot({ position: 15 })];
    const alerts = detectChanges(current, previous);
    expect(alerts.some((a) => a.severity === 'positive' && a.metric === 'position')).toBe(true);
  });

  it('detects position dropped by >= 5', () => {
    const current = [makeSnapshot({ position: 25 })];
    const previous = [makeSnapshot({ position: 15 })];
    const alerts = detectChanges(current, previous);
    expect(alerts.some((a) => a.severity === 'warning' && a.metric === 'position')).toBe(true);
  });

  it('detects traffic lost (had >5 clicks, now 0)', () => {
    const current = [makeSnapshot({ clicks: 0 })];
    const previous = [makeSnapshot({ clicks: 10 })];
    const alerts = detectChanges(current, previous);
    expect(alerts.some((a) => a.message.includes('Traffic lost'))).toBe(true);
  });

  it('ignores low-impression noise', () => {
    const current = [makeSnapshot({ impressions: 3, clicks: 0 })];
    const previous = [makeSnapshot({ impressions: 5, clicks: 1 })];
    const alerts = detectChanges(current, previous);
    expect(alerts).toEqual([]);
  });
});
```

**Step 2: Run tests**

Run: `npm test -- src/lib/__tests__/analytics-agent.test.ts`
Expected: All pass.

**Step 3: Commit**

```bash
git add src/lib/__tests__/analytics-agent.test.ts
git commit -m "test: add tests for analytics pure functions"
```

---

### Task 7: Tests for SEO Logic

Functions in `src/lib/seo-analysis.ts`: `fuzzyMatch` (line 342, not exported), `compareSEOResults` (line 306, exported), `detectContentGap` (line 406, not exported), `validateSEOResult` (line 861, not exported), `parseSEOJSON` (line 825, not exported), `cleanJSONString` (line 815, not exported).

And in `src/lib/seo-knowledge.ts`: `detectVertical` (line 391, exported).

**Files:**
- Modify: `src/lib/seo-analysis.ts` (export `fuzzyMatch`, `cleanJSONString`, `parseSEOJSON`, `validateSEOResult`, `detectContentGap`)
- Create: `src/lib/__tests__/seo-analysis.test.ts`
- Create: `src/lib/__tests__/seo-knowledge.test.ts`

**Step 1: Export helper functions in seo-analysis.ts**

Change the following `function` declarations to `export function`:
- `fuzzyMatch` (line 342)
- `cleanJSONString` (line 815)
- `parseSEOJSON` (line 825)
- `validateSEOResult` (line 861)
- `detectContentGap` (line 406)

**Step 2: Write SEO analysis tests**

Create `src/lib/__tests__/seo-analysis.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  fuzzyMatch,
  cleanJSONString,
  parseSEOJSON,
  validateSEOResult,
  compareSEOResults,
  detectContentGap,
} from '../seo-analysis';

describe('fuzzyMatch', () => {
  it('matches exact keywords', () => {
    expect(fuzzyMatch('seo tools', ['seo tools', 'other keyword'])).toBe(true);
  });

  it('matches when one contains the other', () => {
    expect(fuzzyMatch('seo', ['best seo tools'])).toBe(true);
  });

  it('matches on 60% word overlap', () => {
    expect(fuzzyMatch('best seo tools for startups', ['best seo tools online'])).toBe(true);
  });

  it('returns false for unrelated keywords', () => {
    expect(fuzzyMatch('cooking recipes', ['seo tools'])).toBe(false);
  });

  it('strips non-alphanumeric characters for comparison', () => {
    // The function strips [^a-z0-9 ] but does NOT lowercase (callers pre-lowercase)
    expect(fuzzyMatch('seo tools!', ['seo tools'])).toBe(true);
  });
});

describe('cleanJSONString', () => {
  it('removes trailing commas before }', () => {
    expect(cleanJSONString('{"key": "value",}')).toBe('{"key": "value"}');
  });

  it('removes trailing commas before ]', () => {
    expect(cleanJSONString('["a", "b",]')).toBe('["a", "b"]');
  });

  it('removes single-line comments', () => {
    expect(cleanJSONString('{"key": "value"} // comment')).toBe('{"key": "value"} ');
  });

  it('removes multi-line comments', () => {
    expect(cleanJSONString('{"key": /* comment */ "value"}')).toBe('{"key":  "value"}');
  });
});

describe('parseSEOJSON', () => {
  it('parses valid JSON directly', () => {
    const input = JSON.stringify({
      keywords: [{ keyword: 'test', intentType: 'Informational', estimatedVolume: 'High', estimatedCompetitiveness: 'Low', contentGapHypothesis: 'gap', relevanceToMillionARR: 'High', rationale: 'good' }],
      contentStrategy: { topOpportunities: ['opp1'], recommendedAngle: 'angle', communitySignals: [] },
      difficultyAssessment: { dominantPlayers: [], roomForNewEntrant: true, reasoning: 'room' },
    });
    const result = parseSEOJSON(input);
    expect(result.keywords.length).toBe(1);
    expect(result.keywords[0].keyword).toBe('test');
  });

  it('strips markdown code fences', () => {
    const json = JSON.stringify({
      keywords: [],
      contentStrategy: { topOpportunities: [], recommendedAngle: '', communitySignals: [] },
      difficultyAssessment: { dominantPlayers: [], roomForNewEntrant: false, reasoning: '' },
    });
    const result = parseSEOJSON('```json\n' + json + '\n```');
    expect(result.keywords).toEqual([]);
  });

  it('returns defaults for unparseable text', () => {
    const result = parseSEOJSON('this is not json at all');
    expect(result.keywords).toEqual([]);
    expect(result.contentStrategy.recommendedAngle).toBe('Unable to determine');
  });
});

describe('validateSEOResult', () => {
  it('validates and normalizes enum values', () => {
    const result = validateSEOResult({
      keywords: [{ keyword: 'test', intentType: 'InvalidType', estimatedVolume: 'Invalid', estimatedCompetitiveness: 'Invalid', contentGapHypothesis: 'gap', relevanceToMillionARR: 'Invalid', rationale: 'r' }],
      contentStrategy: {},
      difficultyAssessment: {},
    });
    expect(result.keywords[0].intentType).toBe('Informational');
    expect(result.keywords[0].estimatedVolume).toBe('Unknown');
  });
});

describe('compareSEOResults', () => {
  const makeResult = (keywords: string[]) => ({
    keywords: keywords.map((k) => ({ keyword: k, intentType: 'Informational' as const, estimatedVolume: 'Medium' as const, estimatedCompetitiveness: 'Medium' as const, contentGapHypothesis: '', relevanceToMillionARR: 'Medium' as const, rationale: '' })),
    contentStrategy: { topOpportunities: [], recommendedAngle: '', communitySignals: [] },
    difficultyAssessment: { dominantPlayers: [], roomForNewEntrant: false, reasoning: '' },
  });

  it('returns null when openai result is null', () => {
    expect(compareSEOResults(makeResult(['kw1']), null)).toBeNull();
  });

  it('identifies agreed and unique keywords', () => {
    const result = compareSEOResults(makeResult(['shared', 'claude-only']), makeResult(['shared', 'openai-only']));
    expect(result).not.toBeNull();
    expect(result!.agreedKeywords).toContain('shared');
    expect(result!.claudeUniqueKeywords).toContain('claude-only');
    expect(result!.openaiUniqueKeywords).toContain('openai-only');
  });
});
```

**Step 3: Write SEO knowledge tests**

Create `src/lib/__tests__/seo-knowledge.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectVertical } from '../seo-knowledge';

describe('detectVertical', () => {
  it('detects b2b-saas from business keywords', () => {
    const idea = { name: 'SaaS Analytics Dashboard', description: 'B2B automation tool for enterprise teams', id: '1', status: 'pending' as const, createdAt: '' };
    expect(detectVertical(idea as any)).toBe('b2b-saas');
  });

  it('detects healthcare-consumer from health keywords', () => {
    const idea = { name: 'Sleep Tracker', description: 'Mental health and wellness tracking for patients', id: '1', status: 'pending' as const, createdAt: '' };
    expect(detectVertical(idea as any)).toBe('healthcare-consumer');
  });

  it('defaults to general-niche', () => {
    const idea = { name: 'Recipe Sharing App', description: 'Share recipes with friends', id: '1', status: 'pending' as const, createdAt: '' };
    expect(detectVertical(idea as any)).toBe('general-niche');
  });
});
```

**Step 4: Run tests**

Run: `npm test -- src/lib/__tests__/seo-analysis.test.ts src/lib/__tests__/seo-knowledge.test.ts`
Expected: All pass.

**Step 5: Commit**

```bash
git add src/lib/seo-analysis.ts src/lib/__tests__/seo-analysis.test.ts src/lib/__tests__/seo-knowledge.test.ts
git commit -m "test: add tests for SEO analysis and vertical detection"
```

---

### Task 8: Tests for Markdown Parsing (data.ts)

The function `parseAnalysisFromMarkdown` at line 71 of `src/lib/data.ts` is not exported. It uses 5 regex patterns to extract scores, confidence, recommendation, summary, and risks from markdown files.

**Files:**
- Modify: `src/lib/data.ts` (export `parseAnalysisFromMarkdown`)
- Create: `src/lib/__tests__/data-parsers.test.ts`

**Step 1: Export `parseAnalysisFromMarkdown`**

In `src/lib/data.ts` line 71, change:

```typescript
function parseAnalysisFromMarkdown(ideaId: string, content: string): Partial<Analysis> {
```

to:

```typescript
export function parseAnalysisFromMarkdown(ideaId: string, content: string): Partial<Analysis> {
```

**Step 2: Write tests**

Create `src/lib/__tests__/data-parsers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseAnalysisFromMarkdown } from '../data';

describe('parseAnalysisFromMarkdown', () => {
  const sampleMarkdown = `# Analysis: Test Idea

## Summary

This is a promising niche with good SEO potential.

---

| Dimension | Weight | Score/10 | Reasoning |
|-----------|--------|----------|-----------|
| SEO Opportunity | 50% | 8/10 | Good content gaps |
| Competitive Landscape | 15% | 6/10 | Moderate competition |
| Willingness to Pay | 20% | 7/10 | Proven price points |
| Differentiation Potential | 10% | 5/10 | Some unique angles |
| Expertise Alignment | 5% | 9/10 | Strong fit |

Confidence: High

OVERALL RECOMMENDATION: Tier 1

## Key Risks

1. **Market saturation** in adjacent categories
2. **Regulatory changes** could impact growth
3. **Customer acquisition** costs may be high
`;

  it('extracts all five scores', () => {
    const result = parseAnalysisFromMarkdown('test', sampleMarkdown);
    expect(result.scores?.seoOpportunity).toBe(8);
    expect(result.scores?.competitiveLandscape).toBe(6);
    expect(result.scores?.willingnessToPay).toBe(7);
    expect(result.scores?.differentiationPotential).toBe(5);
    expect(result.scores?.expertiseAlignment).toBe(9);
  });

  it('extracts confidence', () => {
    const result = parseAnalysisFromMarkdown('test', sampleMarkdown);
    expect(result.confidence).toBe('High');
  });

  it('extracts recommendation tier', () => {
    const result = parseAnalysisFromMarkdown('test', sampleMarkdown);
    expect(result.recommendation).toBe('Tier 1');
  });

  it('extracts risks', () => {
    const result = parseAnalysisFromMarkdown('test', sampleMarkdown);
    expect(result.risks?.length).toBeGreaterThan(0);
    expect(result.risks?.[0]).toContain('Market saturation');
  });

  it('extracts summary', () => {
    const result = parseAnalysisFromMarkdown('test', sampleMarkdown);
    expect(result.summary).toContain('promising niche');
  });

  it('returns defaults for empty content', () => {
    const result = parseAnalysisFromMarkdown('test', '');
    expect(result.confidence).toBe('Unknown');
    expect(result.recommendation).toBe('Incomplete');
    expect(result.risks).toEqual([]);
  });
});
```

**Step 3: Run tests**

Run: `npm test -- src/lib/__tests__/data-parsers.test.ts`
Expected: All pass.

**Step 4: Run the full test suite**

Run: `npm test`
Expected: All tests across all test files pass.

**Step 5: Commit**

```bash
git add src/lib/data.ts src/lib/__tests__/data-parsers.test.ts
git commit -m "test: add tests for markdown analysis parser"
```

---

### Task 9: Shared Redis Module (`lib/redis.ts`)

Extract the duplicated `getRedis()` and `parseValue<T>()` from `db.ts` (lines 6-24), `analytics-db.ts`, and `painted-door-db.ts` (lines 6-25) into a shared module.

**Files:**
- Create: `src/lib/redis.ts`
- Modify: `src/lib/db.ts`
- Modify: `src/lib/analytics-db.ts`
- Modify: `src/lib/painted-door-db.ts`

**Step 1: Create `src/lib/redis.ts`**

```typescript
import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error('Redis not configured: missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
    }
    redis = new Redis({ url, token });
  }
  return redis;
}

export function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function parseValue<T>(value: unknown): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }
  return value as T;
}
```

**Step 2: Update `src/lib/db.ts`**

Replace the local `getRedis`, `parseValue`, and `isRedisConfigured` definitions (approximately lines 1-24) with imports from the shared module:

```typescript
import { getRedis, parseValue, isRedisConfigured } from './redis';
```

Remove the local `redis` variable, `getRedis()` function, `parseValue()` function, and `isRedisConfigured()` function. Keep all remaining exports unchanged (re-export `isRedisConfigured` if needed for backward compatibility):

```typescript
export { isRedisConfigured } from './redis';
```

**Step 3: Update `src/lib/analytics-db.ts`**

Same pattern — replace local `getRedis`/`parseValue` with imports from `./redis`. Remove the local definitions.

**Step 4: Update `src/lib/painted-door-db.ts`**

Same pattern — replace local `getRedis`/`parseValue` with imports from `./redis`. Remove the local definitions. Remove the local `redis` variable.

**Step 5: Build and verify**

Run: `npm run build`
Expected: Build succeeds. All imports resolve. No runtime changes — same Redis instance used everywhere.

**Step 6: Run tests**

Run: `npm test`
Expected: All existing tests still pass.

**Step 7: Commit**

```bash
git add src/lib/redis.ts src/lib/db.ts src/lib/analytics-db.ts src/lib/painted-door-db.ts
git commit -m "refactor: extract shared Redis module from 3 DB files"
```

---

### Task 10: Shared LLM Utilities (`lib/llm-utils.ts`)

Extract duplicated JSON-from-LLM parsing from `seo-analysis.ts` (`parseSEOJSON`/`cleanJSONString`), `painted-door-agent.ts` (`parseJsonResponse`), and `content-agent.ts` (inline JSON parsing).

**Files:**
- Create: `src/lib/llm-utils.ts`
- Modify: `src/lib/seo-analysis.ts`
- Modify: `src/lib/painted-door-agent.ts`
- Modify: `src/lib/content-agent.ts`
- Modify: `src/lib/agent-tools/content.ts`
- Modify: `src/lib/agent-tools/website.ts`

**Step 1: Create `src/lib/llm-utils.ts`**

```typescript
/**
 * Strip markdown code fences, attempt JSON.parse, fall back to regex extraction.
 */
export function parseLLMJson<T>(text: string): T {
  let jsonStr = text.trim();

  // Strip markdown code fences if present
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Attempt 1: direct parse
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // Attempt 2: clean common LLM mistakes then parse
    try {
      return JSON.parse(cleanJSONString(jsonStr)) as T;
    } catch {
      // Attempt 3: extract JSON object from surrounding text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(cleanJSONString(jsonMatch[0])) as T;
        } catch {
          // Fall through
        }
      }
    }
    throw new Error('Failed to parse JSON from LLM response');
  }
}

/**
 * Strip trailing commas and comments from JSON strings (common LLM mistakes).
 */
export function cleanJSONString(str: string): string {
  // Remove trailing commas before } or ]
  let cleaned = str.replace(/,\s*([\]}])/g, '$1');
  // Remove single-line comments
  cleaned = cleaned.replace(/\/\/[^\n]*/g, '');
  // Remove multi-line comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  return cleaned;
}
```

**Step 2: Update `src/lib/painted-door-agent.ts`**

Replace `parseJsonResponse` (lines 75-92) with an import:

```typescript
import { parseLLMJson } from './llm-utils';
```

Then replace all calls to `parseJsonResponse(text)` with `parseLLMJson(text)`. Delete the local `parseJsonResponse` function.

**Step 3: Update `src/lib/content-agent.ts`**

Import `parseLLMJson` from `./llm-utils`. Replace the inline JSON parsing patterns (the try/catch blocks at ~lines 143-160 and ~lines 231-245 that strip code fences and try JSON.parse with fallback regex) with calls to `parseLLMJson(text)`.

**Step 4: Update `src/lib/seo-analysis.ts`**

Import `cleanJSONString` from `./llm-utils`. Remove the local `cleanJSONString` function (line 815). The `parseSEOJSON` function stays in `seo-analysis.ts` since it has SEO-specific validation logic, but it now imports `cleanJSONString` from the shared module.

**Step 5: Update agent tools**

In `src/lib/agent-tools/content.ts` and `src/lib/agent-tools/website.ts`, replace their local JSON parsing patterns with `parseLLMJson` from `../llm-utils`.

**Step 6: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 7: Run tests**

Run: `npm test`
Expected: All tests pass.

**Step 8: Commit**

```bash
git add src/lib/llm-utils.ts src/lib/seo-analysis.ts src/lib/painted-door-agent.ts src/lib/content-agent.ts src/lib/agent-tools/content.ts src/lib/agent-tools/website.ts
git commit -m "refactor: extract shared LLM JSON parsing utilities"
```

---

### Task 11: Shared General Utilities (`lib/utils.ts`)

Extract duplicated utility functions: `slugify`, `fuzzyMatchPair`, `formatScoreName`.

Note: `getFilename` is NOT extracted — the two versions have different behavior. `github-publish.ts` returns `${slug}.md` (files live in type-specific directories), while `content-agent.ts` returns type-prefixed names like `blog-${slug}.md` (flat directory). These serve different purposes and should stay separate.

**Files:**
- Create: `src/lib/utils.ts`
- Modify: `src/lib/content-agent.ts` (remove `slugifyName`)
- Modify: `src/lib/painted-door-agent.ts` (remove `slugify`)
- Modify: `src/lib/agent-tools/website.ts` (remove `slugify`)
- Modify: `src/lib/seo-analysis.ts` (update `fuzzyMatch` to use `fuzzyMatchPair`)
- Modify: `src/app/analyses/[id]/analytics/page.tsx` (replace `fuzzyMatchKeyword` with `fuzzyMatchPair`)
- Modify: `src/lib/db.ts` (remove `formatScoreName`)
- Modify: `src/lib/data.ts` (remove `formatScoreName`)
- Create: `src/lib/__tests__/utils.test.ts`

**Step 1: Create `src/lib/utils.ts`**

```typescript
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Core 1-to-1 fuzzy comparison: normalize, check containment, 60% word overlap.
 */
export function fuzzyMatchPair(a: string, b: string): boolean {
  const normalizedA = a.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const normalizedB = b.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (normalizedA === normalizedB) return true;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return true;
  const words1 = new Set(normalizedA.split(/\s+/));
  const words2 = new Set(normalizedB.split(/\s+/));
  const intersection = [...words1].filter((w) => words2.has(w));
  const minSize = Math.min(words1.size, words2.size);
  return minSize > 0 && intersection.length / minSize >= 0.6;
}

export function formatScoreName(key: string): string {
  const names: Record<string, string> = {
    seoOpportunity: 'SEO',
    competitiveLandscape: 'Competition',
    willingnessToPay: 'WTP',
    differentiationPotential: 'Differentiation',
    expertiseAlignment: 'Expertise',
  };
  return names[key] || key;
}
```

**Step 2: Write tests for utils**

Create `src/lib/__tests__/utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { slugify, fuzzyMatchPair, formatScoreName } from '../utils';

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(slugify('Hello! @World#')).toBe('hello-world');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('---hello---')).toBe('hello');
  });
});

describe('fuzzyMatchPair', () => {
  it('matches exact strings', () => {
    expect(fuzzyMatchPair('seo tools', 'seo tools')).toBe(true);
  });

  it('matches when one contains the other', () => {
    expect(fuzzyMatchPair('seo', 'best seo tools')).toBe(true);
  });

  it('matches on 60% word overlap', () => {
    expect(fuzzyMatchPair('best seo tools for startups', 'best seo tools online')).toBe(true);
  });

  it('returns false for unrelated strings', () => {
    expect(fuzzyMatchPair('cooking recipes', 'seo tools')).toBe(false);
  });
});

describe('formatScoreName', () => {
  it('maps seoOpportunity to SEO', () => {
    expect(formatScoreName('seoOpportunity')).toBe('SEO');
  });

  it('returns key as-is for unknown keys', () => {
    expect(formatScoreName('unknown')).toBe('unknown');
  });
});

```

**Step 3: Update consumer files**

- `content-agent.ts`: Replace local `slugifyName` (line 419) with `import { slugify } from './utils'`. The local `getFilename` stays — it has different behavior (type-prefixed names) from the one in `github-publish.ts`.
- `painted-door-agent.ts`: Replace local `slugify` (line 68) with import from `./utils`.
- `agent-tools/website.ts`: Replace local `slugify` (line 38) with `import { slugify } from '../utils'`.
- `seo-analysis.ts`: Replace local `fuzzyMatch` body to use `fuzzyMatchPair`:
  ```typescript
  import { fuzzyMatchPair } from './utils';
  function fuzzyMatch(keyword: string, list: string[]): boolean {
    return list.some((item) => fuzzyMatchPair(keyword, item));
  }
  ```
  Keep the `fuzzyMatch` wrapper function signature as-is since it's used throughout the file.
- `analytics/page.tsx`: Replace local `fuzzyMatchKeyword` (line 37) with `import { fuzzyMatchPair } from '@/lib/utils'` and update the two call sites.
- `db.ts`: Remove local `formatScoreName` (line 165), import from `./utils`.
- `data.ts`: Remove local `formatScoreName` (line 270), import from `./utils`.

**Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Run tests**

Run: `npm test`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/lib/utils.ts src/lib/__tests__/utils.test.ts src/lib/content-agent.ts src/lib/painted-door-agent.ts src/lib/agent-tools/website.ts src/lib/seo-analysis.ts src/app/analyses/[id]/analytics/page.tsx src/lib/db.ts src/lib/data.ts
git commit -m "refactor: extract shared utility functions (slugify, fuzzyMatch, etc.)"
```

---

### Task 12: Shared Leaderboard Logic

Extract the duplicated sorting/mapping from `db.ts` (`getLeaderboardFromDb`, line 176) and `data.ts` (`getLeaderboard`, line 228) into a shared function.

**Files:**
- Modify: `src/lib/utils.ts` (add `buildLeaderboard`)
- Modify: `src/lib/db.ts`
- Modify: `src/lib/data.ts`

**Step 1: Add `buildLeaderboard` to `src/lib/utils.ts`**

```typescript
import { Analysis, LeaderboardEntry } from '@/types';

export function buildLeaderboard(analyses: Analysis[]): LeaderboardEntry[] {
  const sorted = [...analyses].sort((a, b) => {
    const recPriority: Record<string, number> = { 'Tier 1': 0, 'Tier 2': 1, 'Incomplete': 2, 'Tier 3': 3 };
    const aPriority = recPriority[a.recommendation] ?? 2;
    const bPriority = recPriority[b.recommendation] ?? 2;
    if (aPriority !== bPriority) return aPriority - bPriority;
    const confPriority: Record<string, number> = { 'High': 0, 'Medium': 1, 'Low': 2, 'Unknown': 3 };
    return (confPriority[a.confidence] ?? 3) - (confPriority[b.confidence] ?? 3);
  });

  return sorted.map((analysis, index) => {
    const scoreEntries = Object.entries(analysis.scores)
      .filter(([key, val]) => val !== null && key !== 'overall')
      .sort((a, b) => (b[1] as number) - (a[1] as number));

    const topStrength = scoreEntries[0]
      ? `${formatScoreName(scoreEntries[0][0])}: ${scoreEntries[0][1]}/10`
      : 'No scores yet';

    return {
      rank: index + 1,
      ideaName: analysis.ideaName,
      ideaId: analysis.id,
      overallScore: analysis.scores.overall,
      confidence: analysis.confidence,
      recommendation: analysis.recommendation,
      topStrength,
      topRisk: analysis.risks?.[0] || 'None identified',
    };
  });
}
```

**Step 2: Update `db.ts`**

Replace `getLeaderboardFromDb` body to use the shared function:

```typescript
import { buildLeaderboard } from './utils';

export async function getLeaderboardFromDb(): Promise<LeaderboardEntry[]> {
  const analyses = await getAnalysesFromDb();
  return buildLeaderboard(analyses);
}
```

Remove the local `formatScoreName` function (already done in Task 11).

**Step 3: Update `data.ts`**

Replace `getLeaderboard` body:

```typescript
import { buildLeaderboard } from './utils';

export function getLeaderboard(): LeaderboardEntry[] {
  return buildLeaderboard(getAnalyses());
}
```

Remove the local `formatScoreName` function (already done in Task 11).

**Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Run tests**

Run: `npm test`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/lib/utils.ts src/lib/db.ts src/lib/data.ts
git commit -m "refactor: extract shared leaderboard logic"
```

---

### Task 13: Centralize Model Constants and Anthropic Client

**Files:**
- Create: `src/lib/config.ts`
- Create: `src/lib/anthropic.ts`
- Modify: `src/lib/research-agent.ts`
- Modify: `src/lib/seo-analysis.ts`
- Modify: `src/lib/content-agent.ts`
- Modify: `src/lib/painted-door-agent.ts`
- Modify: `src/lib/agent-runtime.ts`
- Modify: `src/lib/agent-tools/content.ts`
- Modify: `src/lib/agent-tools/analytics.ts`
- Modify: `src/lib/agent-tools/website.ts`
- Modify: `src/lib/analytics-agent.ts`

**Step 1: Create `src/lib/config.ts`**

```typescript
export const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
export const OPENAI_MODEL = 'gpt-4o-mini';
```

**Step 2: Create `src/lib/anthropic.ts`**

Follow the same lazy singleton pattern as `src/lib/openai.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}
```

**Step 3: Update all files with model strings and Anthropic instantiation**

In each of these files, replace the module-level `const anthropic = new Anthropic({...})` with `import { getAnthropic } from './anthropic'` and replace `anthropic.messages.create(...)` with `getAnthropic().messages.create(...)`. Replace all string literals of `'claude-sonnet-4-20250514'` with `CLAUDE_MODEL` (import from `./config`).

Files and locations:
- `research-agent.ts`: Module-level Anthropic (line 22-24), model string at lines 373, 414, 430, 443, and in config object at line 630.
- `content-agent.ts`: Module-level Anthropic (line 41-43), model strings at lines 135, 223, 402, 587.
- `painted-door-agent.ts`: Module-level Anthropic (line 28-30), model strings at lines 394, 649.
- `seo-analysis.ts`: Per-function Anthropic instantiation at lines 186-188 and 526-528, model strings at lines 224 and 587. Also replace the OpenAI model string `'gpt-4o-mini'` at line 290 with `OPENAI_MODEL`.
- `agent-runtime.ts`: Already uses a lazy singleton `getAnthropic()` (lines 90-97) — just replace the local singleton with import from `./anthropic`. No pattern change needed, only an import swap.
- `agent-tools/content.ts`: Anthropic instantiation at line 29, model strings at lines 130, 327, 445.
- `agent-tools/analytics.ts`: Anthropic instantiation at line 24, model string at line 253.
- `agent-tools/website.ts`: Anthropic instantiation at line 17, model string at line 345.
- `analytics-agent.ts`: Model string at line 510.

**Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Run tests**

Run: `npm test`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/lib/config.ts src/lib/anthropic.ts src/lib/research-agent.ts src/lib/seo-analysis.ts src/lib/content-agent.ts src/lib/painted-door-agent.ts src/lib/agent-runtime.ts src/lib/agent-tools/content.ts src/lib/agent-tools/analytics.ts src/lib/agent-tools/website.ts src/lib/analytics-agent.ts
git commit -m "refactor: centralize model constants and Anthropic client"
```

---

### Task 14: Loading Performance — Fonts

Replace the render-blocking Google Fonts `@import` in `globals.css` with `next/font/google` in `layout.tsx`.

**Behavioral change:** Fonts are now self-hosted via `next/font` instead of fetched from Google CDN. The visual appearance should be identical, but the loading mechanism changes — fonts are bundled with the app instead of requiring an external network request. During SSR/initial render, `Georgia, serif` serves as the explicit fallback until the `next/font` CSS variable is injected. This is the standard `next/font` pattern.

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Step 1: Remove the `@import` from `globals.css`**

Remove this line from `globals.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&display=swap');
```

Update the CSS variable declarations to use the CSS variable names that `next/font` will inject (we'll set those from layout.tsx):

```css
--font-display: var(--font-fraunces), Georgia, serif;
--font-body: var(--font-dm-sans), system-ui, sans-serif;
```

**Step 2: Add `next/font/google` imports to `layout.tsx`**

At the top of `src/app/layout.tsx`, add:

```typescript
import { Fraunces, DM_Sans } from 'next/font/google';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fraunces',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});
```

Then add the CSS variable classes to the `<html>` or `<body>` tag:

```tsx
<html lang="en" className={`${fraunces.variable} ${dmSans.variable}`}>
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds. Fonts are self-hosted, no external Google Fonts request.

**Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "perf: replace Google Fonts @import with next/font/google"
```

---

### Task 15: Loading Performance — Lazy-Load Heavy Dependencies

**Files:**
- Modify: files that import `AnalyticsChart` and `MarkdownContent`

**Step 1: Lazy-load AnalyticsChart**

In `src/app/analyses/[id]/analytics/page.tsx`, replace:

```typescript
import AnalyticsChart from '@/components/AnalyticsChart';
```

with:

```typescript
import dynamic from 'next/dynamic';
const AnalyticsChart = dynamic(() => import('@/components/AnalyticsChart'), { ssr: false });
```

**Step 2: Lazy-load MarkdownContent**

In `src/app/analyses/[id]/content/[pieceId]/page.tsx` (which is a client component), replace:

```typescript
import MarkdownContent from '@/components/MarkdownContent';
```

with:

```typescript
import dynamic from 'next/dynamic';
const MarkdownContent = dynamic(() => import('@/components/MarkdownContent'), { ssr: false });
```

Note: `src/app/analyses/[id]/page.tsx` is a server component (no `'use client'`) — `next/dynamic` with `ssr: false` requires a client component context. Leave this file's import unchanged.

**Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds. Bundle sizes for pages that use these components should show reduction in first load JS.

**Step 4: Commit**

```bash
git add src/app/analyses/[id]/analytics/page.tsx src/app/analyses/[id]/content/[pieceId]/page.tsx
git commit -m "perf: lazy-load AnalyticsChart and MarkdownContent"
```

---

### Task 16: Loading Performance — Replace `googleapis` with `@googleapis/searchconsole`

**Files:**
- Modify: `package.json` (via npm)
- Modify: `src/lib/gsc-client.ts`
- Modify: `next.config.ts`

**Step 1: Install the specific sub-package**

Run: `npm install @googleapis/searchconsole`
Run: `npm uninstall googleapis`

**Step 2: Update `gsc-client.ts` imports**

Replace:

```typescript
import { google, Auth } from 'googleapis';
```

with:

```typescript
import { searchconsole_v1, auth as googleAuth } from '@googleapis/searchconsole';
```

Update the auth client creation to use the new import path. The `google.auth.JWT` becomes `new googleAuth.JWT(...)`. The `google.searchconsole('v1')` becomes `new searchconsole_v1.Searchconsole({ auth: authClient })`.

Read the existing `gsc-client.ts` carefully and update each usage of the `google` namespace to use the new imports. This will require careful attention — the auth pattern is the same, just imported from a different path.

**Step 3: Add Next.js config optimizations**

Update `next.config.ts`:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@googleapis/searchconsole'],
  experimental: {
    optimizePackageImports: ['recharts', 'react-markdown'],
  },
};

export default nextConfig;
```

**Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds. Cold start should be faster due to smaller dependency tree.

**Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/gsc-client.ts next.config.ts
git commit -m "perf: replace googleapis with @googleapis/searchconsole, add Next.js optimizations"
```

---

### Task 17: Fix Data Fetching Waste

In `src/app/analysis/page.tsx`, `getLeaderboardFromDb()` internally calls `getAnalysesFromDb()`, then the `getData()` function also calls `getAnalysesFromDb()` separately via `Promise.all`. This means analyses are fetched twice.

**Files:**
- Modify: `src/app/analysis/page.tsx`
- Use: `buildLeaderboard` from `src/lib/utils.ts` (created in Task 12)

**Step 1: Update `getData()` in `analysis/page.tsx`**

Replace the `getData()` function to fetch analyses once and build leaderboard in memory:

```typescript
import { buildLeaderboard } from '@/lib/utils';

async function getData() {
  if (isRedisConfigured()) {
    const [analyses, gscLinks] = await Promise.all([
      getAnalysesFromDb(),
      getAllGSCLinks(),
    ]);
    return {
      leaderboard: buildLeaderboard(analyses),
      analyses,
      gscLinkedIds: new Set(gscLinks.map((l) => l.ideaId)),
    };
  }
  const analyses = getAnalyses();
  return {
    leaderboard: buildLeaderboard(analyses),
    analyses,
    gscLinkedIds: new Set<string>(),
  };
}
```

Remove the import of `getLeaderboardFromDb` and `getLeaderboard` if they are no longer used in this file.

**Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/analysis/page.tsx
git commit -m "fix: deduplicate analysis data fetching on analysis page"
```

---

### Task 18: Error Observability — Audit Empty Catch Blocks

There are 34 `catch {` blocks across 21 files. This task addresses the server-side and data-layer catch blocks.

**Out of scope:** Client-side error state handlers (`SiteCardActions.tsx:62`, `ideas/new/page.tsx:53`, `[pieceId]/page.tsx:46` clipboard fallback, `painted-door-templates.ts:501` client error handler), API route catch blocks that already return error responses (`content/programs/route.ts:17`, `content/[ideaId]/generate/route.ts:32`, `cron/publish/route.ts:44`, `analyze/[id]/route.ts:40`, `content/[ideaId]/route.ts:32`, `painted-door-templates.ts:321`), and `serp-search.ts:92` (intentional URL parse fallback returning raw URL).

**Files:**
- Modify: Multiple files (see list below)

**Step 1: Audit and classify each catch block**

Review each `catch {` block found in the grep results. Apply the following rules:

- **Already logging or re-throwing:** Leave as-is.
- **Intentional + commented (e.g., "Expected on Vercel", "best-effort"):** Add `console.debug` with context:
  ```typescript
  } catch (error) {
    console.debug('[context] best-effort operation failed:', error);
  }
  ```
- **JSON parsing fallback chains (parseSEOJSON, parseJsonResponse, etc.):** These are intentional cascading fallbacks. Leave as-is — they already log at the end of the chain.
- **Silent + uncommented:** Add `console.error` or `console.debug` as appropriate.

Specific blocks to modify (add error binding and logging):

1. `src/lib/db.ts:100` — "Painted door cleanup" — add `console.debug('[deleteIdeaFromDb] painted door cleanup failed:', error)`
2. `src/lib/content-agent.ts:341` — "Expected on Vercel" — add `console.debug('[content-agent] fs write skipped:', error)`
3. `src/lib/content-agent.ts:379` — "Expected on Vercel" — add `console.debug('[content-agent] calendar fs write skipped:', error)`
4. `src/lib/painted-door-agent.ts:491` — "Site might not be ready" — add `console.debug('[painted-door] site verification skipped:', error)`
5. `src/lib/analytics-agent.ts:111` — silent return null — add `console.debug('[analytics] URL parse failed:', error)`
6. `src/lib/painted-door-templates.ts:209` — silent return [] in `getAllPosts()` — add `console.debug('[templates] post directory read failed:', error)`
7. `src/lib/painted-door-templates.ts:231` — silent return null in `getPostBySlug()` — add `console.debug('[templates] post file read failed:', error)`
8. `src/lib/publish-targets.ts:58` — "Redis not configured" — add `console.debug('[publish-targets] Redis fallback:', error)`
9. `src/app/analyses/[id]/analytics/page.tsx:563` — `/* ignore */` — add `console.debug('[analytics-page] SEO data parse failed:', error)`
10. `src/app/analyses/[id]/analytics/page.tsx:673` — "silently fail" — add `console.debug('[analytics-page] report fetch failed:', error)`
11. `src/app/analyses/[id]/analytics/page.tsx:689` — "silently fail" — add `console.debug('[analytics-page] unlink failed:', error)`
12. `src/app/analyses/[id]/page.tsx:156` — silent return null — add `console.debug('[analysis-detail] data fetch failed:', error)`
13. `src/app/analyses/[id]/painted-door/page.tsx:96` — silent — add `console.debug('[painted-door-page] fetch failed:', error)`
14. `src/lib/agent-tools/content.ts:505` — "Expected on Vercel" — add `console.debug('[agent-tools/content] fs write skipped:', error)`

Leave JSON parsing chains unchanged (seo-analysis.ts 839/844/851, content-agent.ts 152/238, painted-door-agent.ts 84, agent-tools/content.ts 51, agent-tools/website.ts 31) — these are intentional fallback parsing that logs at chain end.

**Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add -u
git commit -m "fix: add console.debug to silent catch blocks for error observability"
```

---

### Task 19: Replace Hardcoded Hex Colors with CSS Variables

Hex colors used in inline styles should reference CSS variables from `globals.css`. The mapping:

| Hex Value | CSS Variable | Semantic Use |
|-----------|-------------|-------------|
| `#34d399` | `var(--accent-emerald)` | Success/positive (note: the CSS var is `#10b981`, Tailwind emerald-500 — more accessible) |
| `#fbbf24` | `var(--accent-amber)` | Warning/neutral |
| `#f87171` | `--color-danger` (new) | Error/danger |
| `#a78bfa` | `--color-purple-light` (new) | Light purple for tags |
| `#8b5cf6` | `var(--accent-violet)` | Violet accent |
| `#60a5fa` | `--color-info` (new) | Info status (blue) |
| `#38bdf8` | `--color-sky` (new) | Sky blue accent |
| `#818cf8` | `--color-indigo` (new) | Indigo accent |
| `#4ade80` | `--color-green-light` (new) | Light green for gradients |
| `#f472b6` | `--color-pink` (new) | Pink accent |
| `#22c55e` | `--color-success` (new) | Bright green for live status |
| `#ef4444` | `--color-error` (new) | Red for errors |

**Files:**
- Modify: `src/app/globals.css` (add new CSS variables)
- Modify: All `.tsx` files with hardcoded hex colors in inline styles

**Step 1: Add new CSS variables to `globals.css`**

Add to the `:root` block:

```css
--color-danger: #f87171;
--color-purple-light: #a78bfa;
--color-info: #60a5fa;
--color-sky: #38bdf8;
--color-indigo: #818cf8;
--color-green-light: #4ade80;
--color-pink: #f472b6;
--color-success: #22c55e;
--color-error: #ef4444;
```

Also add corresponding light-mode overrides in the `@media (prefers-color-scheme: light)` block if colors need adjustment for light mode.

**Step 2: Replace hex values in all components**

This is a mechanical find-and-replace across all `.tsx` files. For each file, replace inline style hex values with `var(--variable-name)`. Examples:

- `color: '#34d399'` → `color: 'var(--accent-emerald)'`
- `stroke="#34d399"` → `stroke="var(--accent-emerald)"`
- `background: '#34d399'` → `background: 'var(--accent-emerald)'`
- `color: '#f87171'` → `color: 'var(--color-danger)'`
- `stroke="#f87171"` → `stroke="var(--color-danger)"`
- etc.

Work through each file methodically. There are ~127 replacements across ~25 files. Use search-and-replace within each file. Consider splitting this into batches by directory (components, app pages, lib) for manageable commits.

Files include: `ContentTypeIcon.tsx`, `DeleteButton.tsx`, `ContentCalendarCard.tsx`, `PerformanceTable.tsx`, `AnalyticsChart.tsx`, `SiteCardActions.tsx`, `AlertsList.tsx`, `KeywordPerformance.tsx`, `ProgramToggleButton.tsx`, `TestingAnalytics.tsx`, `PipelineCard.tsx`, `MobileNav.tsx`, `analysis/page.tsx`, `analytics/page.tsx`, `content/page.tsx`, `website/page.tsx`, `optimization/page.tsx`, `testing/page.tsx`, `ideas/new/page.tsx`, `ideas/[id]/analyze/page.tsx`, `[id]/page.tsx`, `[id]/analytics/page.tsx`, `[id]/content/page.tsx`, `[id]/content/[pieceId]/page.tsx`, `[id]/content/generate/page.tsx`, `[id]/painted-door/page.tsx`, `page.tsx` (home).

**Important:** Some hex values appear in `rgba()` expressions (e.g., `rgba(52, 211, 153, 0.15)`). These cannot use CSS variables directly in all contexts. Leave `rgba()` values as-is or convert to the CSS variable pattern with opacity: `color-mix(in srgb, var(--accent-emerald) 15%, transparent)` — but only if the codebase's CSS level supports it. Otherwise, leave rgba values as-is.

**Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Visually verify (manual)**

Run: `npm run dev`
Check a few pages to confirm colors still look correct.

**Step 5: Commit**

```bash
git add -u
git commit -m "style: replace hardcoded hex colors with CSS variables"
```

---

### Task 20: Final Verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass.

**Step 2: Run linter**

Run: `npm run lint`
Expected: No new errors.

**Step 3: Run production build**

Run: `npm run build`
Expected: Build succeeds with no errors or new warnings.

**Step 4: Commit any remaining fixes**

If any issues surface, fix and commit.

**Step 5: Final commit**

```bash
git add -u
git commit -m "chore: final hygiene pass verification"
```
