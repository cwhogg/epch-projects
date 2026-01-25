import { NextRequest, NextResponse } from 'next/server';
import { getAnalysis } from '@/lib/data';
import { getAnalysisFromDb, getAnalysisContent, isRedisConfigured } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Use database if configured, otherwise fall back to file system
    if (isRedisConfigured()) {
      const analysis = await getAnalysisFromDb(id);
      if (!analysis) {
        return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
      }
      const content = await getAnalysisContent(id);
      return NextResponse.json({ analysis, content });
    }

    const result = getAnalysis(id);
    if (!result) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error getting analysis:', error);
    return NextResponse.json({ error: 'Failed to get analysis' }, { status: 500 });
  }
}
