# Blog Setup for EPCH Content Publishing

Instructions for setting up a blog page that can receive automated content from the EPCH Project Research platform.

---

## Overview

EPCH publishes content by committing markdown files directly to your GitHub repository. Your site must:

1. Have a GitHub repo with write access for the EPCH service account
2. Store content as markdown files with YAML frontmatter
3. Have a content loading system that reads these markdown files
4. Support three content types: `blog-post`, `comparison`, `faq`

---

## Directory Structure

Create these directories in your repo:

```
content/
├── blog/           # blog-post content type
│   ├── post-slug.md
│   └── another-post.md
├── comparison/     # comparison content type
│   └── tool-a-vs-tool-b.md
└── faq/            # faq content type
    └── topic-faq.md
```

EPCH commits files to these paths:
- `blog-post` → `content/blog/{slug}.md`
- `comparison` → `content/comparison/{slug}.md`
- `faq` → `content/faq/{slug}.md`

---

## Markdown Frontmatter Schema

Each published file has this frontmatter structure:

```yaml
---
title: "Full Title of the Post"
type: blog-post                    # or: comparison, faq
targetKeywords: ["primary keyword", "secondary keyword"]
contentGap: "What gap this content fills"
date: "2026-02-20T12:00:00.000Z"   # ISO timestamp (publish date)
ideaName: "Project Name"
status: published                   # always "published" when pushed
wordCount: 2500
canonicalUrl: "https://yoursite.com/blog/post-slug"
---

# Markdown content starts here...
```

### Required Fields Your Content Loader Should Handle

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Display title for the post |
| `type` | string | One of: `blog-post`, `comparison`, `faq` |
| `date` | string | ISO timestamp for sorting/display |
| `status` | string | Will be `published` |
| `canonicalUrl` | string | Full URL for SEO |

### Optional Fields (for your use)

| Field | Type | Description |
|-------|------|-------------|
| `targetKeywords` | string[] | SEO keywords (for internal tracking) |
| `contentGap` | string | What content gap this fills |
| `ideaName` | string | Source project name |
| `wordCount` | number | Approximate word count |

---

## Content Loading Implementation

### Next.js App Router Example

```typescript
// lib/content.ts
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  content: string;
  type: 'blog-post' | 'comparison' | 'faq';
  canonicalUrl?: string;
}

export function getAllPosts(contentType: 'blog' | 'comparison' | 'faq'): BlogPost[] {
  const dir = path.join(process.cwd(), 'content', contentType);

  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

  return files
    .map(filename => {
      const slug = filename.replace('.md', '');
      const filePath = path.join(dir, filename);
      const fileContents = fs.readFileSync(filePath, 'utf8');
      const { data, content } = matter(fileContents);

      return {
        slug,
        title: data.title,
        date: data.date,
        content,
        type: data.type,
        canonicalUrl: data.canonicalUrl,
      };
    })
    .filter(post => post.title) // Skip invalid files
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostBySlug(contentType: string, slug: string): BlogPost | null {
  const filePath = path.join(process.cwd(), 'content', contentType, `${slug}.md`);

  if (!fs.existsSync(filePath)) return null;

  const fileContents = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(fileContents);

  return {
    slug,
    title: data.title,
    date: data.date,
    content,
    type: data.type,
    canonicalUrl: data.canonicalUrl,
  };
}
```

### Blog Index Page

```typescript
// app/blog/page.tsx
import { getAllPosts } from '@/lib/content';
import Link from 'next/link';

export default function BlogPage() {
  const posts = getAllPosts('blog');

  return (
    <main>
      <h1>Blog</h1>
      <ul>
        {posts.map(post => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`}>
              {post.title}
            </Link>
            <time>{new Date(post.date).toLocaleDateString()}</time>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

### Individual Post Page

```typescript
// app/blog/[slug]/page.tsx
import { getPostBySlug, getAllPosts } from '@/lib/content';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

export async function generateStaticParams() {
  const posts = getAllPosts('blog');
  return posts.map(post => ({ slug: post.slug }));
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug('blog', slug);

  if (!post) notFound();

  return (
    <article>
      <h1>{post.title}</h1>
      <time>{new Date(post.date).toLocaleDateString()}</time>
      <ReactMarkdown>{post.content}</ReactMarkdown>
    </article>
  );
}
```

---

## URL Structure

EPCH expects these URL patterns (used for canonical URLs and GSC tracking):

| Content Type | URL Pattern |
|--------------|-------------|
| blog-post | `/blog/{slug}` |
| comparison | `/compare/{slug}` |
| faq | `/faq/{slug}` |

If your site uses different paths, let us know and we'll update the EPCH publish target configuration.

---

## GitHub Access

EPCH needs write access to push content. Two options:

### Option A: Add EPCH as Collaborator
Add `cwhogg` as a collaborator with write access to your repo.

### Option B: Use a Shared GitHub Token
If the repo is under a shared org, ensure the `GITHUB_TOKEN` used by EPCH has repo write permissions.

---

## Registering as a Publish Target

Once your blog is set up, register it in EPCH by adding to `src/lib/publish-targets.ts`:

```typescript
'your-site-id': {
  id: 'your-site-id',
  repoOwner: 'your-github-username',
  repoName: 'your-repo-name',
  branch: 'main',
  siteUrl: 'https://yoursite.com',
  pathMap: {
    'blog-post': 'content/blog',
    'comparison': 'content/comparison',
    'faq': 'content/faq',
  },
},
```

Or, if this is a painted door site created by EPCH, it will auto-register as a dynamic publish target.

---

## Dependencies

Your Next.js project needs:

```bash
npm install gray-matter react-markdown
```

For syntax highlighting in code blocks:
```bash
npm install rehype-highlight
```

---

## Testing the Integration

1. Create a test markdown file manually in `content/blog/test-post.md`
2. Verify it appears on your `/blog` page
3. Once confirmed, EPCH can publish real content

---

## Vercel Deployment Notes

- Ensure your Vercel project auto-deploys on GitHub push
- Content pushed by EPCH triggers a new deployment automatically
- First deploy after content push takes 30-60 seconds

---

## Questions?

If your blog structure differs from this spec (different paths, frontmatter fields, etc.), document the differences and we'll adapt the EPCH publish pipeline.
