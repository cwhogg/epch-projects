import { NextRequest, NextResponse, after } from 'next/server';
import { isRedisConfigured, getContentCalendar, getContentProgress, deleteContentProgress } from '@/lib/db';
import { generateContentPiecesAuto } from '@/lib/content-agent';

export const maxDuration = 300;

// POST — Start content generation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  const { ideaId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
  }

  try {
    const calendar = await getContentCalendar(ideaId);
    if (!calendar) {
      return NextResponse.json({ error: 'No content calendar found. Generate a calendar first.' }, { status: 404 });
    }

    let pieceIds: string[];
    try {
      const body = await request.json();
      pieceIds = body.pieceIds;
    } catch {
      return NextResponse.json({ error: 'Request body must include pieceIds array' }, { status: 400 });
    }

    if (!Array.isArray(pieceIds) || pieceIds.length === 0) {
      return NextResponse.json({ error: 'pieceIds must be a non-empty array' }, { status: 400 });
    }

    // Clear any previous progress before starting new generation
    await deleteContentProgress(ideaId);

    // Run generation after response is sent
    after(async () => {
      try {
        await generateContentPiecesAuto(calendar, pieceIds);
      } catch (error) {
        if (error instanceof Error && error.message === 'AGENT_PAUSED') {
          console.log(`[content] Agent paused for ${ideaId}, will resume on next request`);
          return;
        }
        console.error('Content generation failed:', error);
      }
    });

    return NextResponse.json({ message: 'Content generation started', ideaId, pieceIds });
  } catch (error) {
    console.error('Error starting content generation:', error);
    return NextResponse.json({ error: 'Failed to start content generation' }, { status: 500 });
  }
}

// GET — Poll progress
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  const { ideaId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const progress = await getContentProgress(ideaId);
    if (!progress) {
      return NextResponse.json({ status: 'not_started' });
    }
    return NextResponse.json(progress);
  } catch (error) {
    console.error('Error getting content progress:', error);
    return NextResponse.json({ error: 'Failed to get progress' }, { status: 500 });
  }
}
