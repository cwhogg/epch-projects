import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured, saveCanvasState } from '@/lib/db';

interface RouteContext {
  params: Promise<{ ideaId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { ideaId } = await context.params;

  let body: { reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.reason) {
    return NextResponse.json({ error: 'Missing required field: reason' }, { status: 400 });
  }

  try {
    await saveCanvasState(ideaId, {
      status: 'killed',
      killedAt: Date.now(),
      killedReason: body.reason,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Kill failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kill failed' },
      { status: 500 },
    );
  }
}
