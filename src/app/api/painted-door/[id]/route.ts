import { NextRequest, NextResponse, after } from 'next/server';
import { isRedisConfigured } from '@/lib/db';
import { runPaintedDoorAgentAuto } from '@/lib/painted-door-agent';
import { getPaintedDoorProgress, getPaintedDoorSite, deletePaintedDoorProgress, deletePaintedDoorSite } from '@/lib/painted-door-db';

export const maxDuration = 300;

// POST — trigger painted door site generation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json(
      { error: 'Database not configured. Please add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.' },
      { status: 500 },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured.' },
      { status: 500 },
    );
  }

  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json(
      { error: 'GITHUB_TOKEN not configured.' },
      { status: 500 },
    );
  }

  if (!process.env.VERCEL_TOKEN) {
    return NextResponse.json(
      { error: 'VERCEL_TOKEN not configured.' },
      { status: 500 },
    );
  }

  // Check if already running or completed
  const existing = await getPaintedDoorProgress(id);
  if (existing && existing.status === 'running') {
    return NextResponse.json(
      { message: 'Already running', progress: existing },
      { status: 200 },
    );
  }

  // Run agent in background after response
  after(async () => {
    try {
      await runPaintedDoorAgentAuto(id);
    } catch (error) {
      if (error instanceof Error && error.message === 'AGENT_PAUSED') {
        console.log(`[painted-door] Agent paused for ${id}, will resume on next request`);
        return;
      }
      console.error('Painted door agent failed:', error);
    }
  });

  return NextResponse.json({ message: 'Site generation started', ideaId: id });
}

// GET — poll progress
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 500 },
    );
  }

  try {
    const progress = await getPaintedDoorProgress(id);
    if (!progress) {
      // Check if a fully deployed site already exists (progress expired)
      const site = await getPaintedDoorSite(id);
      if (site && site.siteUrl && site.status === 'live') {
        return NextResponse.json({
          ideaId: id,
          status: 'complete',
          currentStep: 'Site deployed!',
          steps: [],
          result: site,
        });
      }
      return NextResponse.json({ status: 'not_started' });
    }
    return NextResponse.json(progress);
  } catch (error) {
    console.error('Error getting painted door progress:', error);
    return NextResponse.json({ error: 'Failed to get progress' }, { status: 500 });
  }
}

// PATCH — repair painted door site + publish target (fix repo name mismatches)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { repoName, siteUrl } = body as { repoName?: string; siteUrl?: string };

    if (!repoName) {
      return NextResponse.json({ error: 'repoName is required' }, { status: 400 });
    }

    const { savePaintedDoorSite, saveDynamicPublishTarget, getDynamicPublishTarget } = await import('@/lib/painted-door-db');

    // Fix painted door site record
    const site = await getPaintedDoorSite(id);
    if (site) {
      site.repoName = repoName;
      if (siteUrl) site.siteUrl = siteUrl;
      await savePaintedDoorSite(site);
    }

    // Fix publish target
    const siteId = site?.id || `pd-${id}`;
    const target = await getDynamicPublishTarget(siteId);
    if (target) {
      target.repoName = repoName;
      if (siteUrl) target.siteUrl = siteUrl;
      await saveDynamicPublishTarget(target);
    }

    return NextResponse.json({
      message: 'Repaired',
      site: site ? { id: site.id, repoName: site.repoName, siteUrl: site.siteUrl } : null,
      target: target ? { id: target.id, repoName: target.repoName, siteUrl: target.siteUrl } : null,
    });
  } catch (error) {
    console.error('Error repairing painted door site:', error);
    return NextResponse.json({ error: 'Repair failed' }, { status: 500 });
  }
}

// DELETE — reset stuck progress so it can be re-triggered
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deletePaintedDoorProgress(id);
  await deletePaintedDoorSite(id);
  return NextResponse.json({ message: 'Progress reset', ideaId: id });
}
