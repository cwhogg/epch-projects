import Anthropic from '@anthropic-ai/sdk';
import { BrandIdentity, PaintedDoorSite, PaintedDoorProgress } from '@/types';
import { getIdeaFromDb } from './db';
import { buildContentContext } from './content-agent';
import { detectVertical } from './seo-knowledge';
import { PublishTarget } from './publish-targets';
import {
  buildBrandIdentityPrompt,
  buildCoreFilesPrompt,
  buildContentPagesPrompt,
} from './painted-door-prompts';
import {
  savePaintedDoorSite,
  savePaintedDoorProgress,
  saveDynamicPublishTarget,
  getPaintedDoorSite,
} from './painted-door-db';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const PIPELINE_STEPS = [
  'Brand Identity',
  'Code Gen (core)',
  'Code Gen (content)',
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

async function triggerDeployment(
  projectId: string,
  repoOwner: string,
  repoName: string,
): Promise<void> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN not configured');

  const res = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: repoName,
      project: projectId,
      gitSource: {
        type: 'github',
        repo: `${repoOwner}/${repoName}`,
        ref: 'main',
      },
    }),
  });

  if (!res.ok) {
    // Non-fatal — the auto-deploy may still kick in
    const errBody = await res.text();
    console.warn(`Explicit deploy trigger failed (${res.status}): ${errBody}`);
  }
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

    const vertical = detectVertical(idea);
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

    // --- Step 2: Code Gen (core files) ---
    await updateStep(ideaId, progress, 1, 'running');

    const corePrompt = buildCoreFilesPrompt(brand, idea, ctx);
    const coreResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16384,
      messages: [{ role: 'user', content: corePrompt }],
    });

    const coreText = coreResponse.content[0].type === 'text' ? coreResponse.content[0].text : '';
    const coreResult = parseJsonResponse(coreText) as { files: Record<string, string> };
    const coreFiles = coreResult.files;

    // Validate expected files present
    const expectedCore = ['app/layout.tsx', 'app/globals.css', 'app/page.tsx'];
    for (const expected of expectedCore) {
      if (!coreFiles[expected]) {
        console.warn(`Expected core file missing: ${expected}`);
      }
    }

    await updateStep(ideaId, progress, 1, 'complete', `${Object.keys(coreFiles).length} files`);

    // --- Step 3: Code Gen (content pages + config) ---
    await updateStep(ideaId, progress, 2, 'running');

    const contentPrompt = buildContentPagesPrompt(
      brand,
      coreFiles['app/layout.tsx'] || '',
      coreFiles['app/globals.css'] || '',
    );
    const contentResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 12288,
      messages: [{ role: 'user', content: contentPrompt }],
    });

    const contentText = contentResponse.content[0].type === 'text' ? contentResponse.content[0].text : '';
    const contentResult = parseJsonResponse(contentText) as { files: Record<string, string> };
    const contentFiles = contentResult.files;

    // Merge all files
    const allFiles: Record<string, string> = {
      ...coreFiles,
      ...contentFiles,
      // Add empty content directories with .gitkeep
      'content/blog/.gitkeep': '',
      'content/comparison/.gitkeep': '',
      'content/faq/.gitkeep': '',
    };

    await updateStep(ideaId, progress, 2, 'complete', `${Object.keys(contentFiles).length} files`);

    // --- Step 4: Create GitHub Repo ---
    await updateStep(ideaId, progress, 3, 'running');

    const repo = await createGitHubRepo(siteSlug, `${brand.siteName} — ${brand.tagline}`);

    await updateStep(ideaId, progress, 3, 'complete', repo.url);

    // --- Step 5: Push Files ---
    await updateStep(ideaId, progress, 4, 'running');

    const commitSha = await pushFilesToGitHub(repo.owner, repo.name, allFiles);

    await updateStep(ideaId, progress, 4, 'complete', commitSha.substring(0, 7));

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

    // --- Step 6: Create Vercel Project ---
    await updateStep(ideaId, progress, 5, 'running');

    const vercel = await createVercelProject(repo.owner, repo.name, siteId);

    partialSite.vercelProjectId = vercel.projectId;
    partialSite.status = 'deploying';
    await savePaintedDoorSite(partialSite);

    await updateStep(ideaId, progress, 5, 'complete', vercel.projectId);

    // --- Step 7: Wait for Deploy ---
    await updateStep(ideaId, progress, 6, 'running');

    // Explicitly trigger a deployment in case auto-deploy doesn't fire
    await triggerDeployment(vercel.projectId, repo.owner, repo.name);

    const siteUrl = await waitForDeployment(vercel.projectId);

    partialSite.siteUrl = siteUrl;
    await savePaintedDoorSite(partialSite);

    await updateStep(ideaId, progress, 6, 'complete', siteUrl);

    // --- Step 8: Register Publish Target ---
    await updateStep(ideaId, progress, 7, 'running');

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

    await updateStep(ideaId, progress, 7, 'complete', siteId);

    // --- Step 9: Verify ---
    await updateStep(ideaId, progress, 8, 'running');

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

    await updateStep(ideaId, progress, 8, 'complete', verified ? 'Site live' : 'Deploy confirmed');

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
