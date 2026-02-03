import { NextResponse } from 'next/server';
import { getAllPublishTargets } from '@/lib/publish-targets';

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
