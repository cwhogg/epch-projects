import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured, getContentPieces } from '@/lib/db';

// GET — List all content pieces for an idea
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  const { ideaId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const pieces = await getContentPieces(ideaId);
    return NextResponse.json(pieces);
  } catch (error) {
    console.error('Error getting content pieces:', error);
    return NextResponse.json({ error: 'Failed to get content pieces' }, { status: 500 });
  }
}
