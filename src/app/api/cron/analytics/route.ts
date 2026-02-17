import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured } from '@/lib/db';
import { runAnalyticsAgentAuto } from '@/lib/analytics-agent';
import { evaluateAllCanvases } from '@/lib/validation-canvas';

export const maxDuration = 300;

async function runAnalytics(source: string): Promise<NextResponse> {
  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const report = await runAnalyticsAgentAuto();
    await evaluateAllCanvases().catch(err => console.error('[cron/analytics] Canvas evaluation failed:', err));
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === 'AGENT_PAUSED') {
      return NextResponse.json({ status: 'paused', message: 'Agent paused, will resume on next trigger' });
    }
    console.error(`${source} analytics failed:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analytics agent failed' },
      { status: 500 },
    );
  }
}

// GET — Vercel Cron trigger (validates CRON_SECRET)
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return runAnalytics('Cron');
}

// POST — Manual trigger from dashboard (no auth check)
export async function POST() {
  return runAnalytics('Manual');
}
