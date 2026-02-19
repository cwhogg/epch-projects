// ---------------------------------------------------------------------------
// GitHub & Vercel API helpers (shared between painted-door-agent and website tools)
// ---------------------------------------------------------------------------

export async function createGitHubRepo(
  name: string,
  description: string,
): Promise<{ owner: string; name: string; url: string }> {
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
        auto_init: true,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return { owner: data.owner.login, name: data.name, url: data.html_url };
    }

    const errBody = await res.text();
    if (res.status === 422 && errBody.includes('name already exists')) {
      const suffix = Math.random().toString(36).substring(2, 5);
      repoName = `${name}-${suffix}`;
      attempts++;
      continue;
    }

    throw new Error(`GitHub repo creation failed: ${res.status} ${errBody}`);
  }

  throw new Error('Failed to create GitHub repo after 3 attempts');
}

export async function pushFilesToGitHub(
  owner: string,
  repoName: string,
  files: Record<string, string>,
  message = 'Initial commit: painted door test site',
): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  const baseUrl = `https://api.github.com/repos/${owner}/${repoName}`;

  // Wait for GitHub to initialize (auto_init creates README async)
  for (let attempt = 0; attempt < 15; attempt++) {
    const checkRes = await fetch(`${baseUrl}/git/ref/heads/main`, { headers });
    if (checkRes.ok) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Create blobs
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

  // Create tree
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

  // Get current commit SHA
  const refGetRes = await fetch(`${baseUrl}/git/ref/heads/main`, { headers });
  if (!refGetRes.ok) {
    const errBody = await refGetRes.text();
    throw new Error(`Failed to get main ref: ${refGetRes.status} ${errBody}`);
  }
  const refData = await refGetRes.json();
  const parentSha = refData.object.sha;

  // Create commit
  const commitRes = await fetch(`${baseUrl}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message,
      tree: treeData.sha,
      parents: [parentSha],
    }),
  });
  if (!commitRes.ok) {
    const errBody = await commitRes.text();
    throw new Error(`Failed to create commit: ${commitRes.status} ${errBody}`);
  }
  const commitData = await commitRes.json();

  // Update ref
  const refRes = await fetch(`${baseUrl}/git/refs/heads/main`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ sha: commitData.sha }),
  });
  if (!refRes.ok) {
    const errBody = await refRes.text();
    throw new Error(`Failed to update ref: ${refRes.status} ${errBody}`);
  }

  return commitData.sha;
}

export async function createVercelProject(
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
    // Project already exists — look it up instead of failing
    if (res.status === 409) {
      const lookupRes = await fetch(
        `https://api.vercel.com/v9/projects/${repoName}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (lookupRes.ok) {
        const existing = await lookupRes.json();
        return { projectId: existing.id };
      }
    }
    const errBody = await res.text();
    throw new Error(`Vercel project creation failed: ${res.status} ${errBody}`);
  }

  const data = await res.json();
  return { projectId: data.id };
}

export async function triggerDeployViaGitPush(
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

  const refRes = await fetch(`${baseUrl}/git/ref/heads/main`, { headers });
  if (!refRes.ok) throw new Error(`Failed to get main ref: ${refRes.status}`);
  const refData = await refRes.json();
  const parentSha = refData.object.sha;

  const commitRes = await fetch(`${baseUrl}/git/commits/${parentSha}`, { headers });
  if (!commitRes.ok) throw new Error(`Failed to get commit: ${commitRes.status}`);
  const commitData = await commitRes.json();

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

  const updateRes = await fetch(`${baseUrl}/git/refs/heads/main`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ sha: newCommit.sha }),
  });
  if (!updateRes.ok) throw new Error(`Failed to update ref: ${updateRes.status}`);
}
