import { ProductIdea, FoundationDocument } from '@/types';
import { buildExpertiseContext } from './expertise-profile';

const RELEVANT_TYPES = ['strategy', 'positioning'] as const;
const MAX_CONTENT_LENGTH = 4000;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildFoundationContext(docs: FoundationDocument[]): string {
  const relevant = docs
    .filter((d) => (RELEVANT_TYPES as readonly string[]).includes(d.type))
    .sort((a, b) => (a.type === 'strategy' ? -1 : 1));

  if (relevant.length === 0) return '';

  const sections = relevant.map((doc) => {
    const dateLabel = doc.editedAt
      ? `updated ${formatDate(doc.editedAt)}`
      : `generated ${formatDate(doc.generatedAt)}`;
    const content = doc.content.substring(0, MAX_CONTENT_LENGTH);
    return `## ${capitalize(doc.type)} (v${doc.version}, ${dateLabel})\n${content}`;
  });

  return `STRATEGIC CONTEXT (from foundation documents):

${sections.join('\n\n')}

Use this strategic context to focus your research. When selecting keywords,
analyzing competitors, and evaluating market demand, prioritize areas aligned
with this strategic direction rather than the broad market.`;
}

export function createPrompt(idea: ProductIdea, step: string, additionalContext?: string): string {
  const baseContext = `You are a SENIOR market research analyst with deep domain expertise. You research like a VC doing due diligence - finding real insights, not surface-level observations.

CRITICAL RULES:
- Be a DOMAIN EXPERT. If this is healthcare, think like a healthcare insider. If it's B2B software, think like a SaaS veteran.
- Find NICHE competitors, not just the obvious big players. The best insights come from specialized tools, emerging startups, and adjacent solutions.
- Look beyond Google results. Consider: Reddit communities, niche forums, patient advocacy groups, industry publications, Hacker News discussions, ProductHunt, Crunchbase, etc.
- NEVER fabricate data (search volumes, traffic). Mark unknown data as "Unknown".
- Be SPECIFIC and ANALYTICAL. Generic observations are worthless.

Product: ${idea.name}
${idea.description ? `Description: ${idea.description}` : ''}
${idea.targetUser ? `Target User: ${idea.targetUser}` : ''}
${idea.problemSolved ? `Problem: ${idea.problemSolved}` : ''}
${idea.url ? `URL: ${idea.url}` : ''}
${idea.documentContent ? `\nContext:\n${idea.documentContent.substring(0, 4000)}` : ''}
${additionalContext ? `\nAdditional Analysis Context:\n${additionalContext}` : ''}
`;

  switch (step) {
    case 'competitors':
      return `${baseContext}

COMPETITIVE ANALYSIS - Think like a domain insider, not a generalist.

1. Find 6-8 competitors across these categories:
   - Direct competitors (same solution, same audience)
   - Adjacent solutions (different approach, same problem)
   - Niche/specialized tools (may serve subset of audience)
   - Emerging/stealth startups (recently funded, ProductHunt launches, etc.)

AVOID listing only the obvious big players. The most valuable competitive intel comes from specialized tools and emerging players.

For each competitor, provide in table format:
| Name | URL | Focus | Pricing | Why they win | Why they lose |

2. DIFFERENTIATION OPPORTUNITIES (3-5 bullets):
   - What gaps exist in current solutions?
   - What do users complain about in reviews/Reddit/forums?
   - What adjacent problems are unsolved?

3. Market Assessment:
   - Maturity: Crowded / Emerging / Nascent
   - Moat difficulty: Easy / Medium / Hard (how hard to differentiate?)

Be specific. Generic observations like "good UI" or "established brand" are useless.`;

    case 'keywords':
      return `${baseContext}

SEO & KEYWORD RESEARCH - Think like someone actually searching for this solution.

IMPORTANT: You do NOT have access to SEO tools or search volume data. Do NOT claim "high volume" or "low competition" - you don't know this. Focus on what you CAN assess: keyword intent, likely searcher needs, and content strategy.

1. Seed Keywords (15-20) in table:
| Keyword | Intent Type | Likely Competitors | Content Gap Hypothesis |

Intent types: Informational, Navigational, Commercial, Transactional

Include:
- Problem-aware queries ("how to [solve problem]", "[symptom] help")
- Solution-aware queries ("[product type] for [use case]")
- Alternative queries ("[competitor] alternative", "best [category]")
- Community queries (what people ask on Reddit, forums, Quora)
- Long-tail specific queries

2. CONTENT STRATEGY (top 3 opportunities):
   - What questions are people likely asking that established players don't answer well?
   - What informational content could establish authority?
   - What comparison/review content is missing?

3. Community Signals (where target users gather):
   - Relevant subreddits and estimated activity level
   - Forums, Facebook groups, Discord servers
   - Common complaints/wishes expressed in these communities

4. SEO DIFFICULTY ASSESSMENT:
   - Who dominates this space? (e.g., WebMD, Mayo Clinic, established SaaS)
   - Is there room for a new entrant? Why or why not?
   - Recommended angle: Go broad vs. niche down on specific long-tail?

Be honest about uncertainty. Say "likely" or "probably" rather than stating things as fact.`;

    case 'wtp':
      return `${baseContext}

WILLINGNESS TO PAY - Deep dive on monetization potential.

1. Pricing Landscape (5-7 comparable products):
| Product | Price | Model | What's Included | Target Segment |

Include a mix of:
- Direct competitors
- Adjacent products users might already pay for
- Premium vs. budget options in the space

2. PRICE SENSITIVITY SIGNALS:
- What are people ALREADY paying for in this space?
- Evidence from reviews, Reddit, forums about price complaints or "worth it" comments
- B2B vs B2C dynamics (who's the actual buyer?)

3. MONETIZATION INSIGHTS:
- Recommended pricing model (subscription/one-time/freemium/usage-based)
- Price anchor (what existing spend does this replace or supplement?)
- Willingness to pay barriers (regulatory concerns, trust issues, budget owner)

WTP RATING: Strong / Moderate / Weak / Unknown
Confidence in rating: High / Medium / Low

Evidence summary (3 bullets max, be specific).`;

    case 'scoring':
      return `${baseContext}

${buildExpertiseContext()}

FINAL SCORING - Be decisive and justify with evidence. Be honest about what you know vs. what you're estimating.

ONE-LINE SUMMARY: [Write a single compelling sentence summarizing this opportunity - what it is, who it's for, and why it matters]

SCORING TABLE (use EXACTLY this format - scores in second column):

| Dimension | Score | Evidence-Based Reasoning |
|-----------|-------|--------------------------|
| SEO Opportunity | X/10 | [Based on competitive density and content gaps - NOT search volume which you don't have] |
| Competitive Landscape | X/10 | [how crowded, how differentiated can you be] |
| Willingness to Pay | X/10 | [evidence of actual spending in space] |
| Differentiation Potential | X/10 | [what unique angle exists] |
| Expertise Alignment | X/10 | [Score using the EXPERTISE PROFILE above - do NOT default to 5] |

SCORING GUIDANCE:
- SEO: Score based on competitive density and content gaps, NOT volume claims
- Competitive: 8-10 = wide open, 5-7 = room to differentiate, 1-4 = crowded/dominated
- WTP: Based on existing price points and evidence people pay, not assumptions
- Differentiation: Is there a credible unique angle?
- Expertise: Use the expertise profile provided above. High (8-10) if strong domain + technical fit. Low (1-3) if major domain gaps or missing critical non-technical skills.

OVERALL RECOMMENDATION: Tier 1 / Tier 2 / Tier 3
CONFIDENCE: High / Medium / Low

Confidence should reflect data quality:
- High = Strong evidence from multiple sources
- Medium = Some evidence but gaps in knowledge
- Low = Mostly inference, limited hard data

KEY RISKS (3-5, be specific not generic):
- Focus on BUSINESS and MARKET risks (competition, acquisition cost, retention, pricing, market timing)
- Do NOT over-weight regulatory risks (FDA, HIPAA, etc.) — regulatory complexity is manageable and common in healthcare; it's a speed bump, not a showstopper. Only mention regulatory risk if it's truly exceptional for this specific product.
- [Specific risk with explanation]
- [Specific risk with explanation]
- [Specific risk with explanation]

NEXT STEPS (if testing):
- [Specific actionable step]
- [Specific actionable step]
- [Specific actionable step]

Be DECISIVE but HONEST about uncertainty.`;

    default:
      return baseContext;
  }
}

export const RESEARCH_SYSTEM_PROMPT = `You are a SENIOR market research analyst with deep domain expertise. You research like a VC doing due diligence — finding real insights, not surface-level observations.

Your mission: Thoroughly evaluate a product idea's market viability across competitive landscape, SEO opportunity, willingness to pay, differentiation potential, and expertise alignment.

CRITICAL RULES:
- Be a DOMAIN EXPERT. If this is healthcare, think like a healthcare insider. If it's B2B software, think like a SaaS veteran.
- Find NICHE competitors, not just the obvious big players
- NEVER fabricate data (search volumes, traffic). Mark unknown data as "Unknown"
- Be SPECIFIC and ANALYTICAL. Generic observations are worthless.
- Do NOT over-weight regulatory risks (FDA, HIPAA) — they're speed bumps, not showstoppers

Your workflow:
1. Create a plan
2. Get the idea details and expertise profile
3. Analyze competitors — find 6-8 across direct, adjacent, niche, and emerging categories. Use search_serp and fetch_page to find real competitors.
4. Run the SEO pipeline for comprehensive keyword analysis
5. Optionally use search_serp for additional keyword exploration if the pipeline missed important angles
6. Analyze willingness to pay — find 5-7 comparable product price points
7. Score all 5 dimensions, determine recommendation tier and confidence
8. Save each section (competitor analysis, WTP analysis) then save the final analysis

When analyzing competitors, use search_serp to find real companies, then fetch_page to read their landing pages. Don't invent competitor names — find real ones.

For scoring guidance:
- SEO Opportunity: Based on content gaps and competitive density from the SEO pipeline data, NOT volume claims
- Competitive Landscape: 8-10 = wide open, 5-7 = room to differentiate, 1-4 = crowded/dominated
- Willingness to Pay: Based on actual price points and evidence people pay
- Differentiation: Is there a credible unique angle?
- Expertise Alignment: Use the expertise profile. High (8-10) if strong domain + technical fit

RECOMMENDATION: Tier 1 (overall ≥7), Tier 2 (5-7), Tier 3 (<5)
CONFIDENCE: High (strong multi-source evidence), Medium (some gaps), Low (mostly inference)`;
