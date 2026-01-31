import Anthropic from '@anthropic-ai/sdk';
import { ProductIdea, Analysis, AnalysisScores } from '@/types';
import { saveProgress, saveAnalysisToDb, saveAnalysisContent, updateIdeaStatus, AnalysisProgress } from './db';
import { runFullSEOPipeline, SEOPipelineResult } from './seo-analysis';
import { isOpenAIConfigured } from './openai';
import { isSerpConfigured } from './serp-search';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const ANALYSIS_STEPS = [
  { name: 'Competitive Analysis', key: 'competitors' },
  { name: 'SEO: Claude Analysis', key: 'seo-claude' },
  { name: 'SEO: OpenAI Analysis', key: 'seo-openai' },
  { name: 'SEO: Cross-Reference', key: 'seo-compare' },
  { name: 'SEO: SERP Validation', key: 'seo-serp' },
  { name: 'SEO: Synthesis', key: 'seo-synthesis' },
  { name: 'Willingness to Pay Analysis', key: 'wtp' },
  { name: 'Scoring & Synthesis', key: 'scoring' },
];

function createPrompt(idea: ProductIdea, step: string, additionalContext?: string): string {
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

FINAL SCORING - Be decisive and justify with evidence. Be honest about what you know vs. what you're estimating.

ONE-LINE SUMMARY: [Write a single compelling sentence summarizing this opportunity - what it is, who it's for, and why it matters]

SCORING TABLE (use EXACTLY this format - scores in second column):

| Dimension | Score | Evidence-Based Reasoning |
|-----------|-------|--------------------------|
| SEO Opportunity | X/10 | [Based on competitive density and content gaps - NOT search volume which you don't have] |
| Competitive Landscape | X/10 | [how crowded, how differentiated can you be] |
| Willingness to Pay | X/10 | [evidence of actual spending in space] |
| Differentiation Potential | X/10 | [what unique angle exists] |
| Expertise Alignment | 5/10 | [assumed moderate unless context suggests otherwise] |

SCORING GUIDANCE:
- SEO: Score based on competitive density and content gaps, NOT volume claims
- Competitive: 8-10 = wide open, 5-7 = room to differentiate, 1-4 = crowded/dominated
- WTP: Based on existing price points and evidence people pay, not assumptions
- Differentiation: Is there a credible unique angle?

OVERALL RECOMMENDATION: Tier 1 / Tier 2 / Tier 3
CONFIDENCE: High / Medium / Low

Confidence should reflect data quality:
- High = Strong evidence from multiple sources
- Medium = Some evidence but gaps in knowledge
- Low = Mostly inference, limited hard data

KEY RISKS (3-5, be specific not generic):
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

function parseScores(content: string): AnalysisScores {
  const scores: AnalysisScores = {
    seoOpportunity: null,
    competitiveLandscape: null,
    willingnessToPay: null,
    differentiationPotential: null,
    expertiseAlignment: null,
    overall: null,
  };

  // Match format: | Dimension | X/10 | reasoning |
  // Score appears right after dimension name, followed by pipe
  const patterns = [
    { key: 'seoOpportunity', pattern: /SEO Opportunity\s*\|\s*(\d+)\/10/i },
    { key: 'competitiveLandscape', pattern: /Competitive\s*(?:Landscape)?\s*\|\s*(\d+)\/10/i },
    { key: 'willingnessToPay', pattern: /Willingness\s*(?:to)?\s*Pay\s*\|\s*(\d+)\/10/i },
    { key: 'differentiationPotential', pattern: /Differentiation\s*(?:Potential)?\s*\|\s*(\d+)\/10/i },
    { key: 'expertiseAlignment', pattern: /Expertise\s*(?:Alignment)?\s*\|\s*(\d+)\/10/i },
  ];

  patterns.forEach(({ key, pattern }) => {
    const match = content.match(pattern);
    if (match && match[1]) {
      scores[key as keyof AnalysisScores] = parseInt(match[1]);
    }
  });

  // Calculate overall as weighted average if we have scores
  const weights = {
    seoOpportunity: 0.3,
    competitiveLandscape: 0.2,
    willingnessToPay: 0.25,
    differentiationPotential: 0.2,
    expertiseAlignment: 0.05,
  };

  let totalWeight = 0;
  let weightedSum = 0;

  Object.entries(weights).forEach(([key, weight]) => {
    const score = scores[key as keyof AnalysisScores];
    if (score !== null) {
      weightedSum += score * weight;
      totalWeight += weight;
    }
  });

  if (totalWeight > 0) {
    scores.overall = Math.round(weightedSum / totalWeight);
  }

  return scores;
}

function parseRecommendation(content: string): Analysis['recommendation'] {
  // Look for explicit recommendation patterns
  const recMatch = content.match(/(?:OVERALL\s+)?RECOMMENDATION[:\s]*(Tier\s*[123]|Incomplete)/i);
  if (recMatch) {
    const rec = recMatch[1];
    if (rec.includes('1')) return 'Tier 1';
    if (rec.includes('2')) return 'Tier 2';
    if (rec.includes('3')) return 'Tier 3';
  }

  // Fallback to simple search
  if (content.includes('Tier 1')) return 'Tier 1';
  if (content.includes('Tier 2')) return 'Tier 2';
  if (content.includes('Tier 3')) return 'Tier 3';
  return 'Incomplete';
}

function parseConfidence(content: string): Analysis['confidence'] {
  const match = content.match(/CONFIDENCE[:\s]*(High|Medium|Low)/i);
  if (match) return match[1] as Analysis['confidence'];

  // Fallback
  const fallback = content.match(/Confidence.*?(High|Medium|Low)/i);
  if (fallback) return fallback[1] as Analysis['confidence'];

  return 'Unknown';
}

function parseRisks(content: string): string[] {
  const risks: string[] = [];

  // Look for KEY RISKS section
  const riskSection = content.match(/KEY RISKS[:\s]*\n([\s\S]*?)(?=\n(?:NEXT STEPS|##|$))/i);
  if (riskSection) {
    const lines = riskSection[1].split('\n');
    for (const line of lines) {
      // Match bullet points
      const bulletMatch = line.match(/^[-*•]\s*(.+)/);
      if (bulletMatch && bulletMatch[1].trim().length > 10) {
        risks.push(bulletMatch[1].trim());
      }
    }
  }

  // Fallback to old pattern if no risks found
  if (risks.length === 0) {
    const fallbackSection = content.match(/(?:Key )?Risks[:\s]*\n([\s\S]*?)(?=\n(?:Next|##|$))/i);
    if (fallbackSection) {
      const bullets = fallbackSection[1].match(/[-*•]\s*([^\n]+)/g);
      if (bullets) {
        bullets.slice(0, 5).forEach((b) => {
          const cleaned = b.replace(/^[-*•]\s*/, '').trim();
          if (cleaned.length > 10) risks.push(cleaned);
        });
      }
    }
  }

  return risks.slice(0, 5);
}

function parseSummary(content: string): string {
  // Look for ONE-LINE SUMMARY first (new format)
  const oneLineSummary = content.match(/ONE-LINE SUMMARY[:\s]*([^\n]+)/i);
  if (oneLineSummary && oneLineSummary[1].trim().length > 10) {
    return oneLineSummary[1].trim();
  }

  // Try to find an executive summary or first substantial paragraph
  const summaryMatch = content.match(/(?:Summary|Overview)[:\s]*\n\n?([^\n]+)/i);
  if (summaryMatch && summaryMatch[1].trim().length > 10) {
    return summaryMatch[1].substring(0, 500);
  }

  // Fallback: grab the recommendation line
  const recSection = content.match(/OVERALL RECOMMENDATION[:\s]*([^\n]+)/i);
  if (recSection) return recSection[1].trim();

  return '';
}

export async function runResearchAgent(idea: ProductIdea, additionalContext?: string): Promise<Analysis> {
  const progress: AnalysisProgress = {
    ideaId: idea.id,
    status: 'running',
    currentStep: 'Starting analysis...',
    steps: ANALYSIS_STEPS.map((s) => ({ name: s.name, status: 'pending' as const })),
  };

  await updateIdeaStatus(idea.id, 'analyzing');
  await saveProgress(idea.id, progress);

  const content: { competitors?: string; keywords?: string; wtp?: string; scoring?: string } = {};

  // Helper to find step index by key
  const stepIndex = (key: string) => ANALYSIS_STEPS.findIndex((s) => s.key === key);

  // Helper to update step status
  const updateStep = async (key: string, status: 'pending' | 'running' | 'complete' | 'error', detail?: string) => {
    const idx = stepIndex(key);
    if (idx >= 0) {
      progress.steps[idx].status = status;
      if (detail) progress.steps[idx].detail = detail;
      progress.currentStep = ANALYSIS_STEPS[idx].name;
      await saveProgress(idea.id, progress);
    }
  };

  try {
    // --- Step 1: Competitive Analysis ---
    await updateStep('competitors', 'running');
    const competitorResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: createPrompt(idea, 'competitors', additionalContext) }],
    });
    content.competitors = competitorResponse.content[0].type === 'text' ? competitorResponse.content[0].text : '';
    await updateStep('competitors', 'complete', 'Done');

    // --- Steps 2-6: SEO Pipeline (runs Claude + OpenAI in parallel internally) ---
    // Mark OpenAI step as skipped if no key
    if (!isOpenAIConfigured()) {
      await updateStep('seo-openai', 'complete', 'Skipped (no API key)');
    }
    // Mark SERP step as skipped if no key
    if (!isSerpConfigured()) {
      await updateStep('seo-serp', 'complete', 'Skipped (no API key)');
    }

    let seoResult: SEOPipelineResult;
    try {
      seoResult = await runFullSEOPipeline(idea, additionalContext, async (stepKey, detail) => {
        await updateStep(stepKey, 'running', detail);
      });

      // Mark all SEO steps complete
      for (const key of ['seo-claude', 'seo-openai', 'seo-compare', 'seo-serp', 'seo-synthesis']) {
        const idx = stepIndex(key);
        if (idx >= 0 && progress.steps[idx].status === 'running') {
          await updateStep(key, 'complete', progress.steps[idx].detail || 'Done');
        }
      }
    } catch (seoError) {
      console.error('SEO pipeline failed, falling back:', seoError);
      // Mark remaining SEO steps as errored
      for (const key of ['seo-claude', 'seo-openai', 'seo-compare', 'seo-serp', 'seo-synthesis']) {
        const idx = stepIndex(key);
        if (idx >= 0 && progress.steps[idx].status !== 'complete') {
          await updateStep(key, 'error', 'Failed');
        }
      }
      // Fallback: run old-style keyword analysis
      const fallbackResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{ role: 'user', content: createPrompt(idea, 'keywords', additionalContext) }],
      });
      content.keywords = fallbackResponse.content[0].type === 'text' ? fallbackResponse.content[0].text : '';
      seoResult = undefined as unknown as SEOPipelineResult;
    }

    // Use SEO pipeline markdown if available, otherwise fallback
    if (seoResult) {
      content.keywords = seoResult.markdownReport;
    }

    // --- Step 7: Willingness to Pay ---
    await updateStep('wtp', 'running');
    const wtpResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: createPrompt(idea, 'wtp', additionalContext) }],
    });
    content.wtp = wtpResponse.content[0].type === 'text' ? wtpResponse.content[0].text : '';
    await updateStep('wtp', 'complete', 'Done');

    // --- Step 8: Scoring & Synthesis (enriched with SEO data) ---
    await updateStep('scoring', 'running');
    const seoContext = seoResult
      ? `\n\nSEO PIPELINE DATA (use this to inform your SEO Opportunity score):\n${buildSEOScoringContext(seoResult)}`
      : '';
    const scoringResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: createPrompt(idea, 'scoring', (additionalContext || '') + seoContext) }],
    });
    content.scoring = scoringResponse.content[0].type === 'text' ? scoringResponse.content[0].text : '';
    await updateStep('scoring', 'complete', 'Done');

    // Combine into analysis document
    const fullContent = `# ${idea.name}
${idea.description ? `\n*${idea.description}*\n` : ''}
${additionalContext ? `\n> **Analysis Focus:** ${additionalContext}\n` : ''}
---

## Competitive Landscape
${content.competitors || 'Not available'}

## SEO & Keywords
${content.keywords || 'Not available'}

## Willingness to Pay
${content.wtp || 'Not available'}

## Scoring & Recommendation
${content.scoring || 'Not available'}
`;

    // Parse the scoring section for structured data
    const scoringContent = content.scoring || '';
    const scores = parseScores(scoringContent);
    const recommendation = parseRecommendation(scoringContent);
    const confidence = parseConfidence(scoringContent);
    const risks = parseRisks(scoringContent);
    const summary = parseSummary(scoringContent);

    // Create analysis object
    const analysis: Analysis = {
      id: idea.id,
      ideaId: idea.id,
      ideaName: idea.name,
      scores,
      confidence,
      recommendation,
      summary,
      risks,
      completedAt: new Date().toISOString(),
      hasCompetitorAnalysis: !!content.competitors,
      hasKeywordAnalysis: !!content.keywords,
    };

    // Save to database
    await saveAnalysisToDb(analysis);
    await saveAnalysisContent(idea.id, {
      main: fullContent,
      competitors: content.competitors,
      keywords: content.keywords,
      seoData: seoResult ? JSON.stringify({
        synthesis: seoResult.synthesis,
        dataSources: seoResult.synthesis.dataSources,
      }) : undefined,
    });
    await updateIdeaStatus(idea.id, 'complete');

    // Update progress
    progress.status = 'complete';
    progress.currentStep = 'Analysis complete!';
    progress.result = analysis;
    await saveProgress(idea.id, progress);

    return analysis;
  } catch (error) {
    progress.status = 'error';
    progress.error = error instanceof Error ? error.message : 'Unknown error';
    progress.currentStep = 'Analysis failed';
    await saveProgress(idea.id, progress);
    await updateIdeaStatus(idea.id, 'pending');
    throw error;
  }
}

function buildSEOScoringContext(seoResult: SEOPipelineResult): string {
  const parts: string[] = [];
  const syn = seoResult.synthesis;

  parts.push(`Data sources: ${syn.dataSources.join(', ')}`);
  parts.push(`Total keywords identified: ${syn.topKeywords.length}`);

  if (syn.comparison) {
    parts.push(`Keywords agreed upon by both Claude and OpenAI: ${syn.comparison.agreedKeywords.length}`);
    parts.push(`High-confidence keywords: ${syn.comparison.agreedKeywords.slice(0, 5).join(', ')}`);
  }

  if (syn.serpValidated.length > 0) {
    const gaps = syn.serpValidated.filter((v) => v.hasContentGap).length;
    parts.push(`SERP-validated keywords: ${syn.serpValidated.length}`);
    parts.push(`Content gaps found: ${gaps} of ${syn.serpValidated.length}`);
  }

  parts.push(`Room for new entrant: ${syn.difficultyAssessment.roomForNewEntrant ? 'Yes' : 'No'}`);
  parts.push(`Dominant players: ${syn.difficultyAssessment.dominantPlayers.join(', ')}`);

  return parts.join('\n');
}
