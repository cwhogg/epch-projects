import { NextRequest, NextResponse } from 'next/server';
import { getIdeaFromDb, getProgress, isRedisConfigured } from '@/lib/db';
import { runResearchAgent } from '@/lib/research-agent';

// POST - Start analysis
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json(
      { error: 'Database not configured. Please add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.' },
      { status: 500 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Anthropic API key not configured. Please add ANTHROPIC_API_KEY.' },
      { status: 500 }
    );
  }

  try {
    const idea = await getIdeaFromDb(id);
    if (!idea) {
      return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
    }

    // Start analysis in background (don't await)
    runResearchAgent(idea).catch((error) => {
      console.error('Analysis failed:', error);
    });

    return NextResponse.json({ message: 'Analysis started', ideaId: id });
  } catch (error) {
    console.error('Error starting analysis:', error);
    return NextResponse.json({ error: 'Failed to start analysis' }, { status: 500 });
  }
}

// GET - Check analysis progress
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 500 }
    );
  }

  try {
    const progress = await getProgress(id);
    if (!progress) {
      return NextResponse.json({ status: 'not_started' });
    }
    return NextResponse.json(progress);
  } catch (error) {
    console.error('Error getting progress:', error);
    return NextResponse.json({ error: 'Failed to get progress' }, { status: 500 });
  }
}
