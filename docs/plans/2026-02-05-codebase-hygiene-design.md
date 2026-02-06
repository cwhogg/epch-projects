# Codebase Hygiene Pass

Design doc from the 2026-02-05 code audit. Scope: changes that improve the codebase without risking breakage. Excludes architectural refactors (component splitting, orchestrator decomposition) and security hardening (auth, rate limiting) since this is an internal tool on an obscure Vercel URL used by two people.

---

## 1. Safety nets

### 1a. Add `.env*` to `.gitignore`

Add these patterns to `.gitignore`:

```
.env
.env.*
.env.local
```

Prevents accidental commit of API keys. One-line change, catastrophic downside if skipped.

### 1b. Update Next.js to patch known CVEs

Run `npm audit fix` to update `next@16.1.4` to the latest patch release. As of the audit, `npm audit` reports 3 high-severity DoS vulnerabilities.

### 1c. Install vitest and add tests for critical pure functions

Install `vitest` as a dev dependency. Add a `test` script to `package.json`. Write tests for:

- **Score parsers** (`research-agent.ts`): `parseScores`, `parseRecommendation`, `parseConfidence`, `parseRisks`, `parseSummary` -- these extract structured data from LLM markdown via regex. Silent degradation to null/Unknown on format changes. Test with 10-15 representative LLM output samples per parser. These functions are not currently exported; export them.

- **Publish pipeline** (`publish-pipeline.ts`): `findNextPiecePerTarget` sorting/filtering logic. This function determines what gets published to live sites. Test the candidate selection priority (complete pieces first, skip inactive/generating/published/landing-page pieces). Requires mocking `getContentPieces` and `isPiecePublished`.

- **Content transforms** (`github-publish.ts`): `enrichFrontmatter` and `flipDraftToPublished` -- regex-based content transforms that run on markdown before it goes to production repos.

- **Analytics pure functions** (`analytics-agent.ts`): `getWeekId` (ISO week calculation with UTC date math -- classic off-by-one territory), `detectChanges` (threshold-based alert rules), `matchUrlToSlug`.

- **SEO logic** (`seo-analysis.ts`): `fuzzyMatch`, `compareSEOResults`, `detectContentGap`, `validateSEOResult`, `parseSEOJSON`, `cleanJSONString`.

- **Vertical detection** (`seo-knowledge.ts`): `detectVertical` -- classification drives the entire SEO context.

- **Markdown parsing** (`data.ts`): `parseAnalysisFromMarkdown` -- file-system fallback parser with 5 regex patterns.

Vitest config: minimal, TypeScript support via the Next.js tsconfig path aliases.

---

## 2. Consolidate duplicated code

### 2a. Shared Redis module (`lib/redis.ts`)

Extract from `db.ts`, `analytics-db.ts`, and `painted-door-db.ts`:

- `getRedis()` -- lazy singleton, currently copied 3 times
- `parseValue<T>()` -- identical in all 3 files

All three DB modules import from the new shared module. Delete the duplicated code from each. This also means one Redis client instance instead of three.

### 2b. Shared LLM utilities (`lib/llm-utils.ts`)

Extract:

- `parseLLMJson<T>(text: string): T` -- strip markdown code fences, attempt `JSON.parse`, fall back to regex extraction. Currently duplicated in `seo-analysis.ts` (`parseSEOJSON`), `painted-door-agent.ts` (`parseJsonResponse`), and `content-agent.ts` (inline, 2 locations).

- `cleanJSONString(text: string): string` -- strip trailing commas and comments. Currently in `seo-analysis.ts` only but logically belongs with the JSON parser.

### 2c. Shared general utilities (`lib/utils.ts`)

Extract:

- `slugify(name: string): string` -- duplicated in `painted-door-agent.ts` and `content-agent.ts` (different function names, identical logic)
- `fuzzyMatchPair(a: string, b: string): boolean` -- the core 1-to-1 comparison logic (normalize, check containment, 60% word overlap). Currently duplicated with different signatures: `seo-analysis.ts` has `fuzzyMatch(keyword: string, list: string[]): boolean` (1-to-many, wraps with `.some()`), and `analytics/page.tsx` has `fuzzyMatchKeyword(query: string, keyword: string): boolean` (1-to-1). Extract the core comparison as `fuzzyMatchPair`. The server-side `fuzzyMatch(keyword, list)` becomes `list.some(item => fuzzyMatchPair(keyword, item))`. The client page uses `fuzzyMatchPair` directly.
- `formatScoreName(key: string): string` -- duplicated in `db.ts` and `data.ts`
- `getFilename(type: ContentType, slug: string): string` -- duplicated in `github-publish.ts` (takes `type, slug`) and `content-agent.ts` (takes `ContentPiece` object). Extract with the `(type, slug)` signature. Update `content-agent.ts` callers to pass `piece.type, piece.slug` instead of the whole object.

### 2d. Shared leaderboard logic

Extract the sorting/mapping from both `db.ts` (`getLeaderboardFromDb`) and `data.ts` (`getLeaderboard`) into a shared function that takes `Analysis[]` and returns `LeaderboardEntry[]`. Both callers import it.

---

## 3. Centralize configuration

### 3a. Model constants (`lib/config.ts`)

Define:

```typescript
export const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
export const OPENAI_MODEL = 'gpt-4o-mini';
```

Replace all 12 occurrences of the Claude model string (4 in `research-agent.ts`, 2 in `seo-analysis.ts`, 3 in `content-agent.ts`, 3 in `painted-door-agent.ts`) and 1 occurrence of the OpenAI model string in `seo-analysis.ts`.

### 3b. Environment variable access (`lib/config.ts`)

Centralize all `process.env` reads into typed getters. Currently 40+ scattered reads across the codebase. Example shape:

```typescript
export function getAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  return key;
}

export function isRedisConfigured(): boolean { ... }
export function getRedisUrl(): string { ... }
export function getGitHubToken(): string { ... }
// etc.
```

Move the existing `isRedisConfigured()` check from `db.ts` into this module. All modules import from `lib/config.ts` instead of reading `process.env` directly.

### 3c. Shared Anthropic client (`lib/anthropic.ts`)

Create a lazy singleton following the same pattern as `lib/openai.ts`. Replace the 3 module-level instantiations in `research-agent.ts`, `content-agent.ts`, `painted-door-agent.ts` and the 2 per-function instantiations in `seo-analysis.ts`.

---

## 4. Loading performance

### 4a. Replace Google Fonts `@import` with `next/font/google`

Remove the render-blocking `@import url(...)` from `globals.css`. Add `next/font/google` imports for Fraunces and DM Sans in `layout.tsx`. Specify only the weights actually used (400, 500, 600, 700 normal). This eliminates an external network request and self-hosts the fonts.

### 4b. Lazy-load heavy client dependencies

Wrap `AnalyticsChart` (recharts, ~400KB) and `MarkdownContent` (react-markdown + remark-gfm, ~100KB) with `next/dynamic({ ssr: false })`. No functional change -- these components are already client-only.

### 4c. Replace `googleapis` with `@googleapis/searchconsole`

In `gsc-client.ts`, replace `import { google } from 'googleapis'` with imports from the specific sub-package. Drops ~50MB from the dependency tree and improves Vercel cold start times.

### 4d. Add `next.config.ts` optimizations

Add to the Next.js config:

```typescript
serverExternalPackages: ['@googleapis/searchconsole'],
experimental: {
  optimizePackageImports: ['recharts', 'react-markdown'],
},
```

---

## 5. Fix data fetching waste

### 5a. Deduplicate `hgetall('analyses')` on analysis page

In `analysis/page.tsx`, `getLeaderboardFromDb()` internally calls `getAnalysesFromDb()`, then the page calls `getAnalysesFromDb()` again. Fix: call `getAnalysesFromDb()` once, pass the result to a new `buildLeaderboard(analyses)` function that does the sorting/mapping in memory.

---

## 6. Error observability

### 6a. Replace empty catch blocks with `console.debug`

25+ `catch` blocks use no error variable binding (`catch {` instead of `catch (error) {`). Not all are truly silent -- some already contain `console.error` or `throw` statements. For each, audit individually:

- If already logging or re-throwing: leave as-is.
- If intentional and silent (e.g., "expected on Vercel" filesystem writes): add `console.debug('[context] best-effort failed:', error)`.
- If likely unintentional (e.g., analytics page fetch failures): add `console.error` and investigate whether the error should propagate.

This makes failures traceable in Vercel logs without changing behavior.

---

## 7. Design consistency

### 7a. Replace hardcoded hex colors with CSS variables

The codebase uses raw hex values (`#34d399`, `#fbbf24`, `#f87171`, etc.) in inline styles across 10+ components while `globals.css` already defines semantic CSS variables (`--accent-emerald`, `--accent-coral`, `--accent-amber`). Some hex values don't even match the CSS variables (e.g., `#34d399` is Tailwind emerald-400, but `--accent-emerald` is `#10b981`).

Replace all hardcoded hex colors in inline styles with the corresponding CSS variable references. Where a CSS variable doesn't exist for a needed color, add one to `globals.css`.

---

## Out of scope

Explicitly excluded from this hygiene pass:

- **Authentication / rate limiting / security headers** -- internal tool, obscure URL, 2 users
- **Breaking apart god components** (858-line analytics page, 551-line content page) -- works fine, high refactor risk
- **Splitting `seo-analysis.ts`** into modules -- organizational only, risks import issues
- **Decomposing orchestrator functions** -- subtle ordering dependencies
- **Removing filesystem fallback** (`data.ts`) -- might break local dev
- **ISR / caching changes** -- no performance pain
- **Suspense boundaries** -- no perceived slowness
- **Redis pipelining / MGET** -- no performance pain, riskier data access changes
- **Input validation (Zod)** -- only 2 users hitting these endpoints
- **Structured logging** -- `console.log` is fine at this scale

---

## Execution notes

All changes are safe to run on main. No feature changes, no behavioral changes. The test suite is additive. The utility extractions are mechanical (extract function, update imports, verify build). The font swap and dependency changes should be verified with `npm run build` after each.
