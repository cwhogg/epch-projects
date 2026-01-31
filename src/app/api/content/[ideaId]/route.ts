import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured, getContentCalendar } from '@/lib/db';
import { generateContentCalendar } from '@/lib/content-agent';

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
    const calendar = await generateContentCalendar(ideaId);
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
    if (!calendar) {
      return NextResponse.json({ exists: false });
    }
    return NextResponse.json({ exists: true, calendar });
  } catch (error) {
    console.error('Failed to get content calendar:', error);
    return NextResponse.json({ error: 'Failed to get content calendar' }, { status: 500 });
  }
}
