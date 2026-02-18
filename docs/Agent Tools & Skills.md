# Agent Tools & Skills

This document catalogs all tools available to our AI agents in the EPCH Projects platform.

**Last Updated:** 2026-02-16
**Total Tools:** 53 across 6 specialized agents

---

## Overview

Our platform uses six specialized agents, each with purpose-built tools:

| Agent | Purpose | Tool Count |
|-------|---------|------------|
| **Research Agent** | Product opportunity analysis | 8 |
| **Analytics Agent** | GSC performance tracking | 7 |
| **Content Agent** | Blog/comparison/FAQ creation | 9 |
| **Website Agent** | Painted door landing pages | 16 |
| **Foundation Agent** | Strategic foundation documents | 3 |
| **Content Critique Agent** | Multi-advisor critique cycle | 6 |
| **Common Tools** | Shared across all agents | 4 |

---

## Common Tools (All Agents)

Located in: `src/lib/agent-tools/common.ts`

### Plan Tools

| Tool | Description |
|------|-------------|
| `create_plan` | Creates a step-by-step execution plan with descriptions and rationale |
| `update_plan` | Marks plan steps as `in_progress`, `complete`, or `skipped`. Can insert new steps |

### Scratchpad Tools

| Tool | Description |
|------|-------------|
| `read_scratchpad` | Reads values from shared Redis key-value store (per idea) |
| `write_scratchpad` | Writes values to scratchpad for inter-agent communication |

### Evaluation Helpers (Internal)

- `checkKeywordPresence()` - Validates keyword inclusion in text
- `checkHeadingHierarchy()` - Validates H1/H2 structure
- `checkWordCount()` - Validates content length
- `checkMetaDescription()` - Validates meta description (140-165 chars with primary keyword)
- `combineEvaluations()` - Merges multiple evaluations into single score

---

## Research Agent

Located in: `src/lib/agent-tools/research.ts`

**Purpose:** Analyzes product ideas for market opportunity, competition, and SEO potential.

### Tools

| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `search_serp` | query | Top 8 results, PAA questions, related searches | Google search via SerpAPI |
| `fetch_page` | url | URL, content length, extracted text (max 3000 chars) | Extracts text from web pages |
| `run_seo_pipeline` | (none) | Keywords, SERP gaps, content strategy, synthesis | Multi-step SEO analysis with Claude + OpenAI |
| `save_competitor_analysis` | markdown | Success + length | Stores competitive analysis |
| `save_wtp_analysis` | markdown | Success + length | Stores willingness-to-pay analysis |
| `save_final_analysis` | scores, recommendation, summary | Analysis ID, overall score | Finalizes research with weighted scoring |
| `get_expertise_profile` | (none) | Expertise context string | Returns expertise for scoring context |
| `get_idea_details` | (none) | ID, name, description, target user, problem | Returns full product idea |

### Scoring Dimensions (1-10 scale)

| Dimension | Weight | Description |
|-----------|--------|-------------|
| SEO Opportunity | 30% | Keyword potential |
| Competitive Landscape | 20% | Competitive position |
| Willingness to Pay | 25% | Monetization potential |
| Differentiation Potential | 20% | Unique value proposition |
| Expertise Alignment | 5% | Personal expertise fit |

### Recommendations

- **Tier 1** - Strong opportunity, pursue immediately
- **Tier 2** - Good potential, consider with modifications
- **Tier 3** - Limited opportunity, deprioritize

### Typical Flow

```
search_serp → fetch_page → run_seo_pipeline
→ save_competitor_analysis → save_wtp_analysis
→ save_final_analysis
```

---

## Analytics Agent

Located in: `src/lib/agent-tools/analytics.ts`

**Purpose:** Analyzes Google Search Console data to track content performance and generate insights.

### Tools

| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `fetch_gsc_page_data` | (none) | Week ID, date range, top 10 pages | Fetches GSC page-level data (7 days) |
| `fetch_gsc_query_data` | (none) | Row count, top 15 queries | Fetches query+page level data |
| `load_published_pieces` | (none) | Published count, slug list | Loads all published content pieces |
| `match_pages_to_pieces` | (none) | Matched count, unmatched pages, snapshots | Matches GSC pages to content by slug |
| `compare_weeks` | (none) | Week comparison, site summary, alerts | Compares current vs previous week |
| `generate_insights` | data summary | Key wins, concerns, recommendations | Uses Claude to analyze and recommend |
| `save_report` | insights analysis | Success, week ID, alert count | Compiles and saves weekly report |

### Alert Severities

- **critical** - Major performance drops requiring immediate attention
- **warning** - Concerning trends to monitor
- **info** - Notable changes for awareness

### Typical Flow

```
fetch_gsc_page_data → fetch_gsc_query_data → load_published_pieces
→ match_pages_to_pieces → compare_weeks
→ generate_insights → save_report
```

---

## Content Agent

Located in: `src/lib/agent-tools/content.ts`

**Purpose:** Generates SEO-optimized content pieces (blog posts, comparisons, FAQs) based on research.

### Tools

| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `get_research_context` | (none) | Idea, keywords, gaps, strategy | Loads analysis and SEO data |
| `plan_content_calendar` | targetId (optional) | Strategy summary, 6-10 pieces | Generates prioritized content calendar |
| `evaluate_calendar` | (none) | Pass/fail, score, issues | Validates keyword coverage and diversity |
| `write_content_piece` | pieceId | Title, type, word count, preview | Generates single content piece |
| `evaluate_content` | (none) | Pass/fail, score, issues | Validates against SEO targets |
| `revise_content` | pieceId, instructions | Title, updated word count | Revises based on feedback |
| `save_piece` | pieceId | Success, word count | Saves to database and filesystem |
| `finalize_content_generation` | (none) | Total pieces saved | Marks analysis complete |
| `get_existing_content` | (none) | Calendar, completed pieces, rejected | Loads existing content state |

### Content Types

| Type | Directory | Word Count Target |
|------|-----------|-------------------|
| `blog-post` | content/blog | 1200-4000 words |
| `comparison` | content/comparison | 1200-4000 words |
| `faq` | content/faq | 1500+ words |

### Evaluation Criteria

- Keyword presence in title, headings, body
- Word count within target range
- Proper heading hierarchy (single H1, logical H2s)
- Target keywords addressed

### Typical Flow

```
get_research_context → plan_content_calendar → evaluate_calendar
→ [for each piece]:
    write_content_piece → evaluate_content → [revise_content] → save_piece
→ finalize_content_generation
```

---

## Website Agent (Painted Door)

Located in: `src/lib/agent-tools/website.ts`

**Purpose:** Creates test landing pages ("painted doors") to validate product ideas with real traffic.

### Tools

| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `get_idea_context` | (none) | Idea, vertical, slug, keywords | Loads context and detects vertical |
| `design_brand` | (none) | BrandIdentity object | Generates brand identity via LLM |
| `assemble_site_files` | (none) | File count, file paths | Assembles Next.js site from templates |
| `evaluate_brand` | (none) | Pass/fail, score, issues | Validates brand against SEO requirements |
| `validate_code` | (none) | Pass/fail, score, issues | Checks HTML, Tailwind v4, Next.js patterns |
| `create_repo` | (none) | Owner, name, URL | Creates GitHub repository |
| `push_files` | (none) | Commit SHA, file count | Pushes files to GitHub |
| `create_vercel_project` | (none) | Project ID | Creates Vercel project with env vars |
| `trigger_deploy` | (none) | Success message | Triggers Vercel build via empty commit |
| `check_deploy_status` | (none) | Status, site URL | Polls deployment status |
| `get_deploy_error` | (none) | Error lines, build output | Fetches build error logs |
| `update_file` | filePath, content | Success, size | Updates single file for fixes |
| `register_publish_target` | (none) | Target ID, site URL | Registers site as publish target |
| `verify_site` | (none) | Status code, URL | Verifies site is accessible |
| `finalize_site` | verified | Site ID, URL, status | Saves final site record |
| `invoke_content_agent` | targetId (optional) | Calendar summary, pieces | Delegates to Content Agent |

### Brand Identity Structure

```typescript
interface BrandIdentity {
  siteName: string;
  tagline: string;
  seoDescription?: string;
  targetDemographic: string;
  voice: {
    tone: string;
    personality: string;
    examples: string[];
  };
  colors: {
    primary: string;
    primaryLight: string;
    background: string;
    backgroundElevated: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    border: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    monoFont: string;
  };
  landingPage?: {
    heroHeadline: string;
    heroSubheadline: string;
    valueProps: Array<{
      icon: string;
      title: string;
      description: string;
    }>;
    ctaText: string;
  };
}
```

### Code Validation Checks

- Exactly 1 H1 tag per page
- Semantic HTML (`<main>`, `<section>`)
- OG/Twitter meta tags present
- Tailwind v4 syntax (`@import` not `@tailwind`)
- Custom colors in `@theme` block
- `'use client'` directives where needed
- Next.js 15 async params pattern
- Internal link resolution

### Typical Flow

```
get_idea_context → design_brand → assemble_site_files
→ evaluate_brand → validate_code
→ create_repo → push_files → create_vercel_project
→ trigger_deploy → check_deploy_status (poll until READY)
→ [if error: get_deploy_error → update_file → push_files]
→ register_publish_target → verify_site → finalize_site
→ invoke_content_agent (optional)
```

---

## Foundation Agent

Located in: `src/lib/agent-tools/foundation.ts`

**Purpose:** Generates 6 strategic foundation documents using assigned advisor personas with dependency ordering.

### Tools

| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `load_foundation_docs` | docTypes (optional) | Docs map, missing list | Load one or more foundation documents from Redis. Omit docTypes to load all |
| `generate_foundation_doc` | docType, strategicInputs (optional) | Success, version, content | Generate a foundation document using the assigned advisor. Requires upstream docs to exist |
| `load_design_seed` | (none) | Design principles seed content | Load the existing design principles file as seed input for design-principles generation |

### Document Types & Advisor Assignments

| Document | Advisor | Upstream Dependencies |
|----------|---------|----------------------|
| `strategy` | Seth Godin | (none) |
| `positioning` | April Dunford | strategy |
| `brand-voice` | Brand Copywriter | positioning |
| `design-principles` | Richard Rumelt | positioning, strategy |
| `seo-strategy` | SEO Expert | positioning |
| `social-media-strategy` | April Dunford | positioning, brand-voice |

### Typical Flow

```
load_foundation_docs → generate_foundation_doc(strategy)
→ generate_foundation_doc(positioning)
→ generate_foundation_doc(brand-voice, design-principles, seo-strategy, social-media-strategy)
```

---

## Content Critique Agent

Located in: `src/lib/agent-tools/critique.ts`

**Purpose:** Multi-round critique cycle with dynamically selected advisor critics, mechanical editor rubric, and do-not-regress revision guards.

### Tools

| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `generate_draft` | contentContext | Draft text, length | Generate initial content draft using the recipe author advisor |
| `run_critiques` | (none) | Array of AdvisorCritique objects | Run critique cycle with dynamically selected advisors. Reads current draft from Redis |
| `editor_decision` | critiques | Decision (approve/revise), brief, avgScore | Apply mechanical editor rubric to critique results |
| `revise_draft` | brief | Revised draft text, length | Revise the current draft based on editor brief with do-not-regress guard |
| `summarize_round` | round, critiques, editorDecision, brief | Round summary with fixed items and scores | Save full round data to Redis and return compressed summary |
| `save_content` | quality | Success, content length | Save approved content from Redis with quality status |

### Typical Flow

```
generate_draft → run_critiques → editor_decision
→ [if revise: revise_draft → run_critiques → editor_decision]
→ summarize_round → save_content
```

---

## Advisors

The platform includes 14 advisors in the Virtual Board, registered in `src/lib/advisors/registry.ts`:

| ID | Name | Role |
|----|------|------|
| `richard-rumelt` | Richard Rumelt | strategist |
| `copywriter` | Brand Copywriter | author |
| `april-dunford` | April Dunford | strategist |
| `seo-expert` | SEO Expert | critic |
| `shirin-oreizy` | Shirin Oreizy | critic |
| `joe-pulizzi` | Joe Pulizzi | strategist |
| `robb-wolf` | Robb Wolf | critic |
| `patrick-campbell` | Patrick Campbell | strategist |
| `robbie-kellman-baxter` | Robbie Kellman Baxter | strategist |
| `oli-gardner` | Oli Gardner | critic |
| `rob-walling` | Rob Walling | strategist |
| `julian-shapiro` | Julian Shapiro | author |
| `seth-godin` | Seth Godin | strategist |
| `joanna-wiebe` | Joanna Wiebe | critic |

Advisor system prompts are `.md` files in `src/lib/advisors/prompts/`, loaded by `src/lib/advisors/prompt-loader.ts`.

---

## Integration Requirements

### Environment Variables

| Variable | Required By | Description |
|----------|-------------|-------------|
| `ANTHROPIC_API_KEY` | All agents | Claude API access |
| `SERPAPI_KEY` | Research | Google search API |
| `OPENAI_API_KEY` | Research (optional) | Additional SEO analysis |
| `GITHUB_TOKEN` | Website | Repository creation |
| `VERCEL_TOKEN` | Website | Project deployment |
| `UPSTASH_REDIS_REST_URL` | All | Database access |
| `UPSTASH_REDIS_REST_TOKEN` | All | Database auth |
| `GSC_SERVICE_ACCOUNT_EMAIL` | Analytics | Google Search Console |
| `GSC_PRIVATE_KEY` | Analytics | GSC authentication |

### Data Flow Between Agents

```
Research Agent
    ↓ (analysis, SEO data, keywords)
Content Agent ←→ Website Agent
    ↓                ↓
Published Content   Painted Door Site
    ↓                ↓
Analytics Agent (tracks both)
```

---

## File Locations

```
src/lib/agent-tools/
├── common.ts      # Shared plan + scratchpad tools
├── research.ts    # Research Agent tools
├── analytics.ts   # Analytics Agent tools
├── content.ts     # Content Agent tools
├── website.ts     # Website Agent tools
├── foundation.ts  # Foundation Agent tools
└── critique.ts    # Content Critique Agent tools
```

---

## Adding New Tools

1. Define tool in appropriate `agent-tools/*.ts` file
2. Add to tool array in `create*Tools()` function
3. Follow existing patterns for:
   - Input/output schema
   - Error handling
   - Progress tracking via plan tools
4. Update this document
