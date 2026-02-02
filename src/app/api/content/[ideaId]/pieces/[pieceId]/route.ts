import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured, getContentPieces, getContentCalendar, saveContentCalendar, saveRejectedPiece } from '@/lib/db';
import { RejectedPiece } from '@/types';

// GET — Retrieve a single generated content piece
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string; pieceId: string }> }
) {
  const { ideaId, pieceId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const pieces = await getContentPieces(ideaId);
    const piece = pieces.find((p) => p.id === pieceId);

    if (!piece) {
      return NextResponse.json({ error: 'Content piece not found' }, { status: 404 });
    }

    return NextResponse.json(piece);
  } catch (error) {
    console.error('Error getting content piece:', error);
    return NextResponse.json({ error: 'Failed to get content piece' }, { status: 500 });
  }
}

// PATCH — Reject a content piece
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string; pieceId: string }> }
) {
  const { ideaId, pieceId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { action, reason } = body;

    if (action !== 'reject') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const calendar = await getContentCalendar(ideaId);
    if (!calendar) {
      return NextResponse.json({ error: 'Calendar not found' }, { status: 404 });
    }

    const pieceIndex = calendar.pieces.findIndex((p) => p.id === pieceId);
    if (pieceIndex === -1) {
      return NextResponse.json({ error: 'Piece not found in calendar' }, { status: 404 });
    }

    const piece = calendar.pieces[pieceIndex];

    // Create rejected piece record
    const rejected: RejectedPiece = {
      id: piece.id,
      ideaId: piece.ideaId,
      title: piece.title,
      slug: piece.slug,
      type: piece.type,
      targetKeywords: piece.targetKeywords,
      rationale: piece.rationale,
      rejectionReason: reason || undefined,
      rejectedAt: new Date().toISOString(),
    };

    // Remove from calendar pieces
    calendar.pieces.splice(pieceIndex, 1);

    // Add to calendar's rejectedPieces array
    if (!calendar.rejectedPieces) calendar.rejectedPieces = [];
    calendar.rejectedPieces.push(rejected);

    // Save both
    await saveContentCalendar(ideaId, calendar);
    await saveRejectedPiece(ideaId, rejected);

    return NextResponse.json({ ok: true, calendar });
  } catch (error) {
    console.error('Error rejecting content piece:', error);
    return NextResponse.json({ error: 'Failed to reject piece' }, { status: 500 });
  }
}
