import { NextResponse } from 'next/server';
import { isRedisConfigured, getPublishedPieces, getPublishLog } from '@/lib/db';
import { findNextPieceToPublish } from '@/lib/publish-pipeline';

export async function GET() {
  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const [publishedKeys, recentLog, nextUp] = await Promise.all([
      getPublishedPieces(),
      getPublishLog(20),
      findNextPieceToPublish(),
    ]);

    return NextResponse.json({
      totalPublished: publishedKeys.length,
      publishedKeys,
      recentLog,
      nextUp: nextUp
        ? {
            ideaId: nextUp.calendar.ideaId,
            ideaName: nextUp.calendar.ideaName,
            pieceId: nextUp.piece.id,
            title: nextUp.piece.title,
            type: nextUp.piece.type,
            priority: nextUp.piece.priority,
            hasMarkdown: nextUp.piece.status === 'complete',
          }
        : null,
    });
  } catch (error) {
    console.error('Failed to get publish status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get status' },
      { status: 500 },
    );
  }
}
