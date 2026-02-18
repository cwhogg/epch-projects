import { NextRequest, NextResponse, after } from 'next/server';
import { getIdeaFromDb, getFoundationDoc, getProgress, isRedisConfigured } from '@/lib/db';
import { runResearchAgentAuto } from '@/lib/research-agent';
import { buildFoundationContext } from '@/lib/research-agent-prompts';
import { FoundationDocument } from '@/types';

export async function buildEnrichedContext(
  ideaId: string,
  additionalContext?: string
): Promise<string | undefined> {
  const [strategyDoc, positioningDoc] = await Promise.all([
    getFoundationDoc(ideaId, 'strategy').catch(() => null),
    getFoundationDoc(ideaId, 'positioning').catch(() => null),
  ]);

  const docs = [strategyDoc, positioningDoc].filter(Boolean) as FoundationDocument[];
  const foundationBlock = buildFoundationContext(docs);

  if (!foundationBlock) return additionalContext;
  if (!additionalContext) return foundationBlock;
  return `${foundationBlock}\n\n${additionalContext}`;
}

// Allow up to 5 minutes for the full analysis pipeline
export const maxDuration = 300;

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

    // Check for additional context in request body
    let additionalContext: string | undefined;
    try {
      const body = await request.json();
      additionalContext = body.additionalContext;
    } catch {
      // No body or invalid JSON, that's fine
    }

    // Log optional key warnings (non-blocking)
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OPENAI_API_KEY not set: SEO analysis will use Claude only (no cross-referencing).');
    }
    if (!process.env.SERPAPI_KEY) {
      console.warn('SERPAPI_KEY not set: SEO analysis will skip Google SERP validation.');
    }

    // Run analysis after the response is sent, keeping the function alive
    after(async () => {
      try {
        const enrichedContext = await buildEnrichedContext(id, additionalContext);
        await runResearchAgentAuto(idea, enrichedContext);
      } catch (error) {
        // AGENT_PAUSED is expected when v2 agent hits time budget
        if (error instanceof Error && error.message === 'AGENT_PAUSED') {
          console.log(`[analyze] Agent paused for ${id}, will resume on next request`);
          return;
        }
        console.error('Analysis failed:', error);
      }
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
