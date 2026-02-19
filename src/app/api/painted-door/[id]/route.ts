import { NextRequest, NextResponse, after } from 'next/server';
import { isRedisConfigured } from '@/lib/db';
import { runPaintedDoorAgent } from '@/lib/painted-door-agent';
import { getBuildSession, getPaintedDoorProgress, getPaintedDoorSite, savePaintedDoorSite, deletePaintedDoorProgress, deletePaintedDoorSite, deleteBuildSession, deleteConversationHistory } from '@/lib/painted-door-db';
import type { BuildSession, PaintedDoorSite } from '@/types';

export const maxDuration = 300;

function projectBuildSession(session: BuildSession) {
  return { mode: session.mode, currentStep: session.currentStep, steps: session.steps };
}

/** Actively check Vercel deployment status and update the site record if deployment completed. */
async function checkAndUpdateDeployment(site: PaintedDoorSite): Promise<'complete' | 'error' | 'deploying'> {
  const token = process.env.VERCEL_TOKEN;
  if (!token || !site.vercelProjectId) return 'deploying';

  try {
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${site.vercelProjectId}&limit=1`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' as RequestCache },
    );
    if (!res.ok) return 'deploying';

    const data = await res.json();
    const deployment = data.deployments?.[0];
    if (!deployment) return 'deploying';

    const state = deployment.state || deployment.readyState;

    if (state === 'READY') {
      site.siteUrl = `https://${deployment.url}`;
      site.status = 'live';
      site.deployedAt = new Date().toISOString();
      await savePaintedDoorSite(site);
      return 'complete';
    }

    if (state === 'ERROR' || state === 'CANCELED') {
      site.status = 'failed';
      await savePaintedDoorSite(site);
      return 'error';
    }

    return 'deploying';
  } catch {
    return 'deploying';
  }
}

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

  // Check if already running
  const existing = await getPaintedDoorProgress(id);
  if (existing && existing.status === 'running') {
    return NextResponse.json(
      { message: 'Already running', progress: existing },
      { status: 200 },
    );
  }

  // Don't re-trigger if a live site already exists (progress TTL may have expired)
  const existingSite = await getPaintedDoorSite(id);
  if (existingSite?.status === 'live') {
    return NextResponse.json({ message: 'Site already exists', site: existingSite });
  }

  // Run agent in background after response
  after(async () => {
    try {
      await runPaintedDoorAgent(id);
    } catch (error) {
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
    const buildSession = await getBuildSession(id);

    if (!progress) {
      const site = await getPaintedDoorSite(id);

      // Site is actively deploying — check Vercel for completion
      if (site && site.status === 'deploying' && site.vercelProjectId) {
        const deployResult = await checkAndUpdateDeployment(site);
        if (deployResult === 'complete') {
          return NextResponse.json({
            ideaId: id,
            status: 'complete',
            currentStep: 'Site deployed!',
            steps: [],
            result: site,
            ...(buildSession && { buildSession: projectBuildSession(buildSession) }),
          });
        }
        if (deployResult === 'error') {
          return NextResponse.json({
            ideaId: id,
            status: 'error',
            message: 'Deployment failed',
            ...(buildSession && { buildSession: projectBuildSession(buildSession) }),
          });
        }
        // Still deploying — return deploying status so frontend keeps polling
        return NextResponse.json({
          status: 'deploying',
          ...(buildSession && { buildSession: projectBuildSession(buildSession) }),
        });
      }

      // Fully deployed site already exists
      if (site && site.siteUrl && site.status === 'live') {
        return NextResponse.json({
          ideaId: id,
          status: 'complete',
          currentStep: 'Site deployed!',
          steps: [],
          result: site,
          ...(buildSession && { buildSession: projectBuildSession(buildSession) }),
        });
      }

      // Check for active build session even when no legacy progress exists
      if (buildSession) {
        return NextResponse.json({
          status: 'not_started',
          buildSession: projectBuildSession(buildSession),
        });
      }

      return NextResponse.json({ status: 'not_started' });
    }

    // Include build session in progress response if one exists
    if (buildSession) {
      return NextResponse.json({
        ...progress,
        buildSession: projectBuildSession(buildSession),
      });
    }

    return NextResponse.json(progress);
  } catch (error) {
    console.error('Error getting painted door progress:', error);
    return NextResponse.json({ error: 'Failed to get progress' }, { status: 500 });
  }
}

// PATCH — repair painted door site + publish target (fix repo name, URL, or status)
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
    const { repoName, siteUrl, status } = body as {
      repoName?: string;
      siteUrl?: string;
      status?: 'live' | 'deploying' | 'pushing';
    };

    if (!repoName && !siteUrl && !status) {
      return NextResponse.json({ error: 'At least one of repoName, siteUrl, or status is required' }, { status: 400 });
    }

    const { savePaintedDoorSite, saveDynamicPublishTarget, getDynamicPublishTarget } = await import('@/lib/painted-door-db');

    // Fix painted door site record
    const site = await getPaintedDoorSite(id);
    if (site) {
      if (repoName) site.repoName = repoName;
      if (siteUrl) site.siteUrl = siteUrl;
      if (status) site.status = status;
      await savePaintedDoorSite(site);
    }

    // Fix publish target (only if repoName or siteUrl changed)
    if (repoName || siteUrl) {
      const siteId = site?.id || `pd-${id}`;
      const target = await getDynamicPublishTarget(siteId);
      if (target) {
        if (repoName) target.repoName = repoName;
        if (siteUrl) target.siteUrl = siteUrl;
        await saveDynamicPublishTarget(target);
      }
    }

    return NextResponse.json({
      message: 'Repaired',
      site: site ? { id: site.id, repoName: site.repoName, siteUrl: site.siteUrl, status: site.status } : null,
    });
  } catch (error) {
    console.error('Error repairing painted door site:', error);
    return NextResponse.json({ error: 'Repair failed' }, { status: 500 });
  }
}

// PUT — add a file to the painted door site repo (e.g., Google verification)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { filePath, content, message } = body as {
      filePath: string;
      content: string;
      message?: string;
    };

    if (!filePath || !content) {
      return NextResponse.json({ error: 'filePath and content are required' }, { status: 400 });
    }

    const site = await getPaintedDoorSite(id);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Check if file already exists to get SHA for update
    const existingRes = await fetch(
      `https://api.github.com/repos/${site.repoOwner}/${site.repoName}/contents/${filePath}?ref=main`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
        cache: 'no-store' as RequestCache,
      },
    );
    const existingSha = existingRes.ok ? (await existingRes.json()).sha : null;

    // Push file to repo
    const payload: Record<string, string> = {
      message: message || `Add ${filePath}`,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch: 'main',
    };
    if (existingSha) payload.sha = existingSha;

    const res = await fetch(
      `https://api.github.com/repos/${site.repoOwner}/${site.repoName}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        cache: 'no-store' as RequestCache,
      },
    );

    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json({ error: `GitHub commit failed: ${res.status} ${errBody}` }, { status: 500 });
    }

    const result = await res.json();
    return NextResponse.json({
      message: 'File added',
      filePath,
      commitSha: result.commit?.sha,
      htmlUrl: result.content?.html_url,
    });
  } catch (error) {
    console.error('Error adding file to repo:', error);
    return NextResponse.json({ error: 'Failed to add file' }, { status: 500 });
  }
}

// DELETE — fully remove painted door site and all associated data
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Get site first to find siteId for cleanup
  const site = await getPaintedDoorSite(id);
  const siteId = site?.id;

  await deletePaintedDoorProgress(id);
  await deletePaintedDoorSite(id);
  await deleteBuildSession(id);
  await deleteConversationHistory(id);

  // Clean up publish target and email signups if we have a siteId
  if (siteId) {
    const { deleteDynamicPublishTarget, deleteEmailSignups } = await import('@/lib/painted-door-db');
    await deleteDynamicPublishTarget(siteId);
    await deleteEmailSignups(siteId);
  }

  return NextResponse.json({ message: 'Painted door site deleted', ideaId: id, siteId });
}
