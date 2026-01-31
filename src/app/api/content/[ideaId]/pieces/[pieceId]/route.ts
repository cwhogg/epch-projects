import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured, getContentPieces } from '@/lib/db';

// GET — Retrieve a single generated content piece
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string; pieceId: string }> }
) {
  const { ideaId, pieceId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const pieces = await getContentPieces(ideaId);
    const piece = pieces.find((p) => p.id === pieceId);

    if (!piece) {
      return NextResponse.json({ error: 'Content piece not found' }, { status: 404 });
    }

    return NextResponse.json(piece);
  } catch (error) {
    console.error('Error getting content piece:', error);
    return NextResponse.json({ error: 'Failed to get content piece' }, { status: 500 });
  }
}
