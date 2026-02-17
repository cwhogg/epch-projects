import { getRedis, parseValue, isRedisConfigured } from './redis';
import { buildLeaderboard } from './utils';
import { ProductIdea, Analysis, LeaderboardEntry, ContentCalendar, ContentPiece, ContentProgress, GSCPropertyLink, GSCAnalyticsData, RejectedPiece, FoundationDocument, FoundationDocType, FoundationProgress, FOUNDATION_DOC_TYPES, CanvasState, Assumption, AssumptionType, PivotSuggestion, PivotRecord, ASSUMPTION_TYPES } from '@/types';

export { isRedisConfigured } from './redis';

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
  } catch (error) {
    console.debug('[deleteIdeaFromDb] painted door cleanup failed:', error);
  }

  // Foundation documents + progress
  await deleteAllFoundationDocs(id);
  await r.del(`foundation_progress:${id}`);

  // Validation canvas data
  await deleteCanvasData(id);

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
export async function getLeaderboardFromDb(): Promise<LeaderboardEntry[]> {
  const analyses = await getAnalysesFromDb();
  return buildLeaderboard(analyses);
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

export async function deleteContentProgress(ideaId: string): Promise<void> {
  await getRedis().del(`content_progress:${ideaId}`);
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

export async function removePublishedPiece(ideaId: string, pieceId: string): Promise<void> {
  const key = `${ideaId}:${pieceId}`;
  await getRedis().srem('published_pieces', key);
  await getRedis().hdel('published_pieces_meta', key);
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

// Foundation Documents
export async function saveFoundationDoc(ideaId: string, doc: FoundationDocument): Promise<void> {
  await getRedis().set(`foundation:${ideaId}:${doc.type}`, JSON.stringify(doc));
}

export async function getFoundationDoc(ideaId: string, docType: FoundationDocType): Promise<FoundationDocument | null> {
  const data = await getRedis().get(`foundation:${ideaId}:${docType}`);
  if (!data) return null;
  return parseValue<FoundationDocument>(data);
}

export async function getAllFoundationDocs(ideaId: string): Promise<Partial<Record<FoundationDocType, FoundationDocument>>> {
  const result: Partial<Record<FoundationDocType, FoundationDocument>> = {};
  for (const docType of FOUNDATION_DOC_TYPES) {
    const doc = await getFoundationDoc(ideaId, docType);
    if (doc) result[docType] = doc;
  }
  return result;
}

export async function deleteFoundationDoc(ideaId: string, docType: FoundationDocType): Promise<void> {
  await getRedis().del(`foundation:${ideaId}:${docType}`);
}

export async function deleteAllFoundationDocs(ideaId: string): Promise<void> {
  for (const docType of FOUNDATION_DOC_TYPES) {
    await getRedis().del(`foundation:${ideaId}:${docType}`);
  }
}

// Foundation Progress
export async function saveFoundationProgress(ideaId: string, progress: FoundationProgress): Promise<void> {
  progress.updatedAt = new Date().toISOString();
  await getRedis().set(`foundation_progress:${ideaId}`, JSON.stringify(progress), { ex: 3600 });
}

export async function getFoundationProgress(ideaId: string): Promise<FoundationProgress | null> {
  const data = await getRedis().get(`foundation_progress:${ideaId}`);
  if (!data) return null;
  return parseValue<FoundationProgress>(data);
}

// Validation Canvas

export async function saveCanvasState(ideaId: string, state: CanvasState): Promise<void> {
  await getRedis().set(`canvas:${ideaId}`, JSON.stringify(state));
}

export async function getCanvasState(ideaId: string): Promise<CanvasState | null> {
  const data = await getRedis().get(`canvas:${ideaId}`);
  if (!data) return null;
  return parseValue<CanvasState>(data);
}

export async function saveAssumption(ideaId: string, assumption: Assumption): Promise<void> {
  await getRedis().set(`assumption:${ideaId}:${assumption.type}`, JSON.stringify(assumption));
}

export async function getAssumption(ideaId: string, type: AssumptionType): Promise<Assumption | null> {
  const data = await getRedis().get(`assumption:${ideaId}:${type}`);
  if (!data) return null;
  return parseValue<Assumption>(data);
}

export async function getAllAssumptions(ideaId: string): Promise<Partial<Record<AssumptionType, Assumption>>> {
  const result: Partial<Record<AssumptionType, Assumption>> = {};
  for (const type of ASSUMPTION_TYPES) {
    const assumption = await getAssumption(ideaId, type);
    if (assumption) result[type] = assumption;
  }
  return result;
}

export async function savePivotSuggestions(ideaId: string, type: AssumptionType, suggestions: PivotSuggestion[]): Promise<void> {
  await getRedis().set(`pivot-suggestions:${ideaId}:${type}`, JSON.stringify(suggestions));
}

export async function getPivotSuggestions(ideaId: string, type: AssumptionType): Promise<PivotSuggestion[]> {
  const data = await getRedis().get(`pivot-suggestions:${ideaId}:${type}`);
  if (!data) return [];
  return parseValue<PivotSuggestion[]>(data);
}

export async function clearPivotSuggestions(ideaId: string, type: AssumptionType): Promise<void> {
  await getRedis().del(`pivot-suggestions:${ideaId}:${type}`);
}

export async function appendPivotHistory(ideaId: string, type: AssumptionType, record: PivotRecord): Promise<void> {
  const existing = await getPivotHistory(ideaId, type);
  existing.push(record);
  await getRedis().set(`pivots:${ideaId}:${type}`, JSON.stringify(existing));
}

export async function getPivotHistory(ideaId: string, type: AssumptionType): Promise<PivotRecord[]> {
  const data = await getRedis().get(`pivots:${ideaId}:${type}`);
  if (!data) return [];
  return parseValue<PivotRecord[]>(data);
}

export async function deleteCanvasData(ideaId: string): Promise<void> {
  const r = getRedis();
  await r.del(`canvas:${ideaId}`);
  for (const type of ASSUMPTION_TYPES) {
    await r.del(`assumption:${ideaId}:${type}`);
    await r.del(`pivot-suggestions:${ideaId}:${type}`);
    await r.del(`pivots:${ideaId}:${type}`);
  }
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
