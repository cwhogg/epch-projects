import { NextRequest, NextResponse } from 'next/server';
import { getPaintedDoorSite, savePaintedDoorSite } from '@/lib/painted-door-db';
import { pushFilesToGitHub, createVercelProject, triggerDeployViaGitPush } from '@/lib/github-api';
import { slugify } from '@/lib/utils';
import { getIdeaFromDb } from '@/lib/db';

/**
 * POST — push a minimal test page and deploy.
 * Bypasses the full LLM pipeline to verify the deploy mechanism works end-to-end.
 * Temporary debugging endpoint.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const idea = await getIdeaFromDb(id);
  if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 });

  const site = await getPaintedDoorSite(id);
  const siteSlug = slugify(idea.name);
  const siteId = `pd-${siteSlug}`;
  const timestamp = new Date().toISOString();

  const testFiles: Record<string, string> = {
    'package.json': JSON.stringify({
      name: 'test-deploy',
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
      dependencies: { next: '^15.1.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
      devDependencies: { '@types/node': '^22.0.0', '@types/react': '^19.0.0', typescript: '^5.7.0' },
    }, null, 2),
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2017', lib: ['dom', 'es2017'], jsx: 'preserve', module: 'esnext', moduleResolution: 'bundler', strict: true, esModuleInterop: true, skipLibCheck: true, paths: { '@/*': ['./*'] } }, include: ['**/*.ts', '**/*.tsx'], exclude: ['node_modules'] }, null, 2),
    'next.config.ts': 'export default {};',
    'app/layout.tsx': `export const metadata = { title: 'Deploy Test' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>;
}`,
    'app/page.tsx': `export default function Home() {
  return (
    <main style={{ padding: '4rem', fontFamily: 'system-ui', textAlign: 'center' }}>
      <h1>Deploy Test Successful</h1>
      <p>Pipeline is working. Deployed at ${timestamp}</p>
      <p>Idea: ${idea.name}</p>
    </main>
  );
}`,
  };

  const steps: string[] = [];

  try {
    // Step 1: Push files (reuse existing repo or create new)
    let repoOwner = site?.repoOwner || '';
    let repoName = site?.repoName || '';

    if (repoOwner && repoName) {
      steps.push(`Reusing repo: ${repoOwner}/${repoName}`);
    } else {
      const { createGitHubRepo } = await import('@/lib/github-api');
      const repo = await createGitHubRepo(siteSlug, `Test deploy for ${idea.name}`);
      repoOwner = repo.owner;
      repoName = repo.name;
      steps.push(`Created repo: ${repoOwner}/${repoName}`);
    }

    const sha = await pushFilesToGitHub(repoOwner, repoName, testFiles, 'Test deploy: minimal page');
    steps.push(`Pushed files: ${sha.substring(0, 7)}`);

    // Step 2: Create Vercel project if needed
    let vercelProjectId = site?.vercelProjectId || '';
    if (!vercelProjectId) {
      const vercel = await createVercelProject(repoOwner, repoName, siteId);
      vercelProjectId = vercel.projectId;
      steps.push(`Created Vercel project: ${vercelProjectId}`);
    } else {
      steps.push(`Reusing Vercel project: ${vercelProjectId}`);
    }

    // Step 3: Trigger deploy — only needed for new Vercel projects that missed the push webhook.
    // When reusing an existing project, the push already triggered deployment.
    if (!site?.vercelProjectId) {
      await triggerDeployViaGitPush(repoOwner, repoName);
      steps.push('Triggered deploy via empty commit');
    } else {
      steps.push('Deploy triggered by push webhook (existing Vercel project)');
    }

    // Save site record
    const updatedSite = {
      id: siteId,
      ideaId: id,
      ideaName: idea.name,
      brand: site?.brand || { siteName: idea.name, tagline: 'test', siteUrl: '', colors: { primary: '#000', primaryLight: '#333', background: '#111', backgroundElevated: '#222', text: '#fff', textSecondary: '#ccc', textMuted: '#999', accent: '#0ff', border: '#444' }, fonts: { heading: 'Inter', body: 'Inter', mono: 'Fira Code' }, theme: 'dark' as const },
      repoOwner,
      repoName,
      repoUrl: `https://github.com/${repoOwner}/${repoName}`,
      siteUrl: site?.siteUrl || `https://${repoName}.vercel.app`,
      vercelProjectId,
      status: 'deploying' as const,
      createdAt: site?.createdAt || timestamp,
      signupCount: site?.signupCount || 0,
    };
    await savePaintedDoorSite(updatedSite);
    steps.push('Saved site record');

    return NextResponse.json({
      message: 'Test deploy triggered',
      steps,
      expectedUrl: `https://${repoName}.vercel.app`,
      vercelProjectId,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    steps.push(`ERROR: ${msg}`);
    return NextResponse.json({ error: msg, steps }, { status: 500 });
  }
}
