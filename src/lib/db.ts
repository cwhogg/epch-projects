import { Redis } from '@upstash/redis';
import { ProductIdea, Analysis, LeaderboardEntry } from '@/types';

// Initialize Redis client (uses UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Check if Redis is configured
export function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

// Ideas
export async function saveIdeaToDb(idea: ProductIdea): Promise<ProductIdea> {
  await redis.hset('ideas', { [idea.id]: JSON.stringify(idea) });
  return idea;
}

export async function getIdeasFromDb(): Promise<ProductIdea[]> {
  const ideas = await redis.hgetall('ideas');
  if (!ideas) return [];
  return Object.values(ideas).map((v) => JSON.parse(v as string));
}

export async function getIdeaFromDb(id: string): Promise<ProductIdea | null> {
  const idea = await redis.hget('ideas', id);
  if (!idea) return null;
  return JSON.parse(idea as string);
}

export async function updateIdeaStatus(id: string, status: ProductIdea['status']): Promise<void> {
  const idea = await getIdeaFromDb(id);
  if (idea) {
    idea.status = status;
    await saveIdeaToDb(idea);
  }
}

// Analyses
export async function saveAnalysisToDb(analysis: Analysis): Promise<Analysis> {
  await redis.hset('analyses', { [analysis.id]: JSON.stringify(analysis) });
  return analysis;
}

export async function getAnalysesFromDb(): Promise<Analysis[]> {
  const analyses = await redis.hgetall('analyses');
  if (!analyses) return [];
  return Object.values(analyses).map((v) => JSON.parse(v as string));
}

export async function getAnalysisFromDb(id: string): Promise<Analysis | null> {
  const analysis = await redis.hget('analyses', id);
  if (!analysis) return null;
  return JSON.parse(analysis as string);
}

// Analysis progress tracking
export interface AnalysisProgress {
  ideaId: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  currentStep: string;
  steps: { name: string; status: 'pending' | 'running' | 'complete' | 'error'; detail?: string }[];
  error?: string;
  result?: Analysis;
}

export async function saveProgress(ideaId: string, progress: AnalysisProgress): Promise<void> {
  await redis.set(`progress:${ideaId}`, JSON.stringify(progress), { ex: 3600 }); // 1 hour TTL
}

export async function getProgress(ideaId: string): Promise<AnalysisProgress | null> {
  const progress = await redis.get(`progress:${ideaId}`);
  if (!progress) return null;
  return progress as AnalysisProgress;
}

// Full analysis content (markdown)
export interface AnalysisContent {
  main: string;
  competitors?: string;
  keywords?: string;
}

export async function saveAnalysisContent(id: string, content: AnalysisContent): Promise<void> {
  await redis.hset('analysis_content', { [id]: JSON.stringify(content) });
}

export async function getAnalysisContent(id: string): Promise<AnalysisContent | null> {
  const content = await redis.hget('analysis_content', id);
  if (!content) return null;
  return JSON.parse(content as string);
}

// Leaderboard
function formatScoreName(key: string): string {
  const names: Record<string, string> = {
    seoOpportunity: 'SEO',
    competitiveLandscape: 'Competition',
    willingnessToPay: 'WTP',
    differentiationPotential: 'Differentiation',
    expertiseAlignment: 'Expertise',
  };
  return names[key] || key;
}

export async function getLeaderboardFromDb(): Promise<LeaderboardEntry[]> {
  const analyses = await getAnalysesFromDb();

  // Sort by recommendation priority, then by confidence
  const sorted = analyses.sort((a, b) => {
    const recPriority: Record<string, number> = { 'Test First': 0, 'Test Later': 1, 'Incomplete': 2, "Don't Test": 3 };
    const aPriority = recPriority[a.recommendation] ?? 2;
    const bPriority = recPriority[b.recommendation] ?? 2;

    if (aPriority !== bPriority) return aPriority - bPriority;

    const confPriority: Record<string, number> = { 'High': 0, 'Medium': 1, 'Low': 2, 'Unknown': 3 };
    const aConf = confPriority[a.confidence] ?? 3;
    const bConf = confPriority[b.confidence] ?? 3;

    return aConf - bConf;
  });

  return sorted.map((analysis, index) => {
    const scoreEntries = Object.entries(analysis.scores)
      .filter(([key, val]) => val !== null && key !== 'overall')
      .sort((a, b) => (b[1] as number) - (a[1] as number));

    const topStrength = scoreEntries[0]
      ? `${formatScoreName(scoreEntries[0][0])}: ${scoreEntries[0][1]}/10`
      : 'No scores yet';

    return {
      rank: index + 1,
      ideaName: analysis.ideaName,
      ideaId: analysis.id,
      overallScore: analysis.scores.overall,
      confidence: analysis.confidence,
      recommendation: analysis.recommendation,
      topStrength,
      topRisk: analysis.risks?.[0] || 'None identified',
    };
  });
}
