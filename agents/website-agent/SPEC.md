# Website Agent (Painted Door Tests) — Specification

## Mission

Generate production-quality painted door test websites from completed research data. Each site gets a unique brand, landing page with email capture, and SEO-optimized content section — deployed to its own GitHub repo and Vercel project.

---

## Identity

**Role:** Brand Strategist + Web Developer + SEO Specialist

**Expertise:**
- Brand identity development for niche SaaS and consumer products
- Next.js full-stack development
- SEO metadata, structured data, and content architecture
- Landing page conversion optimization
- Deployment automation (GitHub + Vercel)

**Decision-making style:**
- Brand decisions grounded in target demographic and vertical data
- SEO metadata references actual validated keywords from research
- Conservative on claims — no fabricated testimonials or social proof
- Designs that feel distinct, not generic AI-generated templates

---

## CRITICAL: Data Integrity Rules

**NEVER fabricate:**
- Testimonials, customer quotes, or user counts
- Social proof (logos, review scores, case studies)
- Statistics or metrics not sourced from research data
- Awards, certifications, or endorsements

**Brand alignment:**
- Brand voice must align with target demographic from research
- Color palette and typography should match vertical expectations (clinical trust for healthcare, professional authority for B2B, approachable for consumer)
- SEO metadata must reference actual validated keywords from the research agent's output

**What IS acceptable:**
- Value propositions derived from problem/solution analysis
- CTA text based on target user pain points
- Placeholder content directories for the content agent to populate
- Email capture with clear "coming soon" or "early access" framing

---

## Inputs

### Required

| Field | Source | Description |
|-------|--------|-------------|
| ProductIdea | Redis `ideas` hash | Name, description, target user, problem solved |
| Analysis | Redis `analyses` hash | Scores, confidence, recommendation, summary, risks |
| AnalysisContent | Redis `analysis_content` hash | SEO data (keywords, SERP validation, content gaps), competitors |

### SEO Knowledge Reference

Uses `src/lib/seo-knowledge.ts` throughout:

| Function | Purpose |
|----------|---------|
| `detectVertical()` | Determines B2B SaaS, healthcare consumer, or general niche — drives brand voice |
| `getKeywordPatterns(vertical)` | Informs landing page copy and SEO metadata |
| `getSERPCriteria(vertical)` | Guides competitive positioning in landing copy |
| `getContentGapTypes()` | Informs blog/content section structure |
| `getCommunityMapping(vertical)` | Informs voice and social proof approach |
| `buildScoringGuidelines()` | Intent multipliers guide keyword prioritization in meta tags |

---

## Core Tasks

### 1. Brand Development (LLM Call 1)

- Detect vertical via `detectVertical()`
- Use vertical-specific keyword patterns and community signals to inform brand voice
- Generate complete brand identity:
  - Site name, tagline, SEO description
  - Target demographic alignment
  - Voice (tone, personality, examples)
  - Color palette (9 tokens: primary, primaryLight, background, backgroundElevated, textPrimary, textSecondary, textMuted, accent, border)
  - Typography (heading, body, mono fonts from Google Fonts)
  - Landing page copy (hero headline, subheadline, CTA, value props, social proof approach)

### 2. Site Architecture & Code Generation (LLM Calls 2-3)

**Call 2 — Core Files:**
- `app/layout.tsx` — Google Fonts, SEO metadata
- `app/globals.css` — Full design system from brand colors
- `app/page.tsx` — Landing page with hero, value props, email capture
- `app/robots.ts`, `app/sitemap.ts`
- `app/api/signup/route.ts` — Email capture to Upstash Redis
- `components/content/MarkdownRenderer.tsx`, `components/content/JsonLd.tsx`

**Call 3 — Content Pages + Config:**
- `lib/content.ts` — Markdown reader (parses same frontmatter format content agent generates)
- `app/blog/page.tsx`, `app/blog/[slug]/page.tsx`
- `app/compare/[slug]/page.tsx`, `app/faq/[slug]/page.tsx`
- `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `.gitignore`

Content directory path map must match: `{ 'blog-post': 'content/blog', comparison: 'content/comparison', faq: 'content/faq' }`

### 3. Deployment

- Create GitHub repo via `POST /user/repos`
- Push all files via Git Data API (atomic multi-file commit)
- Create empty content directories: `content/blog/.gitkeep`, `content/comparison/.gitkeep`, `content/faq/.gitkeep`
- Create Vercel project linked to GitHub repo
- Set env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SITE_ID`
- Wait for deploy (poll every 10s, 5min timeout)

### 4. Publish Target Registration

- Save `PublishTarget` to Redis `painted_door_targets` hash
- Verify site returns 200
- Save final `PaintedDoorSite` record

---

## Outputs

### Per Idea

| Output | Location | Description |
|--------|----------|-------------|
| Brand identity | Redis `painted_door_sites` hash | Full BrandIdentity JSON |
| Live website | Vercel (unique URL) | Landing page + content section |
| GitHub repo | GitHub (user's account) | All site source files |
| Publish target | Redis `painted_door_targets` hash | Enables content agent to push to site |

### Pipeline Steps

| # | Step | Output |
|---|------|--------|
| 1 | Brand Identity | `BrandIdentity` JSON |
| 2 | Code Gen (core) | 8 core site files |
| 3 | Code Gen (content) | 10+ content/config files |
| 4 | Create GitHub Repo | Repository URL |
| 5 | Push Files | Commit SHA |
| 6 | Create Vercel Project | Project ID |
| 7 | Wait for Deploy | Deployment URL |
| 8 | Register Publish Target | Target ID |
| 9 | Verify | HTTP 200 confirmation |

---

## Data Flow

### Reads From

| Source | Purpose |
|--------|---------|
| Redis `ideas` hash | Product idea details |
| Redis `analyses` hash | Analysis scores and summary |
| Redis `analysis_content` hash | SEO data, competitors, keywords |
| `src/lib/seo-knowledge.ts` | Vertical detection, keyword patterns, SERP criteria |

### Writes To

| Destination | Content |
|-------------|---------|
| Redis `painted_door_sites` hash | `PaintedDoorSite` record |
| Redis `painted_door_progress:{ideaId}` | Progress tracking (1hr TTL) |
| Redis `painted_door_targets` hash | Dynamic publish target |
| GitHub | New repository with site files |
| Vercel | New project linked to repo |

---

## Checkpoints

| # | After | Review Focus |
|---|-------|--------------|
| 1 | Brand identity generation | Does the brand feel right for the target demographic? Colors, voice, positioning appropriate? |

Code generation and deployment proceed automatically after brand checkpoint.

---

## Tools Required

| Tool | Purpose |
|------|---------|
| Claude API (Anthropic) | Brand identity, code generation (3 calls) |
| GitHub API | Repo creation, file push via Git Data API |
| Vercel API | Project creation, deployment monitoring |
| Upstash Redis | Progress tracking, site records, publish targets, email signups |

---

## Error Handling

**If GitHub repo name collides:**
- Append random suffix (e.g., `-2`, `-abc`)
- Retry creation

**If Vercel deploy times out (5min):**
- Record partial state (repo exists, project created)
- Allow manual retry from progress page

**If LLM returns invalid JSON:**
- Attempt to extract JSON from markdown code fences
- Fall back to regex JSON extraction
- Fail with descriptive error if unparseable

**If brand identity is unsuitable:**
- Progress page shows brand preview before deployment
- User can re-trigger to generate new brand

---

*Specification v1 — February 2026*
