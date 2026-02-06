import { ContentType } from '@/types';
import { PublishTarget, getPublishTarget } from './publish-targets';

export function getFilename(_type: ContentType, slug: string): string {
  // Files live in type-specific directories (content/blog/, content/comparison/,
  // content/faq/) so no type prefix needed. The template's lib/content.ts uses
  // the filename (minus .md) as the slug for URLs.
  return `${slug}.md`;
}

export function flipDraftToPublished(markdown: string): string {
  return markdown.replace(/^(status:\s*)draft\s*$/m, '$1published');
}

export function enrichFrontmatter(
  markdown: string,
  target: PublishTarget,
  type: ContentType,
  slug: string,
): string {
  const typeToPath: Record<ContentType, string> = {
    'blog-post': '/blog',
    'comparison': '/compare',
    'faq': '/faq',
  };
  const urlPath = typeToPath[type] || '/blog';
  const canonicalUrl = `${target.siteUrl}${urlPath}/${slug}`;

  // Replace generatedAt with publish date so posts appear on different days
  let enriched = markdown.replace(
    /^generatedAt:.*$/m,
    `date: "${new Date().toISOString()}"`,
  );

  // Inject canonicalUrl into existing frontmatter
  return enriched.replace(
    /^(---\n[\s\S]*?)(---)/m,
    `$1canonicalUrl: "${canonicalUrl}"\n$2`,
  );
}

async function getExistingFileSha(
  token: string,
  target: PublishTarget,
  filePath: string,
): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${target.repoOwner}/${target.repoName}/contents/${filePath}?ref=${target.branch}`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
      cache: 'no-store' as RequestCache,
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API error fetching file SHA: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.sha as string;
}

export interface CommitResult {
  commitSha: string;
  filePath: string;
  htmlUrl: string;
}

export async function commitToRepo(
  target: PublishTarget,
  type: ContentType,
  slug: string,
  markdown: string,
  commitMessage: string,
): Promise<CommitResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN not configured');
  }

  const dir = target.pathMap[type] || 'content';
  const filename = getFilename(type, slug);
  const filePath = `${dir}/${filename}`;

  let content = flipDraftToPublished(markdown);
  content = enrichFrontmatter(content, target, type, slug);
  const encoded = Buffer.from(content, 'utf-8').toString('base64');

  // Check for existing file to get SHA for idempotent update
  const existingSha = await getExistingFileSha(token, target, filePath);

  const body: Record<string, string> = {
    message: commitMessage,
    content: encoded,
    branch: target.branch,
  };
  if (existingSha) {
    body.sha = existingSha;
  }

  const res = await fetch(
    `https://api.github.com/repos/${target.repoOwner}/${target.repoName}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store' as RequestCache,
    },
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`GitHub commit failed: ${res.status} ${errBody}`);
  }

  const data = await res.json();
  const commitSha = data?.commit?.sha as string;
  if (!commitSha) {
    console.error('[commitToRepo] Unexpected response — no commit SHA:', JSON.stringify(data).slice(0, 500));
    throw new Error(`GitHub commit returned unexpected response (no commit SHA)`);
  }

  console.log(`[commitToRepo] Committed ${filePath} to ${target.repoOwner}/${target.repoName}@${target.branch} — SHA: ${commitSha}`);

  return {
    commitSha,
    filePath,
    htmlUrl: data.content?.html_url as string,
  };
}

/** Backward-compat wrapper — commits to secondlook target */
export async function commitToSecondlook(
  type: ContentType,
  slug: string,
  markdown: string,
  commitMessage: string,
): Promise<CommitResult> {
  const target = await getPublishTarget('secondlook');
  return commitToRepo(target, type, slug, markdown, commitMessage);
}

/** Delete a file from a repo */
export async function deleteFromRepo(
  target: PublishTarget,
  type: ContentType,
  slug: string,
  commitMessage: string,
): Promise<{ deleted: boolean; filePath: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN not configured');
  }

  const dir = target.pathMap[type] || 'content';
  const filePath = `${dir}/${slug}.md`;

  // Get existing file SHA
  const existingSha = await getExistingFileSha(token, target, filePath);
  if (!existingSha) {
    return { deleted: false, filePath };
  }

  const res = await fetch(
    `https://api.github.com/repos/${target.repoOwner}/${target.repoName}/contents/${filePath}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: commitMessage,
        sha: existingSha,
        branch: target.branch,
      }),
      cache: 'no-store' as RequestCache,
    },
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`GitHub delete failed: ${res.status} ${errBody}`);
  }

  console.log(`[deleteFromRepo] Deleted ${filePath} from ${target.repoOwner}/${target.repoName}`);
  return { deleted: true, filePath };
}
