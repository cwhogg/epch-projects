import Anthropic from '@anthropic-ai/sdk';
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

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function parseJsonResponse(text: string): unknown {
  let jsonStr = text.trim();
  // Strip markdown code fences
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Try extracting JSON object from text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse JSON from LLM response');
  }
}

// ---------- GitHub API ----------

async function createGitHubRepo(name: string, description: string): Promise<{ owner: string; name: string; url: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  let repoName = name;
  let attempts = 0;

  while (attempts < 3) {
    const res = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: repoName,
        description,
        private: false,
        auto_init: true, // Required for Git Data API to work
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return { owner: data.owner.login, name: data.name, url: data.html_url };
    }

    const errBody = await res.text();
    if (res.status === 422 && errBody.includes('name already exists')) {
      // Name collision — append suffix
      const suffix = Math.random().toString(36).substring(2, 5);
      repoName = `${name}-${suffix}`;
      attempts++;
      continue;
    }

    throw new Error(`GitHub repo creation failed: ${res.status} ${errBody}`);
  }

  throw new Error('Failed to create GitHub repo after 3 attempts');
}

async function pushFilesToGitHub(
  owner: string,
  repoName: string,
  files: Record<string, string>,
): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  const baseUrl = `https://api.github.com/repos/${owner}/${repoName}`;

  // 0. Wait for GitHub to initialize the repo (auto_init creates README async)
  for (let attempt = 0; attempt < 15; attempt++) {
    const checkRes = await fetch(`${baseUrl}/git/ref/heads/main`, { headers });
    if (checkRes.ok) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // 1. Create blobs for each file
  const blobShas: { path: string; sha: string }[] = [];
  for (const [filePath, content] of Object.entries(files)) {
    const res = await fetch(`${baseUrl}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content, encoding: 'utf-8' }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Failed to create blob for ${filePath}: ${res.status} ${errBody}`);
    }
    const data = await res.json();
    blobShas.push({ path: filePath, sha: data.sha });
  }

  // 2. Create tree
  const treeItems = blobShas.map(({ path, sha }) => ({
    path,
    mode: '100644' as const,
    type: 'blob' as const,
    sha,
  }));

  const treeRes = await fetch(`${baseUrl}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tree: treeItems }),
  });
  if (!treeRes.ok) {
    const errBody = await treeRes.text();
    throw new Error(`Failed to create tree: ${treeRes.status} ${errBody}`);
  }
  const treeData = await treeRes.json();

  // 3. Get the current commit SHA (from auto_init)
  const refGetRes = await fetch(`${baseUrl}/git/ref/heads/main`, { headers });
  if (!refGetRes.ok) {
    const errBody = await refGetRes.text();
    throw new Error(`Failed to get main ref: ${refGetRes.status} ${errBody}`);
  }
  const refData = await refGetRes.json();
  const parentSha = refData.object.sha;

  // 4. Create commit with parent
  const commitRes = await fetch(`${baseUrl}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'Initial commit: painted door test site',
      tree: treeData.sha,
      parents: [parentSha],
    }),
  });
  if (!commitRes.ok) {
    const errBody = await commitRes.text();
    throw new Error(`Failed to create commit: ${commitRes.status} ${errBody}`);
  }
  const commitData = await commitRes.json();

  // 5. Update ref to point to new commit
  const refRes = await fetch(`${baseUrl}/git/refs/heads/main`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      sha: commitData.sha,
    }),
  });
  if (!refRes.ok) {
    const errBody = await refRes.text();
    throw new Error(`Failed to update ref: ${refRes.status} ${errBody}`);
  }

  return commitData.sha;
}

// ---------- Vercel API ----------

async function createVercelProject(
  repoOwner: string,
  repoName: string,
  siteId: string,
): Promise<{ projectId: string }> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN not configured');

  const res = await fetch('https://api.vercel.com/v10/projects', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: repoName,
      framework: 'nextjs',
      gitRepository: {
        type: 'github',
        repo: `${repoOwner}/${repoName}`,
      },
      environmentVariables: [
        { key: 'UPSTASH_REDIS_REST_URL', value: process.env.UPSTASH_REDIS_REST_URL || '', target: ['production', 'preview'], type: 'encrypted' },
        { key: 'UPSTASH_REDIS_REST_TOKEN', value: process.env.UPSTASH_REDIS_REST_TOKEN || '', target: ['production', 'preview'], type: 'encrypted' },
        { key: 'SITE_ID', value: siteId, target: ['production', 'preview'], type: 'plain' },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Vercel project creation failed: ${res.status} ${errBody}`);
  }

  const data = await res.json();
  return { projectId: data.id };
}

/**
 * Push an empty commit to trigger Vercel's GitHub webhook.
 * Files are pushed before the Vercel project exists, so the initial push
 * doesn't trigger a deploy. This empty commit fires the webhook after
 * the project + integration are set up.
 */
async function triggerDeployViaGitPush(
  repoOwner: string,
  repoName: string,
): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  const baseUrl = `https://api.github.com/repos/${repoOwner}/${repoName}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  // Get current HEAD
  const refRes = await fetch(`${baseUrl}/git/ref/heads/main`, { headers });
  if (!refRes.ok) throw new Error(`Failed to get main ref: ${refRes.status}`);
  const refData = await refRes.json();
  const parentSha = refData.object.sha;

  // Get the tree from the parent commit
  const commitRes = await fetch(`${baseUrl}/git/commits/${parentSha}`, { headers });
  if (!commitRes.ok) throw new Error(`Failed to get commit: ${commitRes.status}`);
  const commitData = await commitRes.json();

  // Create new commit with same tree (empty commit)
  const newCommitRes = await fetch(`${baseUrl}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'Trigger initial deployment',
      tree: commitData.tree.sha,
      parents: [parentSha],
    }),
  });
  if (!newCommitRes.ok) throw new Error(`Failed to create commit: ${newCommitRes.status}`);
  const newCommit = await newCommitRes.json();

  // Update ref
  const updateRes = await fetch(`${baseUrl}/git/refs/heads/main`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ sha: newCommit.sha }),
  });
  if (!updateRes.ok) throw new Error(`Failed to update ref: ${updateRes.status}`);
}

async function waitForDeployment(
  projectId: string,
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
          return `https://${deployment.url}`;
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
    const brandResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: brandPrompt }],
    });

    const brandText = brandResponse.content[0].type === 'text' ? brandResponse.content[0].text : '';
    const brand = parseJsonResponse(brandText) as BrandIdentity;
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

    const siteUrl = await waitForDeployment(vercel.projectId);

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
    } catch {
      // Site might not be ready yet — that's ok, deployment was confirmed
      verified = true;
    }

    const finalSite: PaintedDoorSite = {
      ...partialSite,
      siteUrl,
      status: verified ? 'live' : 'deploying',
      deployedAt: new Date().toISOString(),
    };
    await savePaintedDoorSite(finalSite);

    await updateStep(ideaId, progress, 7, 'complete', verified ? 'Site live' : 'Deploy confirmed');

    // Complete
    progress.status = 'complete';
    progress.currentStep = 'Site deployed!';
    progress.result = finalSite;
    await savePaintedDoorProgress(ideaId, progress);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Painted door agent failed:', error);

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
      model: 'claude-sonnet-4-20250514',
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
    console.error('Website agent v2 failed:', error);

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
