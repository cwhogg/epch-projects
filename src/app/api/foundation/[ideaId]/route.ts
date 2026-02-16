import { NextRequest, NextResponse, after } from 'next/server';
import { isRedisConfigured, getAllFoundationDocs, getFoundationProgress } from '@/lib/db';
import { runFoundationGeneration } from '@/lib/foundation-agent';
import type { StrategicInputs } from '@/types';

export const maxDuration = 300;

// POST — trigger foundation document generation
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

  // Check if already running
  const existing = await getFoundationProgress(ideaId);
  if (existing && existing.status === 'running') {
    return NextResponse.json(
      { message: 'Already running', progress: existing },
      { status: 200 },
    );
  }

  // Parse optional parameters from request body
  let strategicInputs: StrategicInputs | undefined;
  let docType: string | undefined;
  try {
    const body = await request.json();
    if (body.strategicInputs) {
      strategicInputs = body.strategicInputs;
    }
    if (body.docType) {
      docType = body.docType;
    }
  } catch {
    // No body or invalid JSON — that's fine, all fields are optional
  }

  // Run agent in background after response
  after(async () => {
    try {
      await runFoundationGeneration(ideaId, strategicInputs, docType);
    } catch (error) {
      if (error instanceof Error && error.message === 'AGENT_PAUSED') {
        console.log(`[foundation] Agent paused for ${ideaId}, will resume on next request`);
        return;
      }
      console.error('Foundation generation failed:', error);
    }
  });

  return NextResponse.json({ message: 'Foundation generation started', ideaId });
}

// GET — poll progress and retrieve foundation documents
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
    const [progress, docs] = await Promise.all([
      getFoundationProgress(ideaId),
      getAllFoundationDocs(ideaId),
    ]);

    return NextResponse.json({
      progress: progress || { status: 'not_started' },
      docs,
    });
  } catch (error) {
    console.error('Error getting foundation data:', error);
    return NextResponse.json({ error: 'Failed to get foundation data' }, { status: 500 });
  }
}
