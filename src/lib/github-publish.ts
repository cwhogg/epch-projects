import { ContentType } from '@/types';
import { PublishTarget, getPublishTarget } from './publish-targets';

function getFilename(type: ContentType, slug: string): string {
  switch (type) {
    case 'blog-post':
      return `blog-${slug}.md`;
    case 'comparison':
      return `comparison-${slug}.md`;
    case 'faq':
      return `faq-${slug}.md`;
    default:
      return `${slug}.md`;
  }
}

function flipDraftToPublished(markdown: string): string {
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
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } },
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
    },
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`GitHub commit failed: ${res.status} ${errBody}`);
  }

  const data = await res.json();
  return {
    commitSha: data.commit.sha as string,
    filePath,
    htmlUrl: data.content.html_url as string,
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
