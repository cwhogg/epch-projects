import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured } from '@/lib/db';
import { applyPivot } from '@/lib/validation-canvas';
import type { AssumptionType } from '@/types';

interface RouteContext {
  params: Promise<{ ideaId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { ideaId } = await context.params;

  let body: { type?: AssumptionType; suggestionIndex?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.type || body.suggestionIndex === undefined) {
    return NextResponse.json({ error: 'Missing required fields: type, suggestionIndex' }, { status: 400 });
  }

  try {
    await applyPivot(ideaId, body.type, body.suggestionIndex);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Pivot failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Pivot failed' },
      { status: 500 },
    );
  }
}
