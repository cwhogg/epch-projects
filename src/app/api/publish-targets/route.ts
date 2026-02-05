import { NextRequest, NextResponse } from 'next/server';
import { getAllPublishTargets } from '@/lib/publish-targets';
import { deleteDynamicPublishTarget } from '@/lib/painted-door-db';

// GET — list all publish targets (static + dynamic)
export async function GET() {
  try {
    const targets = await getAllPublishTargets();
    return NextResponse.json(targets);
  } catch (error) {
    console.error('Error fetching publish targets:', error);
    return NextResponse.json({ error: 'Failed to fetch publish targets' }, { status: 500 });
  }
}

// DELETE — remove a dynamic publish target by id (query param)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id query param required' }, { status: 400 });
    }

    // Only allow deleting dynamic (painted door) targets, not static ones
    if (!id.startsWith('pd-')) {
      return NextResponse.json({ error: 'Can only delete dynamic (pd-*) targets' }, { status: 400 });
    }

    await deleteDynamicPublishTarget(id);
    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    console.error('Error deleting publish target:', error);
    return NextResponse.json({ error: 'Failed to delete publish target' }, { status: 500 });
  }
}
