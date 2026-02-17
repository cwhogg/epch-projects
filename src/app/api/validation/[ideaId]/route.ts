import { NextRequest, NextResponse } from 'next/server';
import {
  isRedisConfigured,
  getCanvasState,
  getAllAssumptions,
  getPivotSuggestions,
  getPivotHistory,
} from '@/lib/db';
import { generateAssumptions } from '@/lib/validation-canvas';
import { ASSUMPTION_TYPES } from '@/types';

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

    // Gather pivot suggestions and history for all types in parallel
    const pivotResults = await Promise.all(
      ASSUMPTION_TYPES.map(async (type) => ({
        type,
        suggestions: await getPivotSuggestions(ideaId, type),
        history: await getPivotHistory(ideaId, type),
      })),
    );
    const pivotSuggestions: Record<string, unknown[]> = {};
    const pivotHistoryMap: Record<string, unknown[]> = {};
    for (const { type, suggestions, history } of pivotResults) {
      if (suggestions.length > 0) pivotSuggestions[type] = suggestions;
      if (history.length > 0) pivotHistoryMap[type] = history;
    }

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
