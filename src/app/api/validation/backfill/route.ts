import { NextResponse } from 'next/server';
import { isRedisConfigured, getAnalysesFromDb, getCanvasState } from '@/lib/db';
import { generateAssumptions } from '@/lib/validation-canvas';

export const maxDuration = 300;

/**
 * POST /api/validation/backfill
 * Generate validation canvas data for all existing projects that don't have one.
 */
export async function POST() {
  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const analyses = await getAnalysesFromDb();
    const results: { ideaId: string; name: string; status: string }[] = [];

    for (const analysis of analyses) {
      const existing = await getCanvasState(analysis.ideaId).catch(() => null);
      if (existing) {
        results.push({ ideaId: analysis.ideaId, name: analysis.ideaName, status: 'skipped (already exists)' });
        continue;
      }

      try {
        const canvas = await generateAssumptions(analysis.ideaId);
        results.push({
          ideaId: analysis.ideaId,
          name: analysis.ideaName,
          status: canvas ? 'generated' : 'skipped (no analysis data)',
        });
      } catch (err) {
        results.push({
          ideaId: analysis.ideaId,
          name: analysis.ideaName,
          status: `error: ${err instanceof Error ? err.message : 'unknown'}`,
        });
      }
    }

    const generated = results.filter(r => r.status === 'generated').length;
    return NextResponse.json({ total: analyses.length, generated, results });
  } catch (error) {
    console.error('[validation/backfill] Failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Backfill failed' },
      { status: 500 },
    );
  }
}
