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

function createPrompt(idea: ProductIdea, step: string, additionalContext?: string): string {
  const baseContext = `You are a concise Market Research Analyst. Be direct and avoid filler.

RULES:
- NEVER fabricate data (search volumes, traffic estimates)
- Mark unavailable data as "Unknown"
- No lengthy disclaimers or repetition

Product: ${idea.name}
${idea.description ? `Description: ${idea.description}` : ''}
${idea.targetUser ? `Target User: ${idea.targetUser}` : ''}
${idea.problemSolved ? `Problem: ${idea.problemSolved}` : ''}
${idea.url ? `URL: ${idea.url}` : ''}
${idea.documentContent ? `\nContext:\n${idea.documentContent.substring(0, 3000)}` : ''}
${additionalContext ? `\nAdditional Analysis Context:\n${additionalContext}` : ''}
`;

  switch (step) {
    case 'competitors':
      return `${baseContext}

Find 5-8 competitors (direct and indirect). For each, provide ONE line with:
Name | URL | What they do | Pricing | Key strength | Key weakness

Then list 3 differentiation opportunities as bullet points.

Market maturity: Crowded / Emerging / Nascent

Keep it under 400 words total.`;

    case 'keywords':
      return `${baseContext}

List 15-20 seed keywords in a simple table:
| Keyword | Type | SERP Leaders | Content Gap |

Types: product, problem, alternative, question

Then list top 3 content opportunities as bullet points.

No search volume data available - don't pretend otherwise.
Keep it under 400 words total.`;

    case 'wtp':
      return `${baseContext}

List 3-5 comparable products with pricing in a table:
| Product | Pricing | Model |

WTP Rating: Strong / Moderate / Weak / Unknown

Evidence (3 bullet points max).

Keep it under 250 words total.`;

    case 'scoring':
      return `${baseContext}

SCORING TABLE (use exactly this format):

| Dimension | Score | Reasoning |
|-----------|-------|-----------|
| SEO Opportunity | ?/10 | No data |
| Competitive Landscape | X/10 | [one sentence] |
| Willingness to Pay | X/10 | [one sentence] |
| Differentiation Potential | X/10 | [one sentence] |
| Expertise Alignment | 5/10 | Assumed moderate |

Overall Recommendation: Test First / Test Later / Don't Test / Incomplete
Confidence Level: High / Medium / Low

Key Risks (3-5 bullets, one line each)

Next Steps (if testing, 3 bullets max)

Keep it under 300 words total.`;

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
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: createPrompt(idea, step.key, additionalContext),
          },
        ],
      });

      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
      content[step.key as keyof typeof content] = responseText;

      // Mark step complete
      progress.steps[i].status = 'complete';
      progress.steps[i].detail = `Done`;
      await saveProgress(idea.id, progress);
    }

    // Combine into concise analysis
    const fullContent = `# ${idea.name}
${idea.description ? `\n${idea.description}\n` : ''}
${additionalContext ? `\n**Analysis Context:** ${additionalContext}\n` : ''}
---

## Competitors
${content.competitors || 'Not available'}

## Keywords
${content.keywords || 'Not available'}

## Willingness to Pay
${content.wtp || 'Not available'}

## Recommendation
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
