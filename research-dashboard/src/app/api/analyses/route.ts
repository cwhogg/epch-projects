import { NextResponse } from 'next/server';
import { getAnalyses } from '@/lib/data';

export async function GET() {
  try {
    const analyses = getAnalyses();
    return NextResponse.json(analyses);
  } catch (error) {
    console.error('Error getting analyses:', error);
    return NextResponse.json({ error: 'Failed to get analyses' }, { status: 500 });
  }
}
