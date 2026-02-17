import { ContentContext } from './content-prompts';
import {
  getAnalysisFromDb,
  getAnalysisContent,
  getIdeaFromDb,
} from './db';
import { buildExpertiseContext } from './expertise-profile';

export async function buildContentContext(ideaId: string): Promise<ContentContext | null> {
  const analysis = await getAnalysisFromDb(ideaId);
  if (!analysis) return null;

  const idea = await getIdeaFromDb(ideaId);
  if (!idea) return null;

  const content = await getAnalysisContent(ideaId);

  // Parse SEO data
  let topKeywords: ContentContext['topKeywords'] = [];
  let serpValidated: ContentContext['serpValidated'] = [];
  let contentStrategy: ContentContext['contentStrategy'] = { topOpportunities: [], recommendedAngle: '' };
  let difficultyAssessment: ContentContext['difficultyAssessment'] = { dominantPlayers: [], roomForNewEntrant: false, reasoning: '' };

  if (content?.seoData) {
    try {
      const seoData = JSON.parse(content.seoData);
      const syn = seoData.synthesis;
      if (syn) {
        topKeywords = (syn.topKeywords || []).map((k: Record<string, unknown>) => ({
          keyword: String(k.keyword || ''),
          intentType: String(k.intentType || ''),
          estimatedVolume: String(k.estimatedVolume || ''),
          estimatedCompetitiveness: String(k.estimatedCompetitiveness || ''),
          contentGapHypothesis: String(k.contentGapHypothesis || ''),
          relevanceToMillionARR: String(k.relevanceToMillionARR || ''),
        }));
        serpValidated = (syn.serpValidated || []).map((v: Record<string, unknown>) => ({
          keyword: String(v.keyword || ''),
          hasContentGap: Boolean(v.hasContentGap),
          serpInsight: String(v.serpInsight || ''),
          peopleAlsoAsk: Array.isArray((v.serpData as Record<string, unknown>)?.peopleAlsoAsk)
            ? ((v.serpData as Record<string, unknown>).peopleAlsoAsk as { question: string }[]).map((q) => q.question)
            : [],
          relatedSearches: Array.isArray((v.serpData as Record<string, unknown>)?.relatedSearches)
            ? ((v.serpData as Record<string, unknown>).relatedSearches as string[])
            : [],
          contentGapTypes: Array.isArray(v.contentGapTypes) ? (v.contentGapTypes as string[]) : undefined,
          greenFlags: Array.isArray(v.greenFlags) ? (v.greenFlags as string[]) : undefined,
          redFlags: Array.isArray(v.redFlags) ? (v.redFlags as string[]) : undefined,
        }));
        if (syn.contentStrategy) {
          contentStrategy = {
            topOpportunities: Array.isArray(syn.contentStrategy.topOpportunities) ? syn.contentStrategy.topOpportunities : [],
            recommendedAngle: String(syn.contentStrategy.recommendedAngle || ''),
          };
        }
        if (syn.difficultyAssessment) {
          difficultyAssessment = {
            dominantPlayers: Array.isArray(syn.difficultyAssessment.dominantPlayers) ? syn.difficultyAssessment.dominantPlayers : [],
            roomForNewEntrant: Boolean(syn.difficultyAssessment.roomForNewEntrant),
            reasoning: String(syn.difficultyAssessment.reasoning || ''),
          };
        }
      }
    } catch {
      console.error('Failed to parse SEO data for content context');
    }
  }

  return {
    ideaName: idea.name,
    ideaDescription: idea.description,
    targetUser: idea.targetUser,
    problemSolved: idea.problemSolved,
    url: idea.url,
    scores: analysis.scores,
    summary: analysis.summary,
    risks: analysis.risks,
    topKeywords,
    serpValidated,
    contentStrategy,
    difficultyAssessment,
    competitors: content?.competitors || '(No competitor data available)',
    expertiseProfile: buildExpertiseContext(),
  };
}
