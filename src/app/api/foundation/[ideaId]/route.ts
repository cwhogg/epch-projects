import { NextRequest, NextResponse, after } from 'next/server';
import { isRedisConfigured, getAllFoundationDocs, getFoundationProgress, getFoundationDoc, saveFoundationDoc } from '@/lib/db';
import { runFoundationGeneration } from '@/lib/foundation-agent';
import type { StrategicInputs, FoundationDocType } from '@/types';

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

  // Check if already running (with staleness detection)
  const existing = await getFoundationProgress(ideaId);
  if (existing && existing.status === 'running') {
    const staleThresholdMs = 5 * 60 * 1000; // 5 minutes
    const isStale = !existing.updatedAt ||
      Date.now() - new Date(existing.updatedAt).getTime() > staleThresholdMs;
    if (!isStale) {
      return NextResponse.json(
        { message: 'Already running', progress: existing },
        { status: 200 },
      );
    }
    // Stale "running" status — agent likely died. Allow restart.
    console.log(`[foundation] Stale running progress for ${ideaId}, allowing restart`);
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

// PATCH — save edits to a specific foundation document
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> },
) {
  const { ideaId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  let body: { docType?: FoundationDocType; content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.docType || typeof body.content !== 'string') {
    return NextResponse.json({ error: 'Missing docType or content' }, { status: 400 });
  }

  try {
    const doc = await getFoundationDoc(ideaId, body.docType);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    doc.content = body.content;
    doc.editedAt = new Date().toISOString();
    doc.version += 1;

    await saveFoundationDoc(ideaId, doc);

    return NextResponse.json(doc);
  } catch (error) {
    console.error('Error saving foundation doc:', error);
    return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
  }
}
