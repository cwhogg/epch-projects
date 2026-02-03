# Website Agent — Playbook

## Pre-Flight Checklist

Before launching a painted door test site, verify:

- [ ] Idea has a completed analysis (scores, recommendation present)
- [ ] Analysis has SEO data (`seoData` field in `analysis_content`)
- [ ] `ANTHROPIC_API_KEY` configured (for brand/code generation)
- [ ] `GITHUB_TOKEN` configured (for repo creation)
- [ ] `VERCEL_TOKEN` configured (for project deployment)
- [ ] `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` configured

---

## Phase 1: Brand Development

### What Happens

1. Load product idea, analysis, and SEO data from Redis
2. Detect vertical via `detectVertical()` from `seo-knowledge.ts`
3. Build context with community mapping and keyword patterns for the vertical
4. Call Claude to generate brand identity (~1K tokens output)

### Brand Identity Includes

- **Naming:** Site name and tagline aligned with target demographic
- **Voice:** Tone, personality, example phrases — informed by vertical community language
- **Colors:** 9-token palette (primary, primaryLight, background, backgroundElevated, textPrimary, textSecondary, textMuted, accent, border)
- **Typography:** Google Fonts selection (heading, body, mono)
- **Landing Page:** Hero copy, CTA text, 3-4 value propositions, social proof approach

### CHECKPOINT 1: Brand Review

The progress page displays the brand identity for review. The pipeline continues automatically, but the brand is visible before deployment completes.

---

## Phase 2: Code Generation

### Call 2 — Core Files (max_tokens: 16384)

Generates the main site structure:

- `app/layout.tsx` — Root layout with Google Fonts, SEO metadata from brand identity
- `app/globals.css` — Complete design system using brand color tokens
- `app/page.tsx` — Landing page with hero section, value props, email capture form
- `app/robots.ts` — Robots.txt generation
- `app/sitemap.ts` — Sitemap generation
- `app/api/signup/route.ts` — Email capture endpoint (writes to shared Upstash Redis)
- `components/content/MarkdownRenderer.tsx` — Markdown rendering for blog/content
- `components/content/JsonLd.tsx` — Structured data component

**Context injected:** Brand identity + SERP-validated keywords (for meta tags) + People Also Ask (for FAQ sections) + content gap types (for site structure) + scoring guidelines (for keyword prioritization)

### Call 3 — Content Pages + Config (max_tokens: 12288)

Generates supporting pages and configuration:

- `lib/content.ts` — Markdown/frontmatter reader matching content agent output format
- `app/blog/page.tsx` — Blog listing page
- `app/blog/[slug]/page.tsx` — Blog detail with `generateStaticParams`
- `app/compare/[slug]/page.tsx` — Comparison article pages
- `app/faq/[slug]/page.tsx` — FAQ pages
- `package.json` — Dependencies (next, react, tailwindcss, gray-matter, etc.)
- `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `.gitignore`

**Context injected:** Brand identity + layout/CSS from Call 2 for visual consistency

---

## Phase 3: Deployment

### Step 4: Create GitHub Repo

- `POST /user/repos` with `GITHUB_TOKEN`
- Repo name derived from site name (slugified)
- If name collision: append random suffix and retry

### Step 5: Push Files

- Git Data API for atomic multi-file commit:
  1. Create blob for each file
  2. Create tree referencing all blobs
  3. Create commit pointing to tree
  4. Update `refs/heads/main` to new commit
- Also creates `content/blog/.gitkeep`, `content/comparison/.gitkeep`, `content/faq/.gitkeep`

### Step 6: Create Vercel Project

- `POST /v10/projects` with `VERCEL_TOKEN`
- Link to GitHub repo
- Set environment variables:
  - `UPSTASH_REDIS_REST_URL` — same Redis instance as dashboard
  - `UPSTASH_REDIS_REST_TOKEN` — same Redis instance
  - `SITE_ID` — unique identifier for this site's email signups

### Step 7: Wait for Deploy

- Poll `GET /v6/deployments` every 10 seconds
- 5-minute timeout
- Success when deployment state is `READY`

---

## Phase 4: Registration

### Step 8: Register Publish Target

Save to Redis `painted_door_targets` hash:

```json
{
  "id": "site-slug",
  "repoOwner": "cwhogg",
  "repoName": "site-slug",
  "branch": "main",
  "siteUrl": "https://site-slug.vercel.app",
  "pathMap": {
    "blog-post": "content/blog",
    "comparison": "content/comparison",
    "faq": "content/faq"
  }
}
```

This makes the site appear as a target option in the content calendar dropdown.

### Step 9: Verify

- Fetch site URL, confirm HTTP 200
- Save final `PaintedDoorSite` record with status `live`

---

## Email Capture Flow

Generated sites include `POST /api/signup` that:

1. Validates email format
2. Writes to `email_signups:{siteId}` list in Redis
3. Increments `email_signups_count:{siteId}` counter
4. Returns success/error JSON

The dashboard reads these keys to show signup counts per site.

---

## Troubleshooting

| Issue | Resolution |
|-------|------------|
| Build failure on Vercel | Check generated `package.json` has correct dependencies. Re-trigger to regenerate. |
| Vercel deploy timeout | Deployment may still complete — check Vercel dashboard. Site record stays in `deploying` state until verified. |
| GitHub name collision | Agent auto-appends suffix. Check Redis for the actual repo name used. |
| Brand doesn't match demographic | Re-trigger the agent — each run generates a fresh brand identity. |
| Content pages 404 | Content directories start empty. Use content agent to publish pieces to the site. |
| Email signups not recording | Verify `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `SITE_ID` are set in Vercel project env vars. |
| Site not appearing as publish target | Check Redis `painted_door_targets` hash. The target is registered in Step 8. |

---

## How to Use

1. Navigate to an analysis detail page (`/analyses/[id]`)
2. Click **Launch Site** in the header action buttons
3. Progress page shows 9 steps in real-time
4. On completion: live URL displayed, site appears as publish target
5. Use the content calendar to publish content to the new site
