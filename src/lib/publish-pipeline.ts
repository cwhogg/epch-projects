import { ContentCalendar, ContentPiece } from '@/types';
import {
  getAllContentCalendars,
  getContentPieces,
  isPiecePublished,
  markPiecePublished,
  addPublishLogEntry,
  saveContentPiece,
} from './db';
import { buildContentContext, generateSinglePiece } from './content-agent';
import { commitToRepo } from './github-publish';
import { getPublishTarget } from './publish-targets';

export interface PipelineCandidate {
  calendar: ContentCalendar;
  piece: ContentPiece;
}

/**
 * Find the next unpublished piece for each target site.
 * Returns one candidate per target so each site gets published to independently.
 */
export async function findNextPiecePerTarget(ideaId?: string): Promise<Map<string, PipelineCandidate>> {
  const allCalendars = await getAllContentCalendars();
  const calendars = ideaId ? allCalendars.filter((c) => c.ideaId === ideaId) : allCalendars;
  if (calendars.length === 0) return new Map();

  // Group candidates by target site
  const candidatesByTarget = new Map<string, PipelineCandidate[]>();

  for (const calendar of calendars) {
    // Skip inactive calendars
    if (calendar.active === false) continue;

    const targetId = calendar.targetId || 'secondlook';
    const generatedPieces = await getContentPieces(calendar.ideaId);
    const generatedMap = new Map(generatedPieces.map((p) => [p.id, p]));

    for (const calendarPiece of calendar.pieces) {
      const generated = generatedMap.get(calendarPiece.id);
      // Use generated piece data but keep calendar's priority (user may have reordered)
      const piece = generated ? { ...generated, priority: calendarPiece.priority } : calendarPiece;

      const published = await isPiecePublished(calendar.ideaId, piece.id);
      if (published) continue;

      if (piece.status === 'generating') continue;

      // Skip deprecated landing-page type
      if ((piece.type as string) === 'landing-page') continue;

      if (!candidatesByTarget.has(targetId)) {
        candidatesByTarget.set(targetId, []);
      }
      candidatesByTarget.get(targetId)!.push({ calendar, piece });
    }
  }

  // For each target, sort and pick the best candidate
  const result = new Map<string, PipelineCandidate>();
  for (const [targetId, candidates] of candidatesByTarget) {
    candidates.sort((a, b) => {
      const aReady = a.piece.status === 'complete' ? 0 : 1;
      const bReady = b.piece.status === 'complete' ? 0 : 1;
      if (aReady !== bReady) return aReady - bReady;
      return a.piece.priority - b.piece.priority;
    });
    result.set(targetId, candidates[0]);
  }

  return result;
}

export interface PipelineResult {
  action: 'published' | 'generated_and_published' | 'nothing_to_publish' | 'error';
  detail: string;
  pieceId?: string;
  ideaId?: string;
  commitSha?: string;
}

export interface MultiPipelineResult {
  action: 'published' | 'nothing_to_publish' | 'error';
  detail: string;
  results: PipelineResult[];
}

async function publishCandidate(candidate: PipelineCandidate): Promise<PipelineResult> {
  const { calendar, piece } = candidate;

  // Double-check idempotency
  if (await isPiecePublished(calendar.ideaId, piece.id)) {
    return {
      action: 'nothing_to_publish',
      detail: `Piece ${piece.id} was published between check and execution`,
      pieceId: piece.id,
      ideaId: calendar.ideaId,
    };
  }

  let markdown = piece.markdown;
  let action: PipelineResult['action'] = 'published';

  // If piece hasn't been generated yet, generate it now
  if (!markdown || piece.status !== 'complete') {
    const ctx = await buildContentContext(calendar.ideaId);
    if (!ctx) {
      const result: PipelineResult = {
        action: 'error',
        detail: `No analysis context found for idea ${calendar.ideaId}`,
        pieceId: piece.id,
        ideaId: calendar.ideaId,
      };
      await addPublishLogEntry({
        timestamp: new Date().toISOString(),
        action: 'error',
        ideaId: calendar.ideaId,
        pieceId: piece.id,
        detail: result.detail,
        status: 'error',
      });
      return result;
    }

    markdown = await generateSinglePiece(ctx, piece);
    const wordCount = markdown.split(/\s+/).length;

    const completedPiece: ContentPiece = {
      ...piece,
      status: 'complete',
      markdown,
      wordCount,
      generatedAt: new Date().toISOString(),
    };
    await saveContentPiece(calendar.ideaId, completedPiece);
    action = 'generated_and_published';
  }

  const targetId = calendar.targetId || 'secondlook';
  const target = getPublishTarget(targetId);

  const commitMessage = `Publish: ${piece.title} (${piece.type})`;
  const commitResult = await commitToRepo(
    target,
    piece.type,
    piece.slug,
    markdown,
    commitMessage,
  );

  await markPiecePublished(calendar.ideaId, piece.id, {
    slug: piece.slug,
    commitSha: commitResult.commitSha,
    filePath: commitResult.filePath,
    publishedAt: new Date().toISOString(),
    targetId,
    siteUrl: target.siteUrl,
  });

  const result: PipelineResult = {
    action,
    detail: `Published "${piece.title}" to ${target.id}:${commitResult.filePath}`,
    pieceId: piece.id,
    ideaId: calendar.ideaId,
    commitSha: commitResult.commitSha,
  };

  await addPublishLogEntry({
    timestamp: new Date().toISOString(),
    action: result.action,
    ideaId: calendar.ideaId,
    pieceId: piece.id,
    detail: result.detail,
    status: 'success',
  });

  return result;
}

export async function runPublishPipeline(ideaId?: string): Promise<MultiPipelineResult> {
  try {
    const candidatesByTarget = await findNextPiecePerTarget(ideaId);

    if (candidatesByTarget.size === 0) {
      await addPublishLogEntry({
        timestamp: new Date().toISOString(),
        action: 'nothing_to_publish',
        detail: 'No unpublished content pieces found',
        status: 'skipped',
      });
      return {
        action: 'nothing_to_publish',
        detail: 'No unpublished content pieces found',
        results: [],
      };
    }

    // Publish one piece per target site
    const results: PipelineResult[] = [];
    for (const [, candidate] of candidatesByTarget) {
      const result = await publishCandidate(candidate);
      results.push(result);
    }

    const published = results.filter((r) => r.action === 'published' || r.action === 'generated_and_published');
    const errors = results.filter((r) => r.action === 'error');

    let action: MultiPipelineResult['action'] = 'published';
    if (published.length === 0 && errors.length > 0) action = 'error';
    else if (published.length === 0) action = 'nothing_to_publish';

    const detail = results.map((r) => r.detail).join(' | ');

    return { action, detail, results };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    await addPublishLogEntry({
      timestamp: new Date().toISOString(),
      action: 'error',
      detail,
      status: 'error',
    });
    return { action: 'error', detail, results: [] };
  }
}
