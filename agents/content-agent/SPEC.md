# Content Agent — Specification

## Purpose

Consumes research agent SEO data and generates draft content (blog posts, landing pages, comparison articles, FAQ pages) as markdown files in the Obsidian vault. Triggered manually from the analysis detail page.

## Data Flow

```
Analysis Detail Page → "Generate Content" button
  → /analyses/[id]/content → POST /api/content/[ideaId] → generateContentCalendar()
  → Content Calendar Page (user reviews, selects pieces)
  → /analyses/[id]/content/generate → POST /api/content/[ideaId]/generate → generateContentPieces()
  → Progress Page (polls every 2s)
  → /analyses/[id]/content/[pieceId] → Content Viewer (rendered markdown, copy/download)
```

## Content Types

| Type | Description | Word Count | Priority Signal |
|------|------------|------------|-----------------|
| `blog-post` | Informational/commercial keyword targeting, content gap fill | 1500-3000 | SERP-validated gaps |
| `landing-page` | Conversion copy: hero, problem, solution, differentiation, FAQ, CTA | 800-1500 | Conversion-focused |
| `comparison` | Honest "X vs Y" with real competitor data, pricing, overview table | 1500-2500 | Commercial intent keywords |
| `faq` | Schema-friendly Q&A from People Also Ask + related searches | 2000-3000 | Quick win, long-tail |

## Research Data Consumed

From existing research agent output (stored in Redis):

- **SEOSynthesis**: `topKeywords` (20), `serpValidated` (3 SERP-validated with PAA, related searches, gap types, green/red flags), `contentStrategy` (angle + top opportunities), `difficultyAssessment`
- **Competitor data**: markdown containing names, URLs, pricing, strengths, weaknesses
- **Analysis scores**: SEO, competition, WTP, differentiation, expertise, overall
- **Expertise profile**: domain strengths, stakeholder experience, therapeutic areas

## Architecture

### Core Files

| File | Role |
|------|------|
| `src/types/index.ts` | `ContentType`, `ContentPiece`, `ContentCalendar`, `ContentProgress` |
| `src/lib/content-agent.ts` | Orchestration: context building, calendar generation, piece generation, file writing |
| `src/lib/content-prompts.ts` | Prompt templates for calendar + 4 content types |
| `src/lib/db.ts` | 6 Redis functions for calendar, pieces, progress |

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/content/[ideaId]` | POST | Generate content calendar |
| `/api/content/[ideaId]` | GET | Retrieve existing calendar |
| `/api/content/[ideaId]/generate` | POST | Start content generation (accepts `{ pieceIds }`) |
| `/api/content/[ideaId]/generate` | GET | Poll generation progress |
| `/api/content/[ideaId]/pieces` | GET | List all content pieces |
| `/api/content/[ideaId]/pieces/[pieceId]` | GET | Get single content piece |

### UI Pages

| Page | Purpose |
|------|---------|
| `/analyses/[id]/content` | Calendar view with selection, strategy summary |
| `/analyses/[id]/content/generate` | Progress page (polling, step display) |
| `/analyses/[id]/content/[pieceId]` | Content viewer (rendered markdown, copy/download) |

### Redis Keys

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `content_calendar:{ideaId}` | String (JSON) | None | Content calendar with all pieces |
| `content_pieces:{ideaId}` | Hash | None | Generated content pieces |
| `content_progress:{ideaId}` | String (JSON) | 1 hour | Generation progress tracking |

## File Output

```
experiments/[idea-name]/content/
  _calendar.md        # Content calendar overview with index table
  blog-[slug].md      # Blog posts with YAML frontmatter
  landing-page.md     # Landing page copy
  comparison-[slug].md
  faq-[slug].md
```

Each file includes YAML frontmatter: `title`, `type`, `targetKeywords`, `contentGap`, `generatedAt`, `ideaName`, `status`, `wordCount`.

## Model Configuration

- Calendar generation: Claude Sonnet 4, `max_tokens: 4096`
- Content generation: Claude Sonnet 4, `max_tokens: 8192`
- All calls sequential per piece to manage Vercel timeout (300s max)

## Calendar Prioritization

Single Claude call with all research data. Produces 6-10 pieces prioritized by:
1. Blog posts targeting SERP-validated content gaps (highest confidence)
2. FAQ page from People Also Ask data (quick win)
3. Comparison articles using competitor data + "X vs Y" keywords
4. Landing page copy (conversion-focused)
