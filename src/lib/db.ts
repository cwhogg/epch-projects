import { Redis } from '@upstash/redis';
import { ProductIdea, Analysis, LeaderboardEntry } from '@/types';

// Lazy-initialize Redis client to ensure env vars are available
let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error('Redis not configured: missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
    }

    redis = new Redis({ url, token });
  }
  return redis;
}

// Check if Redis is configured
export function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

// Helper to parse value that might already be parsed by Upstash
function parseValue<T>(value: unknown): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }
  return value as T;
}

// Ideas
export async function saveIdeaToDb(idea: ProductIdea): Promise<ProductIdea> {
  await getRedis().hset('ideas', { [idea.id]: JSON.stringify(idea) });
  return idea;
}

export async function getIdeasFromDb(): Promise<ProductIdea[]> {
  const ideas = await getRedis().hgetall('ideas');
  if (!ideas) return [];
  return Object.values(ideas).map((v) => parseValue<ProductIdea>(v));
}

export async function getIdeaFromDb(id: string): Promise<ProductIdea | null> {
  const idea = await getRedis().hget('ideas', id);
  if (!idea) return null;
  return parseValue<ProductIdea>(idea);
}

export async function updateIdeaStatus(id: string, status: ProductIdea['status']): Promise<void> {
  const idea = await getIdeaFromDb(id);
  if (idea) {
    idea.status = status;
    await saveIdeaToDb(idea);
  }
}

export async function deleteIdeaFromDb(id: string): Promise<boolean> {
  const deleted = await getRedis().hdel('ideas', id);
  // Also delete associated analysis and content
  await getRedis().hdel('analyses', id);
  await getRedis().hdel('analysis_content', id);
  await getRedis().del(`progress:${id}`);
  return deleted > 0;
}

// Analyses
export async function saveAnalysisToDb(analysis: Analysis): Promise<Analysis> {
  await getRedis().hset('analyses', { [analysis.id]: JSON.stringify(analysis) });
  return analysis;
}

export async function getAnalysesFromDb(): Promise<Analysis[]> {
  const analyses = await getRedis().hgetall('analyses');
  if (!analyses) return [];
  const parsed = Object.values(analyses).map((v) => parseValue<Analysis>(v));
  return parsed.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
}

export async function getAnalysisFromDb(id: string): Promise<Analysis | null> {
  const analysis = await getRedis().hget('analyses', id);
  if (!analysis) return null;
  return parseValue<Analysis>(analysis);
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
  await getRedis().set(`progress:${ideaId}`, JSON.stringify(progress), { ex: 3600 }); // 1 hour TTL
}

export async function getProgress(ideaId: string): Promise<AnalysisProgress | null> {
  const progress = await getRedis().get(`progress:${ideaId}`);
  if (!progress) return null;
  return progress as AnalysisProgress;
}

// Full analysis content (markdown)
export interface AnalysisContent {
  main: string;
  competitors?: string;
  keywords?: string;
  seoData?: string; // JSON-stringified SEO pipeline data
}

export async function saveAnalysisContent(id: string, content: AnalysisContent): Promise<void> {
  await getRedis().hset('analysis_content', { [id]: JSON.stringify(content) });
}

export async function getAnalysisContent(id: string): Promise<AnalysisContent | null> {
  const content = await getRedis().hget('analysis_content', id);
  if (!content) return null;
  return parseValue<AnalysisContent>(content);
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
    const recPriority: Record<string, number> = { 'Tier 1': 0, 'Tier 2': 1, 'Incomplete': 2, 'Tier 3': 3 };
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
