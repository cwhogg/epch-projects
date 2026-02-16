import { NextRequest, NextResponse, after } from 'next/server';
import { isRedisConfigured, getAllFoundationDocs } from '@/lib/db';
import { runContentCritiquePipeline } from '@/lib/content-critique-agent';
import { recipes } from '@/lib/content-recipes';
import { buildContentContext } from '@/lib/content-agent';
import { getRedis } from '@/lib/redis';

export const maxDuration = 300;

// POST — trigger content critique pipeline
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> },
) {
  const { ideaId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json(
      { error: 'Database not configured.' },
      { status: 500 },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured.' },
      { status: 500 },
    );
  }

  let body: { contentType?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body. Expected { contentType: "website" }.' },
      { status: 400 },
    );
  }

  const contentType = body.contentType || 'website';
  const recipe = recipes[contentType];
  if (!recipe) {
    return NextResponse.json(
      { error: `Unknown content type: ${contentType}` },
      { status: 400 },
    );
  }

  // Verify foundation docs exist for the recipe's authorContextDocs
  const docs = await getAllFoundationDocs(ideaId);
  const missing = recipe.authorContextDocs.filter((dt) => !docs[dt]);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Missing foundation docs: ${missing.join(', ')}. Generate foundation docs first.`,
      },
      { status: 400 },
    );
  }

  // Build content context for the author
  const ctx = await buildContentContext(ideaId);
  if (!ctx) {
    return NextResponse.json(
      { error: 'No analysis found — run research agent first.' },
      { status: 400 },
    );
  }

  const contentContext =
    `Product: ${ctx.ideaName}\n` +
    `Description: ${ctx.ideaDescription}\n` +
    `Target User: ${ctx.targetUser}\n` +
    `Problem Solved: ${ctx.problemSolved}\n` +
    `Top Keywords: ${ctx.topKeywords.slice(0, 5).map((k) => k.keyword).join(', ')}`;

  // Run pipeline in background
  after(async () => {
    try {
      await runContentCritiquePipeline(ideaId, contentType, contentContext);
    } catch (error) {
      if (error instanceof Error && error.message === 'AGENT_PAUSED') {
        console.log(
          `[content-pipeline] Agent paused for ${ideaId}, will resume on next request`,
        );
        return;
      }
      console.error('Content critique pipeline failed:', error);
    }
  });

  return NextResponse.json({
    message: 'Content pipeline started',
    ideaId,
    contentType,
  });
}

// GET — poll pipeline progress
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> },
) {
  const { ideaId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 500 },
    );
  }

  try {
    // Find the progress key — we need the runId
    // Convention: the POST handler could store a mapping, but for now
    // we scan for the most recent pipeline_progress key for this idea
    const redis = getRedis();

    // Check for active run
    const runId = await redis.get<string>(
      `active_run:content-critique:${ideaId}`,
    );

    if (runId) {
      const progress = await redis.get<string>(`pipeline_progress:${runId}`);
      if (progress) {
        return NextResponse.json(
          typeof progress === 'string' ? JSON.parse(progress) : progress,
        );
      }
    }

    return NextResponse.json({ status: 'not_started' });
  } catch (error) {
    console.error('Error getting pipeline progress:', error);
    return NextResponse.json(
      { error: 'Failed to get progress' },
      { status: 500 },
    );
  }
}
