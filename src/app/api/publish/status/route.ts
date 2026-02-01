import { NextResponse } from 'next/server';
import { isRedisConfigured, getPublishedPieces, getPublishLog } from '@/lib/db';
import { findNextPiecePerTarget } from '@/lib/publish-pipeline';

export async function GET() {
  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const [publishedKeys, recentLog, nextPerTarget] = await Promise.all([
      getPublishedPieces(),
      getPublishLog(20),
      findNextPiecePerTarget(),
    ]);

    const nextUp = Array.from(nextPerTarget.entries()).map(([targetId, candidate]) => ({
      targetId,
      ideaId: candidate.calendar.ideaId,
      ideaName: candidate.calendar.ideaName,
      pieceId: candidate.piece.id,
      title: candidate.piece.title,
      type: candidate.piece.type,
      priority: candidate.piece.priority,
      hasMarkdown: candidate.piece.status === 'complete',
    }));

    return NextResponse.json({
      totalPublished: publishedKeys.length,
      publishedKeys,
      recentLog,
      nextUp: nextUp.length > 0 ? nextUp : null,
    });
  } catch (error) {
    console.error('Failed to get publish status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get status' },
      { status: 500 },
    );
  }
}
