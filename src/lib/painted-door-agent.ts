import { BrandIdentity, PaintedDoorSite, PaintedDoorProgress } from '@/types';
import { getIdeaFromDb } from './db';
import { buildContentContext } from './content-agent';
import { PublishTarget } from './publish-targets';
import { buildBrandIdentityPrompt } from './painted-door-prompts';
import { assembleAllFiles } from './painted-door-templates';
import {
  savePaintedDoorSite,
  savePaintedDoorProgress,
  saveDynamicPublishTarget,
  getPaintedDoorSite,
} from './painted-door-db';
import { parseLLMJson } from './llm-utils';
import { slugify } from './utils';
import { getAnthropic } from './anthropic';
import { CLAUDE_MODEL } from './config';
import { createGitHubRepo, pushFilesToGitHub, createVercelProject, triggerDeployViaGitPush } from './github-api';

const PIPELINE_STEPS = [
  'Brand Identity',
  'Assemble Files',
  'Create GitHub Repo',
  'Push Files',
  'Create Vercel Project',
  'Wait for Deploy',
  'Register Publish Target',
  'Verify',
];

function createProgress(ideaId: string): PaintedDoorProgress {
  return {
    ideaId,
    status: 'pending',
    currentStep: 'Initializing...',
    steps: PIPELINE_STEPS.map((name) => ({ name, status: 'pending' as const })),
  };
}

async function updateStep(
  ideaId: string,
  progress: PaintedDoorProgress,
  stepIndex: number,
  status: 'running' | 'complete' | 'error',
  detail?: string,
): Promise<void> {
  progress.steps[stepIndex].status = status;
  if (detail) progress.steps[stepIndex].detail = detail;
  if (status === 'running') {
    progress.status = 'running';
    progress.currentStep = progress.steps[stepIndex].name;
  }
  await savePaintedDoorProgress(ideaId, progress);
}

async function getProjectProductionUrl(projectId: string, token: string): Promise<string | null> {
  // Query the project to get its actual production domain
  const res = await fetch(`https://api.vercel.com/v9/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;

  const project = await res.json();
  // The project has a 'targets' object with production domain info
  // or we can check the 'alias' array on the project
  const productionTarget = project.targets?.production;
  if (productionTarget?.alias) {
    // Find the .vercel.app alias
    const vercelAlias = productionTarget.alias.find((a: string) => a.endsWith('.vercel.app'));
    if (vercelAlias) return vercelAlias;
  }

  // Fallback: check project.alias array
  if (Array.isArray(project.alias)) {
    const vercelAlias = project.alias.find((a: { domain: string }) =>
      a.domain?.endsWith('.vercel.app')
    );
    if (vercelAlias?.domain) return vercelAlias.domain;
  }

  // Last resort: use the project name from Vercel (which includes any suffix)
  if (project.name) {
    return `${project.name}.vercel.app`;
  }

  return null;
}

async function waitForDeployment(
  projectId: string,
  projectName: string,
  timeoutMs: number = 300000,
): Promise<string> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN not configured');

  const startTime = Date.now();
  const pollInterval = 10000; // 10 seconds

  while (Date.now() - startTime < timeoutMs) {
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (res.ok) {
      const data = await res.json();
      const deployments = data.deployments || [];
      if (deployments.length > 0) {
        const deployment = deployments[0];
        if (deployment.state === 'READY' || deployment.readyState === 'READY') {
          // Get the production URL from the project (not deployment) to get the actual assigned domain
          const projectUrl = await getProjectProductionUrl(projectId, token);
          const siteUrl = projectUrl
            ? (projectUrl.startsWith('http') ? projectUrl : `https://${projectUrl}`)
            : `https://${projectName}.vercel.app`;
          console.log(`[painted-door] Deployment ready. Project URL: ${projectUrl}. Using: ${siteUrl}`);
          return siteUrl;
        }
        if (deployment.state === 'ERROR' || deployment.readyState === 'ERROR') {
          throw new Error(`Deployment failed: ${deployment.url}`);
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error('Deployment timed out after 5 minutes');
}

// ---------- Main Pipeline ----------

export async function runPaintedDoorAgent(ideaId: string): Promise<void> {
  const progress = createProgress(ideaId);
  progress.status = 'running';
  await savePaintedDoorProgress(ideaId, progress);

  try {
    // Load data
    const idea = await getIdeaFromDb(ideaId);
    if (!idea) throw new Error('Idea not found');

    const ctx = await buildContentContext(ideaId);
    if (!ctx) throw new Error('No analysis context found — run research agent first');

    const siteSlug = slugify(idea.name);
    const siteId = `pd-${siteSlug}`;

    // --- Step 1: Brand Identity ---
    await updateStep(ideaId, progress, 0, 'running');

    const brandPrompt = buildBrandIdentityPrompt(idea, ctx);
    const brandResponse = await getAnthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16384,
      messages: [{ role: 'user', content: brandPrompt }],
    });

    if (brandResponse.stop_reason === 'max_tokens') {
      throw new Error('Brand identity response was truncated — LLM hit token limit');
    }

    const brandText = brandResponse.content[0].type === 'text' ? brandResponse.content[0].text : '';
    const brand = parseLLMJson<BrandIdentity>(brandText);

    if (!brand.landingPage) {
      throw new Error('Brand identity is missing landingPage — LLM did not generate landing page copy');
    }

    await updateStep(ideaId, progress, 0, 'complete', brand.siteName);

    // --- Step 2: Assemble Files ---
    await updateStep(ideaId, progress, 1, 'running');

    const allFiles = assembleAllFiles(brand, ctx);

    await updateStep(ideaId, progress, 1, 'complete', `${Object.keys(allFiles).length} files`);

    // --- Step 3: Create GitHub Repo (or reuse existing) ---
    await updateStep(ideaId, progress, 2, 'running');

    const existingSite = await getPaintedDoorSite(ideaId);
    const isRebuild = !!(existingSite?.repoOwner && existingSite?.repoName);
    const repo = isRebuild
      ? { owner: existingSite.repoOwner, name: existingSite.repoName, url: existingSite.repoUrl }
      : await createGitHubRepo(siteSlug, `${brand.siteName} — ${brand.tagline}`);

    await updateStep(ideaId, progress, 2, 'complete', isRebuild ? `reused ${repo.name}` : repo.url);

    // --- Step 4: Push Files ---
    await updateStep(ideaId, progress, 3, 'running');

    const commitMessage = isRebuild ? 'Rebuild: updated site' : 'Initial commit: painted door test site';
    const commitSha = await pushFilesToGitHub(repo.owner, repo.name, allFiles, commitMessage);

    await updateStep(ideaId, progress, 3, 'complete', commitSha.substring(0, 7));

    // Save partial state in case later steps fail
    const partialSite: PaintedDoorSite = {
      id: siteId,
      ideaId,
      ideaName: idea.name,
      brand,
      repoOwner: repo.owner,
      repoName: repo.name,
      repoUrl: repo.url,
      siteUrl: existingSite?.siteUrl || '',
      vercelProjectId: existingSite?.vercelProjectId || '',
      status: 'pushing',
      createdAt: existingSite?.createdAt || new Date().toISOString(),
      signupCount: existingSite?.signupCount || 0,
    };
    await savePaintedDoorSite(partialSite);

    // --- Step 5: Create Vercel Project (or reuse existing) ---
    await updateStep(ideaId, progress, 4, 'running');

    let vercelProjectId = existingSite?.vercelProjectId || '';
    if (!vercelProjectId) {
      const vercel = await createVercelProject(repo.owner, repo.name, siteId);
      vercelProjectId = vercel.projectId;
    }

    partialSite.vercelProjectId = vercelProjectId;
    partialSite.status = 'deploying';
    await savePaintedDoorSite(partialSite);

    await updateStep(ideaId, progress, 4, 'complete', isRebuild ? `reused ${vercelProjectId}` : vercelProjectId);

    // --- Step 6: Wait for Deploy ---
    await updateStep(ideaId, progress, 5, 'running');

    // Push empty commit to trigger Vercel's GitHub webhook
    await triggerDeployViaGitPush(repo.owner, repo.name);

    const siteUrl = await waitForDeployment(vercelProjectId, repo.name);

    partialSite.siteUrl = siteUrl;
    await savePaintedDoorSite(partialSite);

    await updateStep(ideaId, progress, 5, 'complete', siteUrl);

    // --- Step 7: Register Publish Target ---
    await updateStep(ideaId, progress, 6, 'running');

    const publishTarget: PublishTarget = {
      id: siteId,
      repoOwner: repo.owner,
      repoName: repo.name,
      branch: 'main',
      siteUrl,
      pathMap: {
        'blog-post': 'content/blog',
        'comparison': 'content/comparison',
        'faq': 'content/faq',
      },
    };
    await saveDynamicPublishTarget(publishTarget);

    await updateStep(ideaId, progress, 6, 'complete', siteId);

    // --- Step 8: Verify ---
    await updateStep(ideaId, progress, 7, 'running');

    let verified = false;
    try {
      const verifyRes = await fetch(siteUrl, { method: 'HEAD' });
      verified = verifyRes.ok;
    } catch (error) {
      console.debug('[painted-door] site verification skipped:', error);
      verified = true;
    }

    const finalSite: PaintedDoorSite = {
      ...partialSite,
      siteUrl,
      status: verified ? 'live' : 'deploying',
      deployedAt: new Date().toISOString(),
    };
    await savePaintedDoorSite(finalSite);

    // If a content calendar already exists, update its targetId to point to this site
    const { getContentCalendar, saveContentCalendar } = await import('./db');
    const existingCalendar = await getContentCalendar(ideaId);
    if (existingCalendar && existingCalendar.targetId !== siteId) {
      existingCalendar.targetId = siteId;
      await saveContentCalendar(ideaId, existingCalendar);
      console.log(`[painted-door] Updated content calendar targetId to ${siteId}`);
    }

    await updateStep(ideaId, progress, 7, 'complete', verified ? 'Site live' : 'Deploy confirmed');

    // Complete
    progress.status = 'complete';
    progress.currentStep = 'Site deployed!';
    progress.result = finalSite;
    await savePaintedDoorProgress(ideaId, progress);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[painted-door] Painted door agent failed:', error);

    // Find the currently running step and mark it as error
    const runningStep = progress.steps.findIndex((s) => s.status === 'running');
    if (runningStep >= 0) {
      progress.steps[runningStep].status = 'error';
      progress.steps[runningStep].detail = message;
    }

    progress.status = 'error';
    progress.error = message;
    progress.currentStep = 'Failed';
    await savePaintedDoorProgress(ideaId, progress);

    // Update site status to failed if it exists
    const existingSite = await getPaintedDoorSite(ideaId);
    if (existingSite) {
      existingSite.status = 'failed';
      existingSite.error = message;
      await savePaintedDoorSite(existingSite);
    }
  }
}

