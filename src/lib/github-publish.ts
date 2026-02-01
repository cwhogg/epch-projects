import { ContentType } from '@/types';

const REPO_OWNER = 'cwhogg';
const REPO_NAME = 'secondlook';
const BRANCH = 'main';

const PATH_MAP: Record<ContentType, string> = {
  'blog-post': 'content/blog',
  'landing-page': 'content/landing-page',
  'comparison': 'content/comparison',
  'faq': 'content/faq',
};

function getFilename(type: ContentType, slug: string): string {
  switch (type) {
    case 'blog-post':
      return `blog-${slug}.md`;
    case 'landing-page':
      return `landing-page-${slug}.md`;
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

async function getExistingFileSha(
  token: string,
  filePath: string,
): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${BRANCH}`,
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

export async function commitToSecondlook(
  type: ContentType,
  slug: string,
  markdown: string,
  commitMessage: string,
): Promise<CommitResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN not configured');
  }

  const dir = PATH_MAP[type] || 'content';
  const filename = getFilename(type, slug);
  const filePath = `${dir}/${filename}`;

  const content = flipDraftToPublished(markdown);
  const encoded = Buffer.from(content, 'utf-8').toString('base64');

  // Check for existing file to get SHA for idempotent update
  const existingSha = await getExistingFileSha(token, filePath);

  const body: Record<string, string> = {
    message: commitMessage,
    content: encoded,
    branch: BRANCH,
  };
  if (existingSha) {
    body.sha = existingSha;
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`,
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
