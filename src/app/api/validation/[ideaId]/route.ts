import { NextRequest, NextResponse } from 'next/server';
import {
  isRedisConfigured,
  getCanvasState,
  getAllAssumptions,
} from '@/lib/db';
import { generateAssumptions, buildPivotData } from '@/lib/validation-canvas';

interface RouteContext {
  params: Promise<{ ideaId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { ideaId } = await context.params;

  try {
    let canvas = await getCanvasState(ideaId);

    // Auto-generate if requested and no canvas exists
    if (!canvas && request.nextUrl.searchParams.get('generate') === 'true') {
      const result = await generateAssumptions(ideaId);
      if (result) return NextResponse.json(result);
      return NextResponse.json({ error: 'No analysis found for this idea' }, { status: 404 });
    }

    if (!canvas) {
      return NextResponse.json({ error: 'No validation canvas found' }, { status: 404 });
    }

    const assumptions = await getAllAssumptions(ideaId);
    const { pivotSuggestions, pivotHistory: pivotHistoryMap } = await buildPivotData(ideaId);

    return NextResponse.json({
      canvas,
      assumptions,
      pivotSuggestions,
      pivotHistory: pivotHistoryMap,
    });
  } catch (error) {
    console.error('Validation canvas GET failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load canvas' },
      { status: 500 },
    );
  }
}
