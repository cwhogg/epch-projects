import { ContentContext } from './content-prompts';
import { BrandIdentity } from '@/types';
import {
  detectVertical,
  buildClaudeKnowledgeContext,
  buildScoringGuidelines,
  CONTENT_GAP_TYPES,
  COMMUNITY_MAPPINGS,
  KEYWORD_PATTERNS,
  SERP_CRITERIA,
  INTENT_WEIGHTS,
  Vertical,
} from './seo-knowledge';
import { ProductIdea } from '@/types';

function buildSEOContext(ctx: ContentContext, vertical: Vertical): string {
  const serpCriteria = SERP_CRITERIA[vertical];
  const communityMapping = COMMUNITY_MAPPINGS[vertical];
  const keywordPatterns = KEYWORD_PATTERNS[vertical];
  const contentGapTypes = CONTENT_GAP_TYPES;

  return `## SEO DATA

### Top Keywords (from research)
${ctx.topKeywords.slice(0, 10).map((k) => `- "${k.keyword}" (${k.intentType}, competition: ${k.estimatedCompetitiveness})`).join('\n')}

### SERP-Validated Keywords
${ctx.serpValidated.length > 0
    ? ctx.serpValidated.map((v) => {
        const parts = [`- "${v.keyword}": ${v.hasContentGap ? 'CONTENT GAP' : 'competitive'} — ${v.serpInsight}`];
        if (v.peopleAlsoAsk.length > 0) parts.push(`  People Also Ask: ${v.peopleAlsoAsk.slice(0, 5).map((q) => `"${q}"`).join(', ')}`);
        return parts.join('\n');
      }).join('\n')
    : '(No SERP validation data)'}

### Content Strategy
- Angle: ${ctx.contentStrategy.recommendedAngle}
- Top Opportunities: ${ctx.contentStrategy.topOpportunities.join('; ')}

### SERP Evaluation (${vertical})
- Green flags: ${serpCriteria.greenFlags.slice(0, 4).join('; ')}
- Red flags: ${serpCriteria.redFlags.slice(0, 3).join('; ')}

### Community Sources
- Subreddits: ${communityMapping.subreddits.slice(0, 4).join(', ')}
- Forums: ${communityMapping.forums.slice(0, 3).join(', ')}

### Content Gap Types
${contentGapTypes.map((g) => `- ${g.type}: ${g.description}`).join('\n')}

### Keyword Patterns (${vertical})
${keywordPatterns.slice(0, 3).map((p) => `- ${p.category}: ${p.patterns.slice(0, 2).join(', ')}`).join('\n')}

### Intent Multipliers for Meta Tag Prioritization
${INTENT_WEIGHTS.map((i) => `- ${i.intent}: ${i.weight}x`).join('\n')}`;
}

export function buildBrandIdentityPrompt(
  idea: ProductIdea,
  ctx: ContentContext,
): string {
  const vertical = detectVertical(idea);
  const seoContext = buildSEOContext(ctx, vertical);

  return `You are a brand strategist specializing in ${vertical === 'b2b-saas' ? 'B2B SaaS products' : vertical === 'healthcare-consumer' ? 'healthcare consumer products' : 'niche digital products'}. Design a brand for a painted door test targeting "${ctx.targetUser}".

## PRODUCT CONTEXT
- Name: ${ctx.ideaName}
- Description: ${ctx.ideaDescription}
- Target User: ${ctx.targetUser}
- Problem Solved: ${ctx.problemSolved}
- Summary: ${ctx.summary}

## COMPETITOR LANDSCAPE
${ctx.competitors}

${seoContext}

## INSTRUCTIONS

Design a complete brand identity for a painted door test website. This is a real product landing page — it should look professional, trustworthy, and distinct (not like a generic AI template).

${vertical === 'healthcare-consumer' ? 'For healthcare: use clinical trust signals, calming colors, accessible language. Avoid making medical claims.' : ''}
${vertical === 'b2b-saas' ? 'For B2B SaaS: use professional authority, clean design, data-driven positioning.' : ''}

CRITICAL RULES:
- Do NOT fabricate testimonials, user counts, or social proof
- Social proof approach should describe the TYPE of proof to add later (e.g., "early access waitlist count", "beta user testimonials once available")
- Value props must be derived from the actual problem/solution, not invented features
- Colors must be accessible (sufficient contrast ratios)
- Fonts must be from Google Fonts

SEO REQUIREMENTS:
- seoDescription: Must naturally include the #1 target keyword AND one secondary keyword. Write for click-through rate — compelling, specific, 150-160 chars.
- heroHeadline: Must contain the primary target keyword. It should read naturally to humans while being optimized for search.
- heroSubheadline: Incorporate 1-2 secondary keywords naturally.
- tagline: Should reinforce the core search intent users have.
- Value prop titles: Each should target a different secondary keyword or People Also Ask question where possible.
- ctaText: Use action-oriented language matching the dominant search intent (transactional → "Get Started Free", informational → "Learn How It Works").

Respond with ONLY valid JSON matching this exact schema:
{
  "siteName": "string (the brand name — can differ from product name)",
  "tagline": "string (concise value prop, 5-10 words)",
  "seoDescription": "string (150-160 chars for meta description, include primary keyword)",
  "targetDemographic": "string (specific audience description)",
  "voice": {
    "tone": "string (e.g., 'professional and approachable')",
    "personality": "string (e.g., 'knowledgeable friend who simplifies complexity')",
    "examples": ["string (example sentence in brand voice)", "string", "string"]
  },
  "colors": {
    "primary": "#hex",
    "primaryLight": "#hex (lighter variant of primary)",
    "background": "#hex (page background, dark theme preferred)",
    "backgroundElevated": "#hex (card/elevated surface background)",
    "textPrimary": "#hex (main text color)",
    "textSecondary": "#hex (secondary text)",
    "textMuted": "#hex (muted/helper text)",
    "accent": "#hex (accent for highlights, different from primary)",
    "border": "#hex (subtle borders)"
  },
  "typography": {
    "headingFont": "string (Google Font name)",
    "bodyFont": "string (Google Font name)",
    "monoFont": "string (Google Font name)"
  },
  "landingPage": {
    "heroHeadline": "string (compelling, keyword-rich headline)",
    "heroSubheadline": "string (1-2 sentences expanding on the headline)",
    "ctaText": "string (button text, e.g., 'Get Early Access')",
    "valueProps": [
      { "title": "string (short title)", "description": "string (1-2 sentences)" },
      { "title": "string", "description": "string" },
      { "title": "string", "description": "string" }
    ],
    "socialProofApproach": "string (describe the type of social proof to use, not actual testimonials)"
  }
}`;
}

export function buildCoreFilesPrompt(
  brand: BrandIdentity,
  idea: ProductIdea,
  ctx: ContentContext,
): string {
  const vertical = detectVertical(idea);
  const seoContext = buildSEOContext(ctx, vertical);

  return `You are a senior Next.js developer building a production landing page. Generate the core files for a painted door test website.

## BRAND IDENTITY
${JSON.stringify(brand, null, 2)}

## PRODUCT CONTEXT
- Name: ${ctx.ideaName}
- Description: ${ctx.ideaDescription}
- Target User: ${ctx.targetUser}
- Problem Solved: ${ctx.problemSolved}

${seoContext}

## FILES TO GENERATE

Generate these files as a JSON object where keys are file paths and values are file contents:

1. **app/layout.tsx** — Root layout with:
   - Google Fonts import for ${brand.typography.headingFont}, ${brand.typography.bodyFont}, ${brand.typography.monoFont}
   - SEO metadata using brand tagline, seoDescription
   - Primary keywords from research in metadata
   - Dark theme using brand colors

2. **app/globals.css** — Complete Tailwind CSS v4 design system:
   - CSS custom properties for all brand color tokens
   - Typography classes using brand fonts
   - Component styles (buttons, cards, inputs, badges)
   - Responsive design utilities
   - Use @import "tailwindcss" (Tailwind v4 syntax, NOT @tailwind directives)

3. **app/page.tsx** — Landing page with:
   - Hero section with headline, subheadline, CTA
   - Value proposition cards
   - Email capture form (POST to /api/signup)
   - FAQ section using People Also Ask data if available
   - Clean, modern layout — NOT a generic template

4. **app/robots.ts** — Standard robots.txt allowing all crawlers

5. **app/sitemap.ts** — Dynamic sitemap including homepage and future content pages

6. **app/api/signup/route.ts** — Email capture endpoint:
   - Validates email format
   - Uses @upstash/redis to store signups
   - RPUSH to email_signups:{SITE_ID} list
   - INCR email_signups_count:{SITE_ID}
   - Reads SITE_ID from process.env.SITE_ID
   - Returns JSON { success: true } or { error: string }

7. **components/content/MarkdownRenderer.tsx** — Client component:
   - Renders HTML string with proper styling
   - Applies prose-like typography from brand

8. **components/content/JsonLd.tsx** — Structured data component:
   - Accepts schema type and data
   - Renders as script tag with type application/ld+json

CRITICAL RULES:
- All files must be valid TypeScript/TSX
- Use 'use client' directive where needed (form interactions, client hooks)
- Email form must handle loading/success/error states
- Layout must include viewport meta tag
- Do NOT use any placeholder images or external image URLs
- The signup route must use @upstash/redis (import { Redis } from '@upstash/redis')
- globals.css MUST use @import "tailwindcss" (Tailwind v4), NOT @tailwind base/components/utilities

## SEO REQUIREMENTS — CRITICAL

The landing page is the most important page for search ranking. Follow these rules:

### Metadata (in layout.tsx)
- Title tag format: "{Primary Keyword} — {Brand Name}" (under 60 chars)
- Use the seoDescription as the meta description
- Include Open Graph tags (og:title, og:description, og:type, og:url, og:site_name)
- Include Twitter Card tags (twitter:card=summary_large_image, twitter:title, twitter:description)
- Set canonical URL via metadata.alternates.canonical

### Heading Hierarchy (in page.tsx)
- Exactly ONE H1 per page containing the primary target keyword
- H2 headings for each major section (value props, FAQ, etc.) — incorporate secondary keywords
- H2/H3 subheadings should use natural variations of target keywords and People Also Ask questions

### Structured Data (in page.tsx)
- Add Organization schema (JSON-LD) with brand name and site URL
- Add WebSite schema with search potential
- If there are FAQ/PAA questions, add FAQPage schema with real Q&A from People Also Ask data

### Semantic HTML
- Use <main>, <section>, <article>, <header>, <footer> elements properly
- Each value prop section should be wrapped in <section> with aria-label
- Links should have descriptive anchor text (not "click here")

### Internal Linking
- Include nav links to /blog, /compare, and /faq sections in footer or navigation
- Use keyword-rich anchor text for internal links

### Landing Page Content
- FAQ section is MANDATORY — use People Also Ask questions from SERP data as FAQ items
- FAQs should be wrapped in FAQPage JSON-LD schema
- Each FAQ answer should be 2-3 sentences, naturally incorporating related keywords
- Include at least 4-6 FAQ items

Respond with ONLY valid JSON:
{ "files": { "app/layout.tsx": "file content...", "app/globals.css": "file content...", ... } }`;
}

export function buildContentPagesPrompt(
  brand: BrandIdentity,
  layoutContent: string,
  cssContent: string,
  idea: ProductIdea,
  ctx: ContentContext,
): string {
  const vertical = detectVertical(idea);

  return `You are a senior Next.js developer. Generate the content pages and configuration files for a website.

## BRAND IDENTITY
${JSON.stringify(brand, null, 2)}

## EXISTING FILES (for consistency — match the design system and imports)

### app/layout.tsx (reference only, do not regenerate):
\`\`\`tsx
${layoutContent.slice(0, 2000)}
\`\`\`

### app/globals.css (reference only, do not regenerate):
\`\`\`css
${cssContent.slice(0, 1500)}
\`\`\`

${buildSEOContext(ctx, vertical)}

## SEO REQUIREMENTS FOR CONTENT PAGES

### Blog pages (app/blog/[slug]/page.tsx)
- generateMetadata must pull title and description from frontmatter
- Title format: "{Post Title} | {Brand Name}" (under 60 chars)
- Add Article schema (JSON-LD) with headline, datePublished, author, description
- Include canonical URL from frontmatter or auto-generated
- H1 = post title, subheadings from content

### Comparison pages (app/compare/[slug]/page.tsx)
- generateMetadata with comparison-specific title: "{Product A} vs {Product B} | {Brand Name}"
- Add Article schema for comparison content

### FAQ pages (app/faq/[slug]/page.tsx)
- generateMetadata with question-focused titles
- Add FAQPage schema (JSON-LD) extracting Q&A pairs from content
- Structure content with proper question (H2/H3) and answer (paragraph) hierarchy

### Blog listing (app/blog/page.tsx)
- generateMetadata with keyword: "{Topic} Blog — Tips & Guides | {Brand Name}"
- Include a brief keyword-rich intro paragraph (2-3 sentences) above the post list

### All content pages
- Include internal links back to landing page and to other content sections
- Footer with links to /, /blog, /compare, /faq
- Use descriptive anchor text with keyword variations

## FILES TO GENERATE

Generate these files as a JSON object where keys are file paths and values are file contents:

1. **lib/content.ts** — Markdown content reader:
   - Reads .md files from content/ directories using fs
   - Parses YAML frontmatter using gray-matter
   - Returns { slug, title, description, type, date, content (HTML), targetKeywords, ideaName, status }
   - Functions: getAllPosts(type), getPostBySlug(type, slug)
   - Type-to-directory map: { 'blog-post': 'content/blog', 'comparison': 'content/comparison', 'faq': 'content/faq' }
   - Use remark + remark-html for markdown-to-HTML conversion
   - IMPORTANT: Handle case where content directory doesn't exist (return empty array)

2. **app/blog/page.tsx** — Blog listing:
   - Server component
   - Lists all blog posts from lib/content.ts
   - Shows title, description, date for each
   - Links to /blog/[slug]
   - Empty state message when no posts yet
   - Styled with brand design system

3. **app/blog/[slug]/page.tsx** — Blog detail:
   - Server component with generateStaticParams
   - Renders full markdown content via MarkdownRenderer
   - JsonLd for Article schema
   - SEO metadata from frontmatter
   - Back link to /blog

4. **app/compare/[slug]/page.tsx** — Comparison article:
   - Server component with generateStaticParams
   - Same pattern as blog detail but for comparison content
   - Reads from content/comparison directory

5. **app/faq/[slug]/page.tsx** — FAQ page:
   - Server component with generateStaticParams
   - Same pattern as blog detail but for FAQ content
   - Reads from content/faq directory
   - JsonLd for FAQPage schema

6. **package.json** — Dependencies:
   - next: "^15.0.0"
   - react, react-dom: "^19.0.0"
   - @upstash/redis: "^1.34.0"
   - gray-matter: "^4.0.3"
   - remark: "^15.0.1"
   - remark-html: "^16.0.1"
   - tailwindcss: "^4.0.0"
   - @tailwindcss/postcss: "^4.0.0"
   - typescript: "^5.0.0"
   - @types/react, @types/node as devDependencies

7. **tsconfig.json** — Standard Next.js TypeScript config with path aliases

8. **next.config.ts** — Minimal Next.js config (output standalone if useful)

9. **postcss.config.mjs** — PostCSS config for Tailwind v4:
   - Use @tailwindcss/postcss plugin

10. **.gitignore** — Standard Next.js gitignore

CRITICAL RULES:
- lib/content.ts MUST handle missing content directories gracefully (try/catch around fs.readdirSync)
- generateStaticParams must return empty array if no content files exist
- All pages must use the same design system from globals.css
- package.json must include ALL required dependencies
- Use "type": "module" in package.json
- tsconfig should use "moduleResolution": "bundler"
- Do NOT import from @/ paths — use relative paths since there's no src/ directory
- Next.js 15 REQUIRES params to be a Promise in dynamic routes. Use this pattern:
  type Props = { params: Promise<{ slug: string }> }
  export default async function Page({ params }: Props) { const { slug } = await params; ... }
  Do NOT use { params: { slug: string } } — that will cause a build error.

Respond with ONLY valid JSON:
{ "files": { "lib/content.ts": "file content...", "app/blog/page.tsx": "file content...", ... } }`;
}
