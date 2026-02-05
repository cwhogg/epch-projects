import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured, getContentCalendar, saveContentCalendar } from '@/lib/db';
import { generateContentCalendar, appendNewPieces } from '@/lib/content-agent';
import { getPaintedDoorSite } from '@/lib/painted-door-db';

export const maxDuration = 300;

// POST — Generate content calendar
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  const { ideaId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
  }

  try {
    let targetId: string | undefined;
    let mode: 'full' | 'append' = 'full';
    let userFeedback: string | undefined;
    try {
      const body = await request.json();
      targetId = body.targetId;
      if (body.mode === 'append') mode = 'append';
      if (body.userFeedback) userFeedback = body.userFeedback;
    } catch {
      // No body or invalid JSON — that's fine, use default
    }

    // If no target specified, check for a painted door site for this idea
    if (!targetId) {
      const site = await getPaintedDoorSite(ideaId);
      if (site?.status === 'live') {
        targetId = site.id;
      }
    }

    let calendar;
    if (mode === 'append') {
      calendar = await appendNewPieces(ideaId, targetId, userFeedback);
    } else {
      calendar = await generateContentCalendar(ideaId, targetId);
    }
    return NextResponse.json(calendar);
  } catch (error) {
    console.error('Content calendar generation failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate content calendar' },
      { status: 500 }
    );
  }
}

// GET — Retrieve existing calendar
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  const { ideaId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const calendar = await getContentCalendar(ideaId);

    // Check if a painted door site exists for this idea
    const site = await getPaintedDoorSite(ideaId);
    const suggestedTargetId = site?.status === 'live' ? site.id : undefined;

    if (!calendar) {
      return NextResponse.json({ exists: false, suggestedTargetId });
    }
    return NextResponse.json({ exists: true, calendar, suggestedTargetId });
  } catch (error) {
    console.error('Failed to get content calendar:', error);
    return NextResponse.json({ error: 'Failed to get content calendar' }, { status: 500 });
  }
}

// PATCH — Update calendar target site
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  const { ideaId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { targetId, active, pieceOrder } = body;

    const calendar = await getContentCalendar(ideaId);
    if (!calendar) {
      return NextResponse.json({ error: 'Calendar not found' }, { status: 404 });
    }

    if (targetId !== undefined) calendar.targetId = targetId;
    if (active !== undefined) calendar.active = active;

    // Reorder pieces by the given ID order and assign sequential priorities
    if (Array.isArray(pieceOrder)) {
      const orderMap = new Map<string, number>(
        pieceOrder.map((id: string, i: number) => [id, i + 1])
      );
      for (const p of calendar.pieces) {
        const newPri = orderMap.get(p.id);
        if (newPri !== undefined) p.priority = newPri;
      }
      calendar.pieces.sort((a, b) => a.priority - b.priority);
    }

    await saveContentCalendar(ideaId, calendar);

    return NextResponse.json({ ok: true, calendar });
  } catch (error) {
    console.error('Failed to update calendar target:', error);
    return NextResponse.json({ error: 'Failed to update target' }, { status: 500 });
  }
}
