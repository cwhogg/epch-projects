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
import { commitToSecondlook } from './github-publish';

export interface PipelineCandidate {
  calendar: ContentCalendar;
  piece: ContentPiece;
}

export async function findNextPieceToPublish(): Promise<PipelineCandidate | null> {
  const calendars = await getAllContentCalendars();
  if (calendars.length === 0) return null;

  // Collect all candidate pieces across calendars, sorted by priority
  const candidates: PipelineCandidate[] = [];

  for (const calendar of calendars) {
    // Fetch generated pieces from Redis (they have markdown content)
    const generatedPieces = await getContentPieces(calendar.ideaId);
    const generatedMap = new Map(generatedPieces.map((p) => [p.id, p]));

    for (const calendarPiece of calendar.pieces) {
      const piece = generatedMap.get(calendarPiece.id) || calendarPiece;

      // Skip pieces that are already published
      const published = await isPiecePublished(calendar.ideaId, piece.id);
      if (published) continue;

      // Skip pieces still generating
      if (piece.status === 'generating') continue;

      candidates.push({ calendar, piece });
    }
  }

  if (candidates.length === 0) return null;

  // Sort: completed pieces first (they have markdown ready), then by priority
  candidates.sort((a, b) => {
    const aReady = a.piece.status === 'complete' ? 0 : 1;
    const bReady = b.piece.status === 'complete' ? 0 : 1;
    if (aReady !== bReady) return aReady - bReady;
    return a.piece.priority - b.piece.priority;
  });

  return candidates[0];
}

export interface PipelineResult {
  action: 'published' | 'generated_and_published' | 'nothing_to_publish' | 'error';
  detail: string;
  pieceId?: string;
  ideaId?: string;
  commitSha?: string;
}

export async function runPublishPipeline(): Promise<PipelineResult> {
  try {
    const candidate = await findNextPieceToPublish();

    if (!candidate) {
      const result: PipelineResult = {
        action: 'nothing_to_publish',
        detail: 'No unpublished content pieces found',
      };
      await addPublishLogEntry({
        timestamp: new Date().toISOString(),
        action: 'nothing_to_publish',
        detail: result.detail,
        status: 'skipped',
      });
      return result;
    }

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

      // Save generated piece
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

    // Commit to secondlook repo
    const commitMessage = `Publish: ${piece.title} (${piece.type})`;
    const commitResult = await commitToSecondlook(
      piece.type,
      piece.slug,
      markdown,
      commitMessage,
    );

    // Record as published
    await markPiecePublished(calendar.ideaId, piece.id, {
      slug: piece.slug,
      commitSha: commitResult.commitSha,
      filePath: commitResult.filePath,
      publishedAt: new Date().toISOString(),
    });

    const result: PipelineResult = {
      action,
      detail: `Published "${piece.title}" to ${commitResult.filePath}`,
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
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    await addPublishLogEntry({
      timestamp: new Date().toISOString(),
      action: 'error',
      detail,
      status: 'error',
    });
    return { action: 'error', detail };
  }
}
