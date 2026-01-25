import { NextResponse } from 'next/server';
import { getAnalyses } from '@/lib/data';
import { getAnalysesFromDb, isRedisConfigured } from '@/lib/db';

export async function GET() {
  try {
    // Use database if configured, otherwise fall back to file system
    if (isRedisConfigured()) {
      const analyses = await getAnalysesFromDb();
      return NextResponse.json(analyses);
    }
    const analyses = getAnalyses();
    return NextResponse.json(analyses);
  } catch (error) {
    console.error('Error getting analyses:', error);
    return NextResponse.json({ error: 'Failed to get analyses' }, { status: 500 });
  }
}
