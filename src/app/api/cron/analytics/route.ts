import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured } from '@/lib/db';
import { runAnalyticsAgentAuto } from '@/lib/analytics-agent';

export const maxDuration = 300;

// GET — Vercel Cron trigger (validates CRON_SECRET)
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const report = await runAnalyticsAgentAuto();
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === 'AGENT_PAUSED') {
      // Agent paused due to time budget — will resume on next cron/manual trigger
      return NextResponse.json({ status: 'paused', message: 'Agent paused, will resume on next trigger' });
    }
    console.error('Cron analytics failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analytics agent failed' },
      { status: 500 },
    );
  }
}

// POST — Manual trigger from dashboard (no auth check)
export async function POST() {
  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const report = await runAnalyticsAgentAuto();
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === 'AGENT_PAUSED') {
      return NextResponse.json({ status: 'paused', message: 'Agent paused, will resume on next trigger' });
    }
    console.error('Manual analytics failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analytics agent failed' },
      { status: 500 },
    );
  }
}
