import { ContentContext } from './content-prompts';
import {
  detectVertical,
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
  visualOnly = false,
  foundationDocs?: { type: string; content: string }[],
): string {
  const vertical = detectVertical(idea);
  const seoContext = buildSEOContext(ctx, vertical);

  const foundationSection = foundationDocs && foundationDocs.length > 0
    ? `\n\n## FOUNDATION DOCUMENTS (Source of Truth)
These strategic documents have already been finalized. Derive the brand identity from them.
Do not contradict any decisions made in these documents.

${foundationDocs.map((d) => `### ${d.type}\n${d.content}`).join('\n\n')}\n`
    : '';

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
${foundationSection}
## INSTRUCTIONS

Design a complete brand identity for a painted door test website. This is a real product landing page — it should look professional, trustworthy, and distinct (not like a generic AI template).

${vertical === 'healthcare-consumer' ? 'For healthcare: use clinical trust signals, calming colors, accessible language. Avoid making medical claims.' : ''}
${vertical === 'b2b-saas' ? 'For B2B SaaS: use professional authority, clean design, data-driven positioning.' : ''}

CRITICAL RULES:
- Colors must be accessible (sufficient contrast ratios)
- Fonts must be from Google Fonts
${visualOnly ? '' : `- Value props must be derived from the actual problem/solution, not invented features

SEO REQUIREMENTS:
- seoDescription: Must naturally include the #1 target keyword AND one secondary keyword. Write for click-through rate — compelling, specific, 150-160 chars.
- heroHeadline: Must contain the primary target keyword. It should read naturally to humans while being optimized for search.
- heroSubheadline: Incorporate 1-2 secondary keywords naturally.
- tagline: Should reinforce the core search intent users have.
- Value prop titles: Each should target a different secondary keyword or People Also Ask question where possible.
- ctaText: Use action-oriented language matching the dominant search intent (transactional → "Get Started Free", informational → "Learn How It Works").`}

Respond with ONLY valid JSON matching this exact schema:
${visualOnly ? `{
  "siteName": "string (the brand name — can differ from product name)",
  "tagline": "string (concise value prop, 5-10 words)",
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
  }
}

Do NOT include landingPage, seoDescription, or any copy fields — those are generated separately.` : `{
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
    "faqs": [
      { "question": "string (derived from People Also Ask data)", "answer": "string (2-3 sentences)" }
    ]
  }
}

Include 4-6 FAQ items in the faqs array derived from People Also Ask questions in the SERP data. Each answer should be 2-3 sentences, naturally incorporating related keywords.`}`;
}

