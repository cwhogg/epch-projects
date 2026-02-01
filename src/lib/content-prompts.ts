import { ContentPiece } from '@/types';

export interface ContentContext {
  ideaName: string;
  ideaDescription: string;
  targetUser: string;
  problemSolved: string;
  url?: string;
  // From analysis
  scores: { seoOpportunity: number | null; competitiveLandscape: number | null; willingnessToPay: number | null; differentiationPotential: number | null; expertiseAlignment: number | null; overall: number | null };
  summary: string;
  risks: string[];
  // From SEO data
  topKeywords: { keyword: string; intentType: string; estimatedVolume: string; estimatedCompetitiveness: string; contentGapHypothesis: string; relevanceToMillionARR: string }[];
  serpValidated: { keyword: string; hasContentGap: boolean; serpInsight: string; peopleAlsoAsk: string[]; relatedSearches: string[]; contentGapTypes?: string[]; greenFlags?: string[]; redFlags?: string[] }[];
  contentStrategy: { topOpportunities: string[]; recommendedAngle: string };
  difficultyAssessment: { dominantPlayers: string[]; roomForNewEntrant: boolean; reasoning: string };
  // From competitor data
  competitors: string;
  // Expertise
  expertiseProfile: string;
}

function buildBaseContext(ctx: ContentContext): string {
  return `PRODUCT CONTEXT:
- Name: ${ctx.ideaName}
- Description: ${ctx.ideaDescription}
- Target User: ${ctx.targetUser}
- Problem Solved: ${ctx.problemSolved}
${ctx.url ? `- URL: ${ctx.url}` : ''}
- Summary: ${ctx.summary}

SEO DATA:
- Top Keywords: ${ctx.topKeywords.slice(0, 15).map((k) => `"${k.keyword}" (${k.intentType}, competition: ${k.estimatedCompetitiveness})`).join(', ')}
- Content Strategy Angle: ${ctx.contentStrategy.recommendedAngle}
- Top Opportunities: ${ctx.contentStrategy.topOpportunities.join('; ')}
- Room for New Entrant: ${ctx.difficultyAssessment.roomForNewEntrant ? 'Yes' : 'No'} — ${ctx.difficultyAssessment.reasoning}

SERP-VALIDATED KEYWORDS:
${ctx.serpValidated.length > 0
    ? ctx.serpValidated.map((v) => {
        const parts = [`- "${v.keyword}": ${v.hasContentGap ? 'CONTENT GAP' : 'competitive'} — ${v.serpInsight}`];
        if (v.peopleAlsoAsk.length > 0) parts.push(`  People Also Ask: ${v.peopleAlsoAsk.slice(0, 5).map((q) => `"${q}"`).join(', ')}`);
        if (v.relatedSearches.length > 0) parts.push(`  Related Searches: ${v.relatedSearches.slice(0, 5).join(', ')}`);
        if (v.greenFlags?.length) parts.push(`  Green flags: ${v.greenFlags.join('; ')}`);
        if (v.redFlags?.length) parts.push(`  Red flags: ${v.redFlags.join('; ')}`);
        return parts.join('\n');
      }).join('\n')
    : '(No SERP validation data available)'}

COMPETITOR LANDSCAPE:
${ctx.competitors}

${ctx.expertiseProfile}`;
}

export function buildCalendarPrompt(ctx: ContentContext): string {
  return `You are a CONTENT STRATEGIST creating a prioritized content calendar for a B2B SaaS product.

${buildBaseContext(ctx)}

Create a prioritized content calendar of 6-10 content pieces. Each piece should be one of these types:
- blog-post: Target informational/commercial keywords, fill content gaps, 1500-3000 words
- landing-page: Conversion copy — hero, problem, solution, differentiation, FAQ, CTA
- comparison: Honest "X vs Y" using real competitor data, overview table, recommendation
- faq: From People Also Ask + related searches, schema-friendly Q&A, 2000-3000 words

PRIORITIZATION RULES:
1. Blog posts targeting SERP-validated content gaps (highest confidence — real data backs these)
2. FAQ page from People Also Ask data (quick win, targets many long-tail queries)
3. Comparison articles using competitor data + "X vs Y" keywords (high commercial intent)
4. Landing page copy (conversion-focused, use after organic traffic grows)

For each piece, provide:
- type: one of blog-post, landing-page, comparison, faq
- title: compelling, SEO-optimized title
- slug: URL-friendly slug (e.g., "ultimate-guide-to-remote-patient-monitoring")
- targetKeywords: array of 3-5 keywords this piece should target
- contentGap: what gap in existing content this fills (if applicable)
- priority: 1 (highest) to 10 (lowest)
- rationale: why this piece matters and what it achieves

Also provide a brief strategySummary (2-3 sentences) explaining the overall content approach.

Respond ONLY with valid JSON matching this schema:
{
  "strategySummary": "string",
  "pieces": [
    {
      "type": "blog-post",
      "title": "string",
      "slug": "string",
      "targetKeywords": ["keyword1", "keyword2"],
      "contentGap": "string or null",
      "priority": 1,
      "rationale": "string"
    }
  ]
}`;
}

export function buildBlogPostPrompt(ctx: ContentContext, piece: ContentPiece): string {
  return `You are an EXPERT CONTENT WRITER creating a high-quality blog post for a B2B SaaS product.

${buildBaseContext(ctx)}

CONTENT PIECE BRIEF:
- Title: ${piece.title}
- Target Keywords: ${piece.targetKeywords.join(', ')}
- Content Gap: ${piece.contentGap || 'General content opportunity'}
- Rationale: ${piece.rationale}

INSTRUCTIONS:
1. Write a comprehensive blog post of 1500-3000 words
2. Start with YAML frontmatter (see format below)
3. Use target keywords naturally throughout — in the title, H2s, first paragraph, and conclusion
4. Include People Also Ask questions as H2 or H3 headings where relevant:
${ctx.serpValidated.flatMap((v) => v.peopleAlsoAsk).slice(0, 8).map((q) => `   - ${q}`).join('\n')}
5. Reference competitor weaknesses and gaps as opportunities for ${ctx.ideaName}
6. Include actionable takeaways, data points, and specific examples
7. Write in a professional but approachable tone — expert authority without jargon overload
8. End with a clear CTA related to ${ctx.ideaName}

YAML FRONTMATTER FORMAT:
---
title: "${piece.title}"
description: "[150-160 character SEO meta description summarizing the post's value proposition]"
type: blog-post
targetKeywords: [${piece.targetKeywords.map((k) => `"${k}"`).join(', ')}]
contentGap: "${piece.contentGap || ''}"
generatedAt: "${new Date().toISOString()}"
ideaName: "${ctx.ideaName}"
status: draft
wordCount: [actual word count]
---

Write the complete blog post now. Output ONLY the markdown content starting with the YAML frontmatter.`;
}

export function buildLandingPagePrompt(ctx: ContentContext, piece: ContentPiece): string {
  return `You are a CONVERSION COPYWRITER creating landing page copy for a B2B SaaS product.

${buildBaseContext(ctx)}

CONTENT PIECE BRIEF:
- Title: ${piece.title}
- Target Keywords: ${piece.targetKeywords.join(', ')}
- Rationale: ${piece.rationale}

INSTRUCTIONS:
Write landing page copy in markdown with these sections:

1. **Hero Section** — Compelling headline + subheadline + CTA. Address the core pain point immediately.
2. **Problem Section** — Describe the problem in vivid, specific terms the target user recognizes
3. **Solution Section** — How ${ctx.ideaName} solves it, with 3-4 key benefits
4. **Differentiation Section** — Why ${ctx.ideaName} over alternatives. Use real competitor weaknesses:
${ctx.competitors.substring(0, 1000)}
5. **How It Works** — 3-4 simple steps
6. **Social Proof / Trust Signals** — Placeholder for testimonials, metrics, logos
7. **FAQ Section** — Use real People Also Ask questions:
${ctx.serpValidated.flatMap((v) => v.peopleAlsoAsk).slice(0, 6).map((q) => `   - ${q}`).join('\n')}
8. **Final CTA** — Strong close with urgency/value proposition

YAML FRONTMATTER FORMAT:
---
title: "${piece.title}"
description: "[150-160 character SEO meta description highlighting the key benefit]"
type: landing-page
targetKeywords: [${piece.targetKeywords.map((k) => `"${k}"`).join(', ')}]
generatedAt: "${new Date().toISOString()}"
ideaName: "${ctx.ideaName}"
status: draft
wordCount: [actual word count]
---

Write the complete landing page copy now. Output ONLY the markdown starting with YAML frontmatter.`;
}

export function buildComparisonPrompt(ctx: ContentContext, piece: ContentPiece): string {
  return `You are a PRODUCT ANALYST writing an honest comparison article for a B2B SaaS product.

${buildBaseContext(ctx)}

CONTENT PIECE BRIEF:
- Title: ${piece.title}
- Target Keywords: ${piece.targetKeywords.join(', ')}
- Content Gap: ${piece.contentGap || 'Missing honest comparison content'}
- Rationale: ${piece.rationale}

INSTRUCTIONS:
1. Write an honest, balanced "X vs Y" comparison article (1500-2500 words)
2. Start with YAML frontmatter
3. Include an overview comparison table with real data:
   | Feature | ${ctx.ideaName} | Competitor |
   |---------|------|------------|
   Use real pricing, features, and positioning from the competitor data above.
4. Be genuinely balanced — acknowledge competitor strengths honestly
5. Highlight differentiation opportunities where ${ctx.ideaName} has genuine advantages
6. Include a "Who should choose X" and "Who should choose Y" section
7. End with an honest recommendation
8. Use target keywords naturally throughout
9. Include People Also Ask as H3 subsections where relevant

YAML FRONTMATTER FORMAT:
---
title: "${piece.title}"
description: "[150-160 character SEO meta description for the comparison]"
type: comparison
targetKeywords: [${piece.targetKeywords.map((k) => `"${k}"`).join(', ')}]
contentGap: "${piece.contentGap || ''}"
generatedAt: "${new Date().toISOString()}"
ideaName: "${ctx.ideaName}"
status: draft
wordCount: [actual word count]
---

Write the complete comparison article now. Output ONLY the markdown starting with YAML frontmatter.`;
}

export function buildFAQPrompt(ctx: ContentContext, piece: ContentPiece): string {
  const allPAA = ctx.serpValidated.flatMap((v) => v.peopleAlsoAsk);
  const allRelated = ctx.serpValidated.flatMap((v) => v.relatedSearches);

  return `You are a SUBJECT MATTER EXPERT writing a comprehensive FAQ page for a B2B SaaS product.

${buildBaseContext(ctx)}

CONTENT PIECE BRIEF:
- Title: ${piece.title}
- Target Keywords: ${piece.targetKeywords.join(', ')}
- Rationale: ${piece.rationale}

REAL "PEOPLE ALSO ASK" QUESTIONS FROM GOOGLE:
${allPAA.map((q) => `- ${q}`).join('\n') || '(No PAA data available — generate common questions based on the keywords)'}

RELATED SEARCHES FROM GOOGLE:
${allRelated.map((s) => `- ${s}`).join('\n') || '(No related search data available)'}

INSTRUCTIONS:
1. Write a comprehensive FAQ page (2000-3000 words)
2. Start with YAML frontmatter
3. Organize into logical categories (e.g., "Getting Started", "Features", "Pricing", "Technical")
4. Use EVERY People Also Ask question above as an actual Q&A — these are real questions people search for
5. Add additional questions based on related searches and keyword intent
6. Format for FAQ schema (each Q&A clearly structured as Q: and A:)
7. Answers should be thorough (2-5 sentences each) but scannable
8. Naturally incorporate target keywords in questions and answers
9. Reference ${ctx.ideaName} where appropriate but don't force it — prioritize helpful answers
10. Include a brief intro paragraph before the FAQ sections

YAML FRONTMATTER FORMAT:
---
title: "${piece.title}"
description: "[150-160 character SEO meta description for the FAQ page]"
type: faq
targetKeywords: [${piece.targetKeywords.map((k) => `"${k}"`).join(', ')}]
generatedAt: "${new Date().toISOString()}"
ideaName: "${ctx.ideaName}"
status: draft
wordCount: [actual word count]
---

Write the complete FAQ page now. Output ONLY the markdown starting with YAML frontmatter.`;
}
