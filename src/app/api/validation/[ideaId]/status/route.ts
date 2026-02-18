import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured, getAssumption, saveAssumption } from '@/lib/db';
import type { AssumptionStatus, AssumptionType } from '@/types';
import { ASSUMPTION_TYPES } from '@/types';

interface RouteContext {
  params: Promise<{ ideaId: string }>;
}

const VALID_STATUSES: AssumptionStatus[] = ['untested', 'testing', 'validated', 'invalidated', 'pivoted'];

function getTimestampUpdate(status: AssumptionStatus, now: number): { validatedAt?: number; invalidatedAt?: number } {
  switch (status) {
    case 'validated':
      return { validatedAt: now, invalidatedAt: undefined };
    case 'invalidated':
      return { invalidatedAt: now, validatedAt: undefined };
    case 'pivoted':
      return { invalidatedAt: now, validatedAt: undefined };
    case 'untested':
    case 'testing':
      return { validatedAt: undefined, invalidatedAt: undefined };
  }
}

/**
 * POST /api/validation/[ideaId]/status
 * Manually update an assumption's status.
 * Body: { type: AssumptionType, status: AssumptionStatus }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { ideaId } = await context.params;

  let body: { type?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, status } = body;

  if (!type || !ASSUMPTION_TYPES.includes(type as AssumptionType)) {
    return NextResponse.json({ error: 'Invalid or missing assumption type' }, { status: 400 });
  }

  if (!status || !VALID_STATUSES.includes(status as AssumptionStatus)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  try {
    const assumption = await getAssumption(ideaId, type as AssumptionType);
    if (!assumption) {
      return NextResponse.json({ error: `No assumption found for type: ${type}` }, { status: 404 });
    }

    const now = Date.now();
    const updated = {
      ...assumption,
      status: status as AssumptionStatus,
      ...getTimestampUpdate(status as AssumptionStatus, now),
    };

    await saveAssumption(ideaId, updated);

    // When invalidated, generate pivot suggestions so the user has actionable options
    if (status === 'invalidated') {
      try {
        const { generatePivotSuggestions } = await import('@/lib/validation-canvas');
        await generatePivotSuggestions(ideaId, type as AssumptionType);
      } catch (err) {
        console.error(`[status] Pivot suggestion generation failed for ${ideaId}/${type}:`, err);
      }
    }

    return NextResponse.json({ ok: true, assumption: updated });
  } catch (error) {
    console.error('Status update failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update status' },
      { status: 500 },
    );
  }
}
