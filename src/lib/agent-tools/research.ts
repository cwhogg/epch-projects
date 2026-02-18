import type { ToolDefinition, ProductIdea, Analysis, AnalysisScores } from '@/types';
import { searchGoogle, isSerpConfigured } from '@/lib/serp-search';
import {
  runFullSEOPipeline,
  SEOPipelineResult,
} from '@/lib/seo-analysis';
import { isOpenAIConfigured } from '@/lib/openai';
import { buildExpertiseContext } from '@/lib/expertise-profile';
import {
  saveAnalysisToDb,
  saveAnalysisContent,
  updateIdeaStatus,
} from '@/lib/db';

/**
 * Create all tools for the research agent.
 * The idea is injected at construction time so tools have context.
 */
export function createResearchTools(
  idea: ProductIdea,
  additionalContext?: string,
): ToolDefinition[] {
  // Shared mutable state across tool calls within a single run
  let competitorAnalysis: string | null = null;
  let seoResult: SEOPipelineResult | null = null;
  let keywordAnalysis: string | null = null;
  let wtpAnalysis: string | null = null;
  let scoringAnalysis: string | null = null;

  return [
    // -----------------------------------------------------------------------
    // SERP Search — query Google via SerpAPI
    // -----------------------------------------------------------------------
    {
      name: 'search_serp',
      description:
        'Search Google for a keyword and get organic results, People Also Ask questions, and related searches. Use this to validate keyword opportunities or scout competitors. Requires SERPAPI_KEY to be configured.',
      input_schema: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'The search query to look up on Google',
          },
        },
        required: ['keyword'],
      },
      execute: async (input) => {
        if (!isSerpConfigured()) {
          return { error: 'SERPAPI_KEY not configured — SERP search unavailable' };
        }
        const result = await searchGoogle(input.keyword as string);
        return {
          keyword: result.keyword,
          totalResults: result.totalResults ?? 'unknown',
          organicResults: result.organicResults.slice(0, 8).map((r) => ({
            position: r.position,
            title: r.title,
            domain: r.domain,
            snippet: r.snippet.slice(0, 200),
          })),
          peopleAlsoAsk: result.peopleAlsoAsk.map((q) => q.question),
          relatedSearches: result.relatedSearches.map((s) => s.query),
        };
      },
    },

    // -----------------------------------------------------------------------
    // Fetch page — get text content from a URL
    // -----------------------------------------------------------------------
    {
      name: 'fetch_page',
      description:
        'Fetch a web page and extract its text content (truncated to 3000 chars). Useful for reading competitor landing pages, blog posts, or product pages.',
      input_schema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch',
          },
        },
        required: ['url'],
      },
      execute: async (input) => {
        try {
          const response = await fetch(input.url as string, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EPCHBot/1.0)' },
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) {
            return { error: `HTTP ${response.status}: ${response.statusText}` };
          }
          const html = await response.text();
          // Strip HTML tags for a rough text extraction
          const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 3000);
          return { url: input.url, contentLength: text.length, text };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Fetch failed';
          return { error: msg };
        }
      },
    },

    // -----------------------------------------------------------------------
    // Run the full SEO pipeline (Claude + OpenAI + SERP validation)
    // -----------------------------------------------------------------------
    {
      name: 'run_seo_pipeline',
      description:
        'Run the full SEO analysis pipeline: Claude keyword analysis, OpenAI keyword analysis (if configured), cross-referencing, SERP validation via Google, and synthesis. This is a comprehensive multi-step operation that returns a full SEO report. Call this once — it handles parallelization internally.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        const capabilities = {
          openai: isOpenAIConfigured(),
          serp: isSerpConfigured(),
        };

        try {
          const result = await runFullSEOPipeline(idea, additionalContext);
          seoResult = result;
          keywordAnalysis = result.markdownReport;

          return {
            success: true,
            capabilities,
            dataQuality: result.dataQuality,
            topKeywords: result.synthesis.topKeywords.slice(0, 10).map((k) => ({
              keyword: k.keyword,
              intentType: k.intentType,
              volume: k.estimatedVolume,
              competition: k.estimatedCompetitiveness,
              opportunityScore: k.opportunityScore,
              contentGapType: k.contentGapType,
            })),
            serpValidated: result.synthesis.serpValidated.map((v) => ({
              keyword: v.keyword,
              hasContentGap: v.hasContentGap,
              insight: v.serpInsight,
              greenFlags: v.greenFlags,
              redFlags: v.redFlags,
              peopleAlsoAsk: v.serpData.peopleAlsoAsk.slice(0, 3).map((q) => q.question),
            })),
            contentStrategy: result.synthesis.contentStrategy,
            difficultyAssessment: result.synthesis.difficultyAssessment,
            comparisonSummary: result.synthesis.comparison
              ? {
                  agreed: result.synthesis.comparison.agreedKeywords.length,
                  claudeUnique: result.synthesis.comparison.claudeUniqueKeywords.length,
                  openaiUnique: result.synthesis.comparison.openaiUniqueKeywords.length,
                }
              : null,
            narrativeSummary: result.synthesis.synthesisNarrative.slice(0, 500),
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'SEO pipeline failed';
          return { error: msg, capabilities };
        }
      },
    },

    // -----------------------------------------------------------------------
    // Save competitor analysis text (called by agent after it writes analysis)
    // -----------------------------------------------------------------------
    {
      name: 'save_competitor_analysis',
      description:
        'Store your competitive analysis text. Call this after you have analyzed competitors and written your findings.',
      input_schema: {
        type: 'object',
        properties: {
          analysis: {
            type: 'string',
            description: 'The full competitive analysis in markdown format',
          },
        },
        required: ['analysis'],
      },
      execute: async (input) => {
        competitorAnalysis = input.analysis as string;
        return { success: true, length: competitorAnalysis.length };
      },
    },

    // -----------------------------------------------------------------------
    // Save WTP analysis text
    // -----------------------------------------------------------------------
    {
      name: 'save_wtp_analysis',
      description:
        'Store your willingness-to-pay analysis text. Call this after you have analyzed pricing and monetization.',
      input_schema: {
        type: 'object',
        properties: {
          analysis: {
            type: 'string',
            description: 'The full WTP analysis in markdown format',
          },
        },
        required: ['analysis'],
      },
      execute: async (input) => {
        wtpAnalysis = input.analysis as string;
        return { success: true, length: wtpAnalysis.length };
      },
    },

    // -----------------------------------------------------------------------
    // Save scoring/synthesis text and persist the final analysis
    // -----------------------------------------------------------------------
    {
      name: 'save_final_analysis',
      description:
        'Store your final scoring and synthesis, then persist the complete analysis to the database. Provide your scoring text (with ONE-LINE SUMMARY, score table, recommendation, confidence, risks) and structured scores. Call this as the last step.',
      input_schema: {
        type: 'object',
        properties: {
          scoringText: {
            type: 'string',
            description: 'The full scoring & recommendation section in markdown',
          },
          scores: {
            type: 'object',
            properties: {
              seoOpportunity: { type: 'number', minimum: 1, maximum: 10 },
              competitiveLandscape: { type: 'number', minimum: 1, maximum: 10 },
              willingnessToPay: { type: 'number', minimum: 1, maximum: 10 },
              differentiationPotential: { type: 'number', minimum: 1, maximum: 10 },
              expertiseAlignment: { type: 'number', minimum: 1, maximum: 10 },
            },
            required: [
              'seoOpportunity',
              'competitiveLandscape',
              'willingnessToPay',
              'differentiationPotential',
              'expertiseAlignment',
            ],
          },
          recommendation: {
            type: 'string',
            enum: ['Tier 1', 'Tier 2', 'Tier 3'],
          },
          confidence: {
            type: 'string',
            enum: ['High', 'Medium', 'Low'],
          },
          summary: {
            type: 'string',
            description: 'One-line summary of the opportunity',
          },
          risks: {
            type: 'array',
            items: { type: 'string' },
            description: '3-5 specific business/market risks',
          },
        },
        required: ['scoringText', 'scores', 'recommendation', 'confidence', 'summary', 'risks'],
      },
      execute: async (input) => {
        scoringAnalysis = input.scoringText as string;
        const rawScores = input.scores as Record<string, number>;
        const recommendation = input.recommendation as Analysis['recommendation'];
        const confidence = input.confidence as Analysis['confidence'];
        const summary = input.summary as string;
        const risks = input.risks as string[];

        // Calculate weighted overall
        const weights: Record<string, number> = {
          seoOpportunity: 0.3,
          competitiveLandscape: 0.2,
          willingnessToPay: 0.25,
          differentiationPotential: 0.2,
          expertiseAlignment: 0.05,
        };
        let weightedSum = 0;
        let totalWeight = 0;
        for (const [key, weight] of Object.entries(weights)) {
          if (rawScores[key] != null) {
            weightedSum += rawScores[key] * weight;
            totalWeight += weight;
          }
        }
        const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;

        const scores: AnalysisScores = {
          seoOpportunity: rawScores.seoOpportunity ?? null,
          competitiveLandscape: rawScores.competitiveLandscape ?? null,
          willingnessToPay: rawScores.willingnessToPay ?? null,
          differentiationPotential: rawScores.differentiationPotential ?? null,
          expertiseAlignment: rawScores.expertiseAlignment ?? null,
          overall,
        };

        // Build the combined markdown document
        const fullContent = `# ${idea.name}
${idea.description ? `\n*${idea.description}*\n` : ''}
${additionalContext ? `\n> **Analysis Focus:** ${additionalContext}\n` : ''}
---

## Competitive Landscape
${competitorAnalysis || 'Not available'}

## SEO & Keywords
${keywordAnalysis || 'Not available'}

## Willingness to Pay
${wtpAnalysis || 'Not available'}

## Scoring & Recommendation
${scoringAnalysis || 'Not available'}
`;

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
          hasCompetitorAnalysis: !!competitorAnalysis,
          hasKeywordAnalysis: !!keywordAnalysis,
        };

        await saveAnalysisToDb(analysis);
        await saveAnalysisContent(idea.id, {
          main: fullContent,
          competitors: competitorAnalysis ?? undefined,
          keywords: keywordAnalysis ?? undefined,
          seoData: seoResult
            ? JSON.stringify({
                synthesis: seoResult.synthesis,
                dataSources: seoResult.synthesis.dataSources,
              })
            : undefined,
        });
        await updateIdeaStatus(idea.id, 'complete');

        // Generate validation canvas assumptions (best-effort, don't block analysis completion)
        const { tryGenerateCanvas } = await import('@/lib/validation-canvas');
        await tryGenerateCanvas(idea.id, 'research-tools');

        return {
          success: true,
          analysisId: analysis.id,
          overall: scores.overall,
          recommendation,
          confidence,
        };
      },
    },

    // -----------------------------------------------------------------------
    // Read expertise profile (context the agent can use for scoring)
    // -----------------------------------------------------------------------
    {
      name: 'get_expertise_profile',
      description:
        'Get the expertise profile for the person running these analyses. Use this to inform the Expertise Alignment score.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        return { expertiseContext: buildExpertiseContext() };
      },
    },

    // -----------------------------------------------------------------------
    // Get product idea details
    // -----------------------------------------------------------------------
    {
      name: 'get_idea_details',
      description:
        'Get the full details of the product idea being analyzed.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        return {
          id: idea.id,
          name: idea.name,
          description: idea.description,
          targetUser: idea.targetUser,
          problemSolved: idea.problemSolved,
          url: idea.url ?? null,
          documentContent: idea.documentContent?.slice(0, 4000) ?? null,
          additionalContext: additionalContext ?? null,
        };
      },
    },
  ];
}
