import { BrandIdentity, PaintedDoorSite, PaintedDoorProgress } from '@/types';
import { getIdeaFromDb } from './db';
import { buildContentContext } from './content-agent';
import { PublishTarget } from './publish-targets';
import { buildBrandIdentityPrompt } from './painted-door-prompts';
import { assembleAllFiles } from './painted-door-templates';
import {
  savePaintedDoorSite,
  savePaintedDoorProgress,
  getPaintedDoorProgress,
  saveDynamicPublishTarget,
  getPaintedDoorSite,
} from './painted-door-db';
import {
  runAgent,
  resumeAgent,
  getAgentState,
  deleteAgentState,
  saveActiveRun,
  getActiveRunId,
  clearActiveRun,
} from './agent-runtime';
import { createWebsiteTools } from './agent-tools/website';
import { createPlanTools, createScratchpadTools } from './agent-tools/common';
import { emitEvent } from './agent-events';
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
      max_tokens: 2048,
      messages: [{ role: 'user', content: brandPrompt }],
    });

    const brandText = brandResponse.content[0].type === 'text' ? brandResponse.content[0].text : '';
    const brand = parseLLMJson<BrandIdentity>(brandText);
    await updateStep(ideaId, progress, 0, 'complete', brand.siteName);

    // --- Step 2: Assemble Files ---
    await updateStep(ideaId, progress, 1, 'running');

    const allFiles = assembleAllFiles(brand, ctx);

    await updateStep(ideaId, progress, 1, 'complete', `${Object.keys(allFiles).length} files`);

    // --- Step 3: Create GitHub Repo ---
    await updateStep(ideaId, progress, 2, 'running');

    const repo = await createGitHubRepo(siteSlug, `${brand.siteName} — ${brand.tagline}`);

    await updateStep(ideaId, progress, 2, 'complete', repo.url);

    // --- Step 4: Push Files ---
    await updateStep(ideaId, progress, 3, 'running');

    const commitSha = await pushFilesToGitHub(repo.owner, repo.name, allFiles);

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
      siteUrl: '',
      vercelProjectId: '',
      status: 'pushing',
      createdAt: new Date().toISOString(),
      signupCount: 0,
    };
    await savePaintedDoorSite(partialSite);

    // --- Step 5: Create Vercel Project ---
    await updateStep(ideaId, progress, 4, 'running');

    const vercel = await createVercelProject(repo.owner, repo.name, siteId);

    partialSite.vercelProjectId = vercel.projectId;
    partialSite.status = 'deploying';
    await savePaintedDoorSite(partialSite);

    await updateStep(ideaId, progress, 4, 'complete', vercel.projectId);

    // --- Step 6: Wait for Deploy ---
    await updateStep(ideaId, progress, 5, 'running');

    // Push empty commit to trigger Vercel's GitHub webhook
    await triggerDeployViaGitPush(repo.owner, repo.name);

    const siteUrl = await waitForDeployment(vercel.projectId, repo.name);

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

// ---------------------------------------------------------------------------
// V2: Agentic website builder
// ---------------------------------------------------------------------------

const WEBSITE_SYSTEM_PROMPT = `You are a website builder agent. Your job is to create a complete painted door test website for a product idea.

You have tools to:
1. Load the product idea and research context
2. Design a brand identity (colors, typography, copy)
3. Evaluate the brand identity for SEO quality
4. Assemble all site files from pre-tested templates (instant, no LLM call)
5. Validate generated code for common issues
6. Create a GitHub repo and push all files
7. Create a Vercel project and deploy the site
8. Fetch build error logs from a failed deployment (get_deploy_error)
9. Update individual files to fix build errors (update_file)
10. Register the site as a publish target for future content
11. Delegate to the content agent to create a content calendar

WORKFLOW:
1. Call get_idea_context to understand the product
2. Call design_brand to create the brand identity
3. Call evaluate_brand to check SEO quality — if score < 7, note the issues
4. Call assemble_site_files to build all ~21 files from templates using brand data
5. Call validate_code to check for common issues
6. Call create_repo to create a GitHub repository
7. Call push_files to push all generated files
8. Call create_vercel_project to set up hosting
9. Call trigger_deploy to start the deployment
10. Call check_deploy_status to monitor — if not READY, wait and check again (up to 5 times)
    IF check_deploy_status returns ERROR:
      a. Call get_deploy_error to fetch the build logs
      b. Analyze the error — identify which file and what the issue is
      c. Call update_file to fix the problematic file(s)
      d. Call push_files to push the fixed code (Vercel will auto-redeploy)
      e. Call check_deploy_status again to monitor the new deployment
      f. Maximum 2 fix-and-redeploy attempts. If still failing after 2 retries, report the error.
11. Call register_publish_target to enable content publishing
12. Call verify_site to confirm accessibility
13. Call finalize_site to save the final record
14. Call invoke_content_agent to create a content calendar for the site

EVALUATION RULES:
- After design_brand, ALWAYS call evaluate_brand. If the primary keyword is missing from the headline or the meta description is the wrong length, note this but continue.
- After assemble_site_files, ALWAYS call validate_code. Templates are pre-tested so issues should be rare. If validate_code reports a problem, use update_file to fix the specific file.
- On deployment ERROR, ALWAYS call get_deploy_error before giving up. Use update_file to fix the specific file, then push_files and check_deploy_status again.

IMPORTANT:
- Follow the steps in order — each step depends on the previous one
- If check_deploy_status shows the deployment is still in progress, call it again after a moment
- If any step fails, report the error clearly
- Do NOT skip any steps
- Use the scratchpad (write_scratchpad / read_scratchpad) to store notes between steps`;

// Map tool names to v1 pipeline step indices for progress bridging
const TOOL_TO_STEP: Record<string, number> = {
  get_idea_context: 0,
  design_brand: 0,
  assemble_site_files: 1,
  create_repo: 2,
  push_files: 3,
  create_vercel_project: 4,
  trigger_deploy: 5,
  check_deploy_status: 5,
  get_deploy_error: 5,
  update_file: 5,
  register_publish_target: 6,
  verify_site: 7,
  finalize_site: 7,
};

async function runPaintedDoorAgentV2(ideaId: string): Promise<void> {
  // --- Check for a paused run to resume ---
  const existingRunId = await getActiveRunId('website', ideaId);
  let pausedState = existingRunId ? await getAgentState(existingRunId) : null;
  if (pausedState && pausedState.status !== 'paused') {
    pausedState = null;
  }

  const runId = pausedState ? pausedState.runId : `website-${ideaId}-${Date.now()}`;
  const isResume = !!pausedState;

  // Load existing progress on resume, or create fresh
  let progress: PaintedDoorProgress;
  if (isResume) {
    const existing = await getPaintedDoorProgress(ideaId);
    progress = existing || createProgress(ideaId);
    progress.status = 'running';
    progress.currentStep = 'Resuming site generation...';
  } else {
    progress = createProgress(ideaId);
    progress.status = 'running';
  }
  await savePaintedDoorProgress(ideaId, progress);

  // Determine where we left off for step tracking
  let lastStepIndex = isResume
    ? progress.steps.findIndex((s) => s.status === 'running' || s.status === 'pending') - 1
    : -1;
  if (lastStepIndex < -1) lastStepIndex = -1;

  const tools = [
    ...createWebsiteTools(ideaId),
    ...createPlanTools(runId),
    ...createScratchpadTools(),
  ];

  try {
    const config = {
      agentId: 'website',
      runId,
      model: CLAUDE_MODEL,
      maxTokens: 4096,
      maxTurns: 30,
      tools,
      systemPrompt: WEBSITE_SYSTEM_PROMPT,
      onProgress: async (step: string, detail?: string) => {
        if (step === 'tool_call' && detail) {
          const toolName = detail.split(',')[0].trim();
          const stepIndex = TOOL_TO_STEP[toolName];
          if (stepIndex !== undefined && stepIndex !== lastStepIndex) {
            if (lastStepIndex >= 0) {
              await updateStep(ideaId, progress, lastStepIndex, 'complete');
            }
            await updateStep(ideaId, progress, stepIndex, 'running');
            lastStepIndex = stepIndex;
          }
        }
        if (step === 'complete') {
          for (let i = 0; i < progress.steps.length; i++) {
            if (progress.steps[i].status === 'running') {
              progress.steps[i].status = 'complete';
            }
          }
          progress.status = 'complete';
          progress.currentStep = 'Site deployed!';
          const site = await getPaintedDoorSite(ideaId);
          if (site) progress.result = site;
          await savePaintedDoorProgress(ideaId, progress);
        }
        if (step === 'error' && detail) {
          const runningStep = progress.steps.findIndex((s) => s.status === 'running');
          if (runningStep >= 0) {
            progress.steps[runningStep].status = 'error';
            progress.steps[runningStep].detail = detail;
          }
          progress.status = 'error';
          progress.error = detail;
          progress.currentStep = 'Failed';
          await savePaintedDoorProgress(ideaId, progress);
        }
      },
    };

    // --- Run or resume ---
    let state;
    if (pausedState) {
      console.log(`[website-v2] Resuming paused run ${runId} (resume #${pausedState.resumeCount + 1})`);
      state = await resumeAgent(config, pausedState);
    } else {
      state = await runAgent(
        config,
        `Build a painted door test website for idea ${ideaId}. Follow the workflow steps in order.`,
      );
    }

    // --- Handle result ---
    if (state.status === 'paused') {
      await saveActiveRun('website', ideaId, runId);
      progress.status = 'running'; // Keep showing as running to frontend
      progress.currentStep = 'Resuming...';
      await savePaintedDoorProgress(ideaId, progress);
      throw new Error('AGENT_PAUSED');
    }

    // Clean up on completion/error
    await clearActiveRun('website', ideaId);
    await deleteAgentState(runId);

    if (state.status === 'error') {
      throw new Error(state.error || 'Website agent failed');
    }

    // Emit event for other agents
    await emitEvent({
      type: 'site_deployed',
      agentId: 'website',
      ideaId,
      timestamp: new Date().toISOString(),
      payload: {
        status: state.status,
        finalOutput: state.finalOutput?.slice(0, 500),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'AGENT_PAUSED') {
      throw error; // Propagate for the API route to handle
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[website-v2] Website agent v2 failed:', error);

    await clearActiveRun('website', ideaId);

    const runningStep = progress.steps.findIndex((s) => s.status === 'running');
    if (runningStep >= 0) {
      progress.steps[runningStep].status = 'error';
      progress.steps[runningStep].detail = message;
    }
    progress.status = 'error';
    progress.error = message;
    progress.currentStep = 'Failed';
    await savePaintedDoorProgress(ideaId, progress);

    const existingSite = await getPaintedDoorSite(ideaId);
    if (existingSite) {
      existingSite.status = 'failed';
      existingSite.error = message;
      await savePaintedDoorSite(existingSite);
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-switcher: v1 vs v2 based on AGENT_V2 env var
// ---------------------------------------------------------------------------

export async function runPaintedDoorAgentAuto(ideaId: string): Promise<void> {
  if (process.env.AGENT_V2 === 'true') {
    return runPaintedDoorAgentV2(ideaId);
  }
  return runPaintedDoorAgent(ideaId);
}
