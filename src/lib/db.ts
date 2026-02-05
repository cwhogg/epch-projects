import { Redis } from '@upstash/redis';
import { ProductIdea, Analysis, LeaderboardEntry, ContentCalendar, ContentPiece, ContentProgress, GSCPropertyLink, GSCAnalyticsData, RejectedPiece } from '@/types';

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
  const r = getRedis();
  const deleted = await r.hdel('ideas', id);

  // Analysis + progress + GSC
  await r.hdel('analyses', id);
  await r.hdel('analysis_content', id);
  await r.del(`progress:${id}`);
  await r.hdel('gsc_links', id);
  await r.del(`gsc_analytics:${id}`);

  // Content calendar, pieces, progress, rejected pieces
  await r.del(`content_calendar:${id}`);
  await r.del(`content_pieces:${id}`);
  await r.del(`content_progress:${id}`);
  await r.del(`rejected_pieces:${id}`);

  // Published pieces: scan set for entries matching this idea, remove from set + meta hash
  const allPublished = await r.smembers('published_pieces') as string[];
  const ideaEntries = allPublished.filter((key) => key.startsWith(`${id}:`));
  if (ideaEntries.length > 0) {
    await r.srem('published_pieces', ...ideaEntries);
    await r.hdel('published_pieces_meta', ...ideaEntries);
  }

  // Painted door site, progress, publish target, email signups
  try {
    const { getPaintedDoorSite, deletePaintedDoorSite, deletePaintedDoorProgress, getDynamicPublishTarget } = await import('@/lib/painted-door-db');
    const site = await getPaintedDoorSite(id);
    await deletePaintedDoorProgress(id);
    await deletePaintedDoorSite(id);

    if (site) {
      const siteId = site.id;
      // Remove publish target keyed by siteId
      await r.hdel('painted_door_targets', siteId);
      // Remove email signup data
      await r.del(`email_signups:${siteId}`);
      await r.del(`email_signups_count:${siteId}`);
    }
  } catch {
    // Painted door cleanup is best-effort — don't break delete if it fails
  }

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

// Content Calendar
export async function saveContentCalendar(ideaId: string, calendar: ContentCalendar): Promise<void> {
  await getRedis().set(`content_calendar:${ideaId}`, JSON.stringify(calendar));
}

export async function getContentCalendar(ideaId: string): Promise<ContentCalendar | null> {
  const calendar = await getRedis().get(`content_calendar:${ideaId}`);
  if (!calendar) return null;
  return calendar as ContentCalendar;
}

// Content Pieces
export async function saveContentPiece(ideaId: string, piece: ContentPiece): Promise<void> {
  await getRedis().hset(`content_pieces:${ideaId}`, { [piece.id]: JSON.stringify(piece) });
}

export async function getContentPieces(ideaId: string): Promise<ContentPiece[]> {
  const pieces = await getRedis().hgetall(`content_pieces:${ideaId}`);
  if (!pieces) return [];
  return Object.values(pieces).map((v) => parseValue<ContentPiece>(v));
}

// Content Progress
export async function saveContentProgress(ideaId: string, progress: ContentProgress): Promise<void> {
  await getRedis().set(`content_progress:${ideaId}`, JSON.stringify(progress), { ex: 3600 });
}

export async function getContentProgress(ideaId: string): Promise<ContentProgress | null> {
  const progress = await getRedis().get(`content_progress:${ideaId}`);
  if (!progress) return null;
  return progress as ContentProgress;
}

// GSC Property Links
export async function saveGSCLink(link: GSCPropertyLink): Promise<void> {
  await getRedis().hset('gsc_links', { [link.ideaId]: JSON.stringify(link) });
}

export async function getGSCLink(ideaId: string): Promise<GSCPropertyLink | null> {
  const link = await getRedis().hget('gsc_links', ideaId);
  if (!link) return null;
  return parseValue<GSCPropertyLink>(link);
}

export async function deleteGSCLink(ideaId: string): Promise<void> {
  await getRedis().hdel('gsc_links', ideaId);
  await getRedis().del(`gsc_analytics:${ideaId}`);
}

export async function getAllGSCLinks(): Promise<GSCPropertyLink[]> {
  const links = await getRedis().hgetall('gsc_links');
  if (!links) return [];
  return Object.values(links).map((v) => parseValue<GSCPropertyLink>(v));
}

// GSC Analytics Cache
export async function saveGSCAnalytics(ideaId: string, data: GSCAnalyticsData): Promise<void> {
  await getRedis().set(`gsc_analytics:${ideaId}`, JSON.stringify(data), { ex: 14400 }); // 4hr TTL
}

export async function getGSCAnalytics(ideaId: string): Promise<GSCAnalyticsData | null> {
  const data = await getRedis().get(`gsc_analytics:${ideaId}`);
  if (!data) return null;
  return data as GSCAnalyticsData;
}

// GSC Properties Cache
export async function saveGSCPropertiesCache(properties: { siteUrl: string; permissionLevel: string }[]): Promise<void> {
  await getRedis().set('gsc_properties_cache', JSON.stringify(properties), { ex: 3600 }); // 1hr TTL
}

export async function getGSCPropertiesCache(): Promise<{ siteUrl: string; permissionLevel: string }[] | null> {
  const data = await getRedis().get('gsc_properties_cache');
  if (!data) return null;
  return data as { siteUrl: string; permissionLevel: string }[];
}

// Publish Tracking

export interface PublishedPieceMeta {
  slug: string;
  commitSha: string;
  filePath: string;
  publishedAt: string;
  targetId?: string;
  siteUrl?: string;
}

export async function markPiecePublished(
  ideaId: string,
  pieceId: string,
  meta: PublishedPieceMeta,
): Promise<void> {
  const key = `${ideaId}:${pieceId}`;
  await getRedis().sadd('published_pieces', key);
  await getRedis().hset('published_pieces_meta', { [key]: JSON.stringify(meta) });
}

export async function isPiecePublished(ideaId: string, pieceId: string): Promise<boolean> {
  const result = await getRedis().sismember('published_pieces', `${ideaId}:${pieceId}`);
  return result === 1;
}

export async function getPublishedPieces(): Promise<string[]> {
  const members = await getRedis().smembers('published_pieces');
  return members as string[];
}

export async function getAllPublishedPiecesMeta(): Promise<Record<string, PublishedPieceMeta>> {
  const data = await getRedis().hgetall('published_pieces_meta');
  if (!data) return {};
  const result: Record<string, PublishedPieceMeta> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = parseValue<PublishedPieceMeta>(value);
  }
  return result;
}

export async function getPublishedPieceMeta(
  ideaId: string,
  pieceId: string,
): Promise<PublishedPieceMeta | null> {
  const meta = await getRedis().hget('published_pieces_meta', `${ideaId}:${pieceId}`);
  if (!meta) return null;
  return parseValue<PublishedPieceMeta>(meta);
}

export interface PublishLogEntry {
  timestamp: string;
  action: string;
  ideaId?: string;
  pieceId?: string;
  detail: string;
  status: 'success' | 'error' | 'skipped';
}

export async function addPublishLogEntry(entry: PublishLogEntry): Promise<void> {
  await getRedis().lpush('publish_log', JSON.stringify(entry));
  await getRedis().ltrim('publish_log', 0, 49); // Keep last 50
}

export async function getPublishLog(limit: number = 50): Promise<PublishLogEntry[]> {
  const entries = await getRedis().lrange('publish_log', 0, limit - 1);
  return entries.map((e) => parseValue<PublishLogEntry>(e));
}

// Rejected Pieces
export async function saveRejectedPiece(ideaId: string, rejected: RejectedPiece): Promise<void> {
  await getRedis().hset(`rejected_pieces:${ideaId}`, { [rejected.id]: JSON.stringify(rejected) });
}

export async function getRejectedPieces(ideaId: string): Promise<RejectedPiece[]> {
  const pieces = await getRedis().hgetall(`rejected_pieces:${ideaId}`);
  if (!pieces) return [];
  return Object.values(pieces).map((v) => parseValue<RejectedPiece>(v));
}

export async function getAllContentCalendars(): Promise<ContentCalendar[]> {
  const keys: string[] = [];
  let cursor = 0;
  do {
    const result = await getRedis().scan(cursor, { match: 'content_calendar:*', count: 100 });
    cursor = Number(result[0]);
    keys.push(...result[1]);
  } while (cursor !== 0);

  const calendars: ContentCalendar[] = [];
  for (const key of keys) {
    const data = await getRedis().get(key);
    if (data) {
      calendars.push(data as ContentCalendar);
    }
  }
  return calendars;
}
