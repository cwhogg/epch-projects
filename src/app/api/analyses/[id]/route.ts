import { NextRequest, NextResponse } from 'next/server';
import { getAnalysis } from '@/lib/data';
import { getAnalysisFromDb, saveAnalysisToDb, getAnalysisContent, isRedisConfigured } from '@/lib/db';

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const analysis = await getAnalysisFromDb(id);
    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    const body = await request.json();

    // Only allow updating ideaName
    if (body.ideaName !== undefined) analysis.ideaName = body.ideaName;

    await saveAnalysisToDb(analysis);
    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Error updating analysis:', error);
    return NextResponse.json({ error: 'Failed to update analysis' }, { status: 500 });
  }
}
