import Anthropic from '@anthropic-ai/sdk';
import { ProductIdea, Analysis, AnalysisScores } from '@/types';
import { saveProgress, saveAnalysisToDb, saveAnalysisContent, updateIdeaStatus, AnalysisProgress } from './db';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const ANALYSIS_STEPS = [
  { name: 'Competitive Analysis', key: 'competitors' },
  { name: 'SEO & Keyword Research', key: 'keywords' },
  { name: 'Willingness to Pay Analysis', key: 'wtp' },
  { name: 'Scoring & Synthesis', key: 'scoring' },
];

function createPrompt(idea: ProductIdea, step: string): string {
  const baseContext = `
You are a Market Research Analyst specializing in SEO-driven B2C products.

CRITICAL RULES:
- NEVER fabricate data (search volumes, keyword difficulty, traffic estimates)
- When data is unavailable, state "Unknown" or "Data unavailable"
- Be conservative in estimates
- Flag uncertainty explicitly

Product being analyzed:
- Name: ${idea.name}
- Description: ${idea.description}
- Target User: ${idea.targetUser}
- Problem Solved: ${idea.problemSolved}
${idea.url ? `- Landing Page: ${idea.url}` : ''}
${idea.documentContent ? `\nAdditional Context:\n${idea.documentContent.substring(0, 2000)}` : ''}
`;

  switch (step) {
    case 'competitors':
      return `${baseContext}

Conduct a competitive analysis for this product idea. Find 5-10 direct and indirect competitors.

For each competitor, document:
- Name & URL
- One-line description
- Target audience
- Pricing (if available)
- Key strengths
- Key weaknesses

Assess market maturity as: Crowded / Emerging / Nascent

Identify 3-5 differentiation opportunities.

Format your response as markdown with clear sections.`;

    case 'keywords':
      return `${baseContext}

Conduct SEO and keyword research for this product idea.

IMPORTANT: You do NOT have access to Ahrefs or SEMrush data. You CANNOT provide:
- Actual search volume numbers
- Keyword difficulty scores
- Traffic estimates

Instead, provide:
1. Brainstorm 20-30 relevant seed keywords across categories:
   - Product-focused (e.g., "[product type] app")
   - Problem-focused (e.g., "how to [solve problem]")
   - Alternative-focused (e.g., "[competitor] alternative")
   - Question-based

2. For each top keyword, conduct SERP analysis (who ranks, content gaps)

3. Group keywords into thematic clusters

4. Identify content opportunities based on SERP observation

Mark all volume/difficulty as "Unknown - requires Ahrefs/SEMrush"

Format your response as markdown.`;

    case 'wtp':
      return `${baseContext}

Analyze willingness to pay for this product category.

Research and document:
1. Existing paid products in this space with their pricing
2. Price points and pricing models (subscription, one-time, freemium)
3. Purchase intent signals (reviews, "worth it" discussions)
4. Price sensitivity indicators

Rate willingness to pay as: Strong / Moderate / Weak / Unknown

Provide specific evidence for your rating.

Format your response as markdown.`;

    case 'scoring':
      return `${baseContext}

Based on the research conducted, provide a final scoring and recommendation.

Score each dimension 1-10 (or "?" if data unavailable):

| Dimension | Weight | Score | Reasoning |
|-----------|--------|-------|-----------|
| SEO Opportunity | 50% | ?/10 | [Without Ahrefs data, mark as unknown] |
| Competitive Landscape | 20% | X/10 | [Based on competitor analysis] |
| Willingness to Pay | 15% | X/10 | [Based on WTP analysis] |
| Differentiation Potential | 10% | X/10 | [Based on gaps identified] |
| Expertise Alignment | 5% | X/10 | [Assume moderate alignment] |

Provide:
1. Overall recommendation: Test First / Test Later / Don't Test / Incomplete
2. Confidence level: High / Medium / Low
3. Key risks (3-5 bullet points)
4. Suggested next steps if testing

Format as markdown with clear sections.`;

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

  const patterns = [
    { key: 'seoOpportunity', pattern: /SEO Opportunity[^|]*\|[^|]*\|\s*(\d+)\/10/i },
    { key: 'competitiveLandscape', pattern: /Competitive.*?Landscape[^|]*\|[^|]*\|\s*(\d+)\/10/i },
    { key: 'willingnessToPay', pattern: /Willingness.*?Pay[^|]*\|[^|]*\|\s*(\d+)\/10/i },
    { key: 'differentiationPotential', pattern: /Differentiation[^|]*\|[^|]*\|\s*(\d+)\/10/i },
    { key: 'expertiseAlignment', pattern: /(?:Expertise|Alignment)[^|]*\|[^|]*\|\s*(\d+)\/10/i },
  ];

  patterns.forEach(({ key, pattern }) => {
    const match = content.match(pattern);
    if (match && match[1]) {
      scores[key as keyof AnalysisScores] = parseInt(match[1]);
    }
  });

  return scores;
}

function parseRecommendation(content: string): Analysis['recommendation'] {
  if (content.includes("Don't Test")) return "Don't Test";
  if (content.includes('Test First')) return 'Test First';
  if (content.includes('Test Later')) return 'Test Later';
  return 'Incomplete';
}

function parseConfidence(content: string): Analysis['confidence'] {
  const match = content.match(/Confidence.*?(High|Medium|Low)/i);
  if (match) return match[1] as Analysis['confidence'];
  return 'Unknown';
}

function parseRisks(content: string): string[] {
  const risks: string[] = [];
  const riskSection = content.match(/Key Risks[\s\S]*?(?=##|$)/i);
  if (riskSection) {
    const bullets = riskSection[0].match(/[-*]\s*\*?\*?([^*\n]+)/g);
    if (bullets) {
      bullets.slice(0, 5).forEach((b) => {
        const cleaned = b.replace(/^[-*]\s*\*?\*?/, '').trim();
        if (cleaned.length > 5) risks.push(cleaned);
      });
    }
  }
  return risks;
}

function parseSummary(content: string): string {
  // Try to find an executive summary or first substantial paragraph
  const summaryMatch = content.match(/(?:Summary|Overview|Recommendation)[:\s]*\n\n?([^\n]+)/i);
  if (summaryMatch) return summaryMatch[1].substring(0, 500);

  // Fallback to first paragraph
  const firstPara = content.match(/^#[^\n]+\n\n([^\n]+)/);
  if (firstPara) return firstPara[1].substring(0, 500);

  return '';
}

export async function runResearchAgent(idea: ProductIdea): Promise<Analysis> {
  const progress: AnalysisProgress = {
    ideaId: idea.id,
    status: 'running',
    currentStep: 'Starting analysis...',
    steps: ANALYSIS_STEPS.map((s) => ({ name: s.name, status: 'pending' as const })),
  };

  await updateIdeaStatus(idea.id, 'analyzing');
  await saveProgress(idea.id, progress);

  const content: { competitors?: string; keywords?: string; wtp?: string; scoring?: string } = {};

  try {
    for (let i = 0; i < ANALYSIS_STEPS.length; i++) {
      const step = ANALYSIS_STEPS[i];

      // Update progress
      progress.currentStep = step.name;
      progress.steps[i].status = 'running';
      await saveProgress(idea.id, progress);

      // Call Claude
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: createPrompt(idea, step.key),
          },
        ],
      });

      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
      content[step.key as keyof typeof content] = responseText;

      // Mark step complete
      progress.steps[i].status = 'complete';
      progress.steps[i].detail = `Generated ${responseText.length} characters`;
      await saveProgress(idea.id, progress);
    }

    // Combine all content into final analysis
    const fullContent = `# Analysis: ${idea.name}

## Product Summary

**Name:** ${idea.name}
**Description:** ${idea.description}
**Target User:** ${idea.targetUser}
**Problem Solved:** ${idea.problemSolved}

---

## Competitive Analysis

${content.competitors || 'Not available'}

---

## SEO & Keyword Research

${content.keywords || 'Not available'}

---

## Willingness to Pay

${content.wtp || 'Not available'}

---

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
