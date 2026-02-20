import { BrandIdentity } from '@/types';
import { renderLandingPage as renderLandingPageFromSpec } from './painted-door-sections';
import { getMissingSectionTypes } from './painted-door-page-spec';
import type { PageSpec } from './painted-door-page-spec';

// ---------------------------------------------------------------------------
// String escaping helper — safely embed brand values in JS template literals
// ---------------------------------------------------------------------------

export function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

/** Escape for embedding inside JSX string attributes (single-quoted) */
export function escAttr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
}

// ---------------------------------------------------------------------------
// Google Fonts URL helper
// ---------------------------------------------------------------------------

function googleFontsUrl(brand: BrandIdentity): string {
  const fonts = [brand.fonts.heading, brand.fonts.body, brand.fonts.mono];
  const unique = [...new Set(fonts)];
  const params = unique
    .map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------

export function navFragment(brand: BrandIdentity): string {
  const siteName = esc(brand.siteName);
  return `      <header className="border-b border-border bg-background-elevated">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a href="/" className="text-xl font-bold text-primary" style={{ fontFamily: "'${escAttr(brand.fonts.heading)}', sans-serif" }}>
            ${siteName}
          </a>
          <div className="flex items-center gap-6 text-sm">
            <a href="/blog" className="text-text-muted hover:text-text transition-colors">Blog</a>
            <a href="/compare" className="text-text-muted hover:text-text transition-colors">Comparisons</a>
            <a href="/faq" className="text-text-muted hover:text-text transition-colors">FAQ</a>
          </div>
        </nav>
      </header>`;
}

export function footerFragment(brand: BrandIdentity): string {
  const siteName = esc(brand.siteName);
  const year = new Date().getFullYear();
  return `      <footer className="border-t border-border bg-background-elevated mt-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-text-muted text-sm">&copy; ${year} ${siteName}. All rights reserved.</p>
            <div className="flex gap-6 text-sm">
              <a href="/" className="text-text-muted hover:text-text transition-colors">Home</a>
              <a href="/blog" className="text-text-muted hover:text-text transition-colors">Blog</a>
              <a href="/compare" className="text-text-muted hover:text-text transition-colors">Comparisons</a>
              <a href="/faq" className="text-text-muted hover:text-text transition-colors">FAQ</a>
            </div>
          </div>
        </div>
      </footer>`;
}

// ---------------------------------------------------------------------------
// Static constants — never change, no interpolation needed
// ---------------------------------------------------------------------------

const PACKAGE_JSON = `{
  "name": "painted-door-site",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@upstash/redis": "^1.34.0",
    "gray-matter": "^4.0.3",
    "remark": "^15.0.1",
    "remark-html": "^16.0.1"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0"
  }
}`;

const TSCONFIG_JSON = `{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {}
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}`;

const NEXT_CONFIG_TS = `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
`;

const POSTCSS_CONFIG_MJS = `/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
`;

const GITIGNORE = `# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files
.env*
!.env.example

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
`;

const LIB_CONTENT_TS = `import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import html from 'remark-html';

type ContentType = 'blog-post' | 'comparison' | 'faq';

const TYPE_TO_DIR: Record<ContentType, string> = {
  'blog-post': 'content/blog',
  'comparison': 'content/comparison',
  'faq': 'content/faq',
};

export interface Post {
  slug: string;
  title: string;
  description: string;
  type: ContentType;
  date: string;
  content: string;
  targetKeywords: string[];
}

export async function getAllPosts(type: ContentType): Promise<Post[]> {
  const dir = path.join(process.cwd(), TYPE_TO_DIR[type]);
  let filenames: string[];
  try {
    filenames = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch (error) {
    console.debug('[templates] post directory read failed:', error);
    return [];
  }

  const posts: Post[] = [];
  for (const filename of filenames) {
    const slug = filename.replace(/\\.md$/, '');
    const post = await getPostBySlug(type, slug);
    if (post) posts.push(post);
  }

  posts.sort((a, b) => (a.date > b.date ? -1 : 1));
  return posts;
}

export async function getPostBySlug(type: ContentType, slug: string): Promise<Post | null> {
  const dir = path.join(process.cwd(), TYPE_TO_DIR[type]);
  const filePath = path.join(dir, slug + '.md');

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.debug('[templates] post file read failed:', error);
    return null;
  }

  const { data, content: md } = matter(raw);
  const result = await remark().use(html).process(md);

  return {
    slug,
    title: (data.title as string) || slug,
    description: (data.description as string) || '',
    type,
    date: (data.date as string) || '',
    content: result.toString(),
    targetKeywords: (data.targetKeywords as string[]) || [],
  };
}
`;

const MARKDOWN_RENDERER_TSX = `'use client';

export default function MarkdownRenderer({ html }: { html: string }) {
  return (
    <div
      className="prose prose-invert max-w-none
        [&_h1]:text-text [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-4
        [&_h2]:text-text [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3
        [&_h3]:text-text [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2
        [&_p]:text-text-secondary [&_p]:leading-relaxed [&_p]:mb-4
        [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
        [&_ul]:text-text-secondary [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4
        [&_ol]:text-text-secondary [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4
        [&_li]:mb-1
        [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-text-muted
        [&_code]:bg-background-elevated [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm
        [&_pre]:bg-background-elevated [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto
        [&_img]:rounded-lg [&_img]:my-4
        [&_hr]:border-border [&_hr]:my-8
        [&_table]:w-full [&_table]:border-collapse
        [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:bg-background-elevated
        [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
`;

const JSONLD_TSX = `export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
`;

const ROBOTS_TS = `import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
  };
}
`;

const SIGNUP_ROUTE_TS = `import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = body.email;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const siteId = process.env.SITE_ID || 'unknown';
    const ip = request.headers.get('x-forwarded-for') || 'unknown';

    await redis.rpush(\`email_signups:\${siteId}\`, JSON.stringify({ email, ip, timestamp: new Date().toISOString() }));
    await redis.incr(\`email_signups_count:\${siteId}\`);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to save signup' }, { status: 500 });
  }
}
`;

// ---------------------------------------------------------------------------
// Template functions — brand values interpolated
// ---------------------------------------------------------------------------

function renderGlobalsCss(brand: BrandIdentity): string {
  return `@import "tailwindcss";

@theme {
  --color-primary: ${brand.colors.primary};
  --color-primary-light: ${brand.colors.primaryLight};
  --color-background: ${brand.colors.background};
  --color-background-elevated: ${brand.colors.backgroundElevated};
  --color-text: ${brand.colors.text};
  --color-text-secondary: ${brand.colors.textSecondary};
  --color-text-muted: ${brand.colors.textMuted};
  --color-accent: ${brand.colors.accent};
  --color-border: ${brand.colors.border};
}

body {
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: '${brand.fonts.body}', system-ui, sans-serif;
}

h1, h2, h3, h4, h5, h6 {
  font-family: '${brand.fonts.heading}', system-ui, sans-serif;
}

code, pre {
  font-family: '${brand.fonts.mono}', ui-monospace, monospace;
}
`;
}

function renderLayout(brand: BrandIdentity, pageSpec?: PageSpec): string {
  const fontsUrl = googleFontsUrl(brand);
  const siteName = esc(brand.siteName);
  const tagline = esc(brand.tagline);
  const seoDesc = pageSpec ? esc(pageSpec.metaDescription) : esc((brand as any).seoDescription || '');

  return `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: \`${siteName} — ${tagline}\`,
  description: \`${seoDesc}\`,
  openGraph: {
    title: \`${siteName} — ${tagline}\`,
    description: \`${seoDesc}\`,
    type: 'website',
    siteName: \`${siteName}\`,
  },
  twitter: {
    card: 'summary_large_image',
    title: \`${siteName} — ${tagline}\`,
    description: \`${seoDesc}\`,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="${fontsUrl}" rel="stylesheet" />
      </head>
      <body className="bg-background text-text min-h-screen flex flex-col">
        {children}
      </body>
    </html>
  );
}
`;
}

function renderSitemap(brand: BrandIdentity): string {
  const siteUrl = brand.siteUrl || `https://${brand.siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.vercel.app`;
  return `import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = '${esc(siteUrl)}';
  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: \`\${baseUrl}/blog\`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: \`\${baseUrl}/compare\`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: \`\${baseUrl}/faq\`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
  ];
}
`;
}

function renderBlogListing(brand: BrandIdentity): string {
  const siteName = esc(brand.siteName);
  return `import { getAllPosts } from '../../lib/content';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: \`Blog — ${siteName}\`,
  description: \`Latest articles, tips, and guides from ${siteName}.\`,
};

export default async function BlogPage() {
  const posts = await getAllPosts('blog-post');

  return (
    <>
${navFragment(brand)}
      <main className="flex-1 mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold text-text mb-2">Blog</h1>
        <p className="text-text-secondary mb-8">Latest articles and guides from ${siteName}.</p>

        {posts.length === 0 ? (
          <div className="bg-background-elevated border border-border rounded-xl p-8 text-center">
            <p className="text-text-muted">No posts yet. Check back soon!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <a
                key={post.slug}
                href={\`/blog/\${post.slug}\`}
                className="block bg-background-elevated border border-border rounded-xl p-6 hover:border-primary transition-colors"
              >
                <h2 className="text-xl font-semibold text-text mb-1">{post.title}</h2>
                <p className="text-text-muted text-sm mb-2">{post.date}</p>
                <p className="text-text-secondary text-sm">{post.description}</p>
              </a>
            ))}
          </div>
        )}
      </main>
${footerFragment(brand)}
    </>
  );
}
`;
}

function renderBlogDetail(brand: BrandIdentity): string {
  const siteName = esc(brand.siteName);
  return `import { getAllPosts, getPostBySlug } from '../../../lib/content';
import MarkdownRenderer from '../../../components/content/MarkdownRenderer';
import JsonLd from '../../../components/content/JsonLd';
import type { Metadata } from 'next';

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const posts = await getAllPosts('blog-post');
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug('blog-post', slug);
  if (!post) return {};
  return {
    title: \`\${post.title} | ${siteName}\`,
    description: post.description,
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPostBySlug('blog-post', slug);
  if (!post) return <div className="p-12 text-center text-text-muted">Post not found.</div>;

  return (
    <>
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        author: { '@type': 'Organization', name: '${siteName}' },
      }} />
${navFragment(brand)}
      <main className="flex-1 mx-auto max-w-3xl px-6 py-12">
        <a href="/blog" className="text-primary text-sm mb-4 inline-block hover:underline">&larr; Back to Blog</a>
        <h1 className="text-3xl font-bold text-text mb-2">{post.title}</h1>
        {post.date && <p className="text-text-muted text-sm mb-8">{post.date}</p>}
        <MarkdownRenderer html={post.content} />
      </main>
${footerFragment(brand)}
    </>
  );
}
`;
}

function renderCompareDetail(brand: BrandIdentity): string {
  const siteName = esc(brand.siteName);
  return `import { getAllPosts, getPostBySlug } from '../../../lib/content';
import MarkdownRenderer from '../../../components/content/MarkdownRenderer';
import JsonLd from '../../../components/content/JsonLd';
import type { Metadata } from 'next';

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const posts = await getAllPosts('comparison');
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug('comparison', slug);
  if (!post) return {};
  return {
    title: \`\${post.title} | ${siteName}\`,
    description: post.description,
  };
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const post = await getPostBySlug('comparison', slug);
  if (!post) return <div className="p-12 text-center text-text-muted">Comparison not found.</div>;

  return (
    <>
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        author: { '@type': 'Organization', name: '${siteName}' },
      }} />
${navFragment(brand)}
      <main className="flex-1 mx-auto max-w-3xl px-6 py-12">
        <a href="/compare" className="text-primary text-sm mb-4 inline-block hover:underline">&larr; Back to Comparisons</a>
        <h1 className="text-3xl font-bold text-text mb-2">{post.title}</h1>
        {post.date && <p className="text-text-muted text-sm mb-8">{post.date}</p>}
        <MarkdownRenderer html={post.content} />
      </main>
${footerFragment(brand)}
    </>
  );
}
`;
}

function renderCompareListing(brand: BrandIdentity): string {
  const siteName = esc(brand.siteName);
  return `import { getAllPosts } from '../../lib/content';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: \`Comparisons — ${siteName}\`,
  description: \`Side-by-side comparisons to help you choose the right solution.\`,
};

export default async function ComparisonsPage() {
  const posts = await getAllPosts('comparison');

  return (
    <>
${navFragment(brand)}
      <main className="flex-1 mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold text-text mb-2">Comparisons</h1>
        <p className="text-text-secondary mb-8">Side-by-side comparisons to help you make the right choice.</p>

        {posts.length === 0 ? (
          <div className="bg-background-elevated border border-border rounded-xl p-8 text-center">
            <p className="text-text-muted">No comparisons yet. Check back soon!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <a
                key={post.slug}
                href={\`/compare/\${post.slug}\`}
                className="block bg-background-elevated border border-border rounded-xl p-6 hover:border-primary transition-colors"
              >
                <h2 className="text-xl font-semibold text-text mb-1">{post.title}</h2>
                <p className="text-text-muted text-sm mb-2">{post.date}</p>
                <p className="text-text-secondary text-sm">{post.description}</p>
              </a>
            ))}
          </div>
        )}
      </main>
${footerFragment(brand)}
    </>
  );
}
`;
}

function renderFaqDetail(brand: BrandIdentity): string {
  const siteName = esc(brand.siteName);
  return `import { getAllPosts, getPostBySlug } from '../../../lib/content';
import MarkdownRenderer from '../../../components/content/MarkdownRenderer';
import JsonLd from '../../../components/content/JsonLd';
import type { Metadata } from 'next';

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const posts = await getAllPosts('faq');
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug('faq', slug);
  if (!post) return {};
  return {
    title: \`\${post.title} | ${siteName}\`,
    description: post.description,
  };
}

export default async function FaqDetailPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPostBySlug('faq', slug);
  if (!post) return <div className="p-12 text-center text-text-muted">FAQ not found.</div>;

  return (
    <>
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [{
          '@type': 'Question',
          name: post.title,
          acceptedAnswer: { '@type': 'Answer', text: post.description },
        }],
      }} />
${navFragment(brand)}
      <main className="flex-1 mx-auto max-w-3xl px-6 py-12">
        <a href="/faq" className="text-primary text-sm mb-4 inline-block hover:underline">&larr; Back to FAQ</a>
        <h1 className="text-3xl font-bold text-text mb-2">{post.title}</h1>
        <MarkdownRenderer html={post.content} />
      </main>
${footerFragment(brand)}
    </>
  );
}
`;
}

function renderFaqListing(brand: BrandIdentity): string {
  const siteName = esc(brand.siteName);
  return `import { getAllPosts } from '../../lib/content';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: \`FAQ — ${siteName}\`,
  description: \`Frequently asked questions about ${siteName}.\`,
};

export default async function FaqPage() {
  const posts = await getAllPosts('faq');

  return (
    <>
${navFragment(brand)}
      <main className="flex-1 mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold text-text mb-2">Frequently Asked Questions</h1>
        <p className="text-text-secondary mb-8">Find answers to common questions about ${siteName}.</p>

        {posts.length === 0 ? (
          <div className="bg-background-elevated border border-border rounded-xl p-8 text-center">
            <p className="text-text-muted">No FAQ articles yet. Check back soon!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <a
                key={post.slug}
                href={\`/faq/\${post.slug}\`}
                className="block bg-background-elevated border border-border rounded-xl p-6 hover:border-primary transition-colors"
              >
                <h2 className="text-xl font-semibold text-text mb-1">{post.title}</h2>
                <p className="text-text-secondary text-sm">{post.description}</p>
              </a>
            ))}
          </div>
        )}
      </main>
${footerFragment(brand)}
    </>
  );
}
`;
}

// ---------------------------------------------------------------------------
// PageSpec-driven assembly
// ---------------------------------------------------------------------------

export function assembleFromSpec(
  pageSpec: PageSpec,
  brand: BrandIdentity,
): Record<string, string> {
  const missing = getMissingSectionTypes(pageSpec.sections);
  if (missing.length > 0) {
    throw new Error(`Cannot assemble: missing section types: ${missing.join(', ')}`);
  }

  return {
    'package.json': PACKAGE_JSON,
    'tsconfig.json': TSCONFIG_JSON,
    'next.config.ts': NEXT_CONFIG_TS,
    'postcss.config.mjs': POSTCSS_CONFIG_MJS,
    '.gitignore': GITIGNORE,
    'lib/content.ts': LIB_CONTENT_TS,
    'components/content/MarkdownRenderer.tsx': MARKDOWN_RENDERER_TSX,
    'components/content/JsonLd.tsx': JSONLD_TSX,
    'app/globals.css': renderGlobalsCss(brand),
    'app/layout.tsx': renderLayout(brand, pageSpec),
    'app/page.tsx': renderLandingPageFromSpec(pageSpec, brand),
    'app/robots.ts': ROBOTS_TS,
    'app/sitemap.ts': renderSitemap(brand),
    'app/api/signup/route.ts': SIGNUP_ROUTE_TS,
    'app/blog/page.tsx': renderBlogListing(brand),
    'app/blog/[slug]/page.tsx': renderBlogDetail(brand),
    'app/compare/page.tsx': renderCompareListing(brand),
    'app/compare/[slug]/page.tsx': renderCompareDetail(brand),
    'app/faq/page.tsx': renderFaqListing(brand),
    'app/faq/[slug]/page.tsx': renderFaqDetail(brand),
    'content/blog/.gitkeep': '',
    'content/comparison/.gitkeep': '',
    'content/faq/.gitkeep': '',
    'public/google8016c4ca2d4b4091.html': 'google-site-verification: google8016c4ca2d4b4091.html',
  };
}
