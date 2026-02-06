import { describe, it, expect } from 'vitest';
import { enrichFrontmatter, flipDraftToPublished, getFilename } from '../github-publish';
import type { ContentType } from '@/types';

describe('flipDraftToPublished', () => {
  it('replaces status: draft with status: published', () => {
    const md = `---
title: "Test Post"
status: draft
---
# Content`;
    expect(flipDraftToPublished(md)).toContain('status: published');
    expect(flipDraftToPublished(md)).not.toContain('status: draft');
  });

  it('leaves already-published content unchanged', () => {
    const md = `---
status: published
---`;
    expect(flipDraftToPublished(md)).toContain('status: published');
  });

  it('does not touch non-status draft mentions', () => {
    const md = `---
status: draft
---
# Draft ideas for the future`;
    const result = flipDraftToPublished(md);
    expect(result).toContain('Draft ideas');
    expect(result).toContain('status: published');
  });
});

describe('enrichFrontmatter', () => {
  const target = {
    id: 'test',
    repoOwner: 'owner',
    repoName: 'repo',
    branch: 'main',
    siteUrl: 'https://example.com',
  } as any;

  it('adds canonicalUrl to frontmatter', () => {
    const md = `---
title: "Test"
generatedAt: "2026-01-01T00:00:00Z"
---
# Content`;
    const result = enrichFrontmatter(md, target, 'blog-post', 'test-slug');
    expect(result).toContain('canonicalUrl: "https://example.com/blog/test-slug"');
  });

  it('replaces generatedAt with date', () => {
    const md = `---
title: "Test"
generatedAt: "2026-01-01T00:00:00Z"
---`;
    const result = enrichFrontmatter(md, target, 'blog-post', 'test-slug');
    expect(result).toContain('date: "');
    expect(result).not.toContain('generatedAt:');
  });

  it('uses /compare path for comparison type', () => {
    const md = `---
title: "Test"
generatedAt: "2026-01-01T00:00:00Z"
---`;
    const result = enrichFrontmatter(md, target, 'comparison', 'x-vs-y');
    expect(result).toContain('canonicalUrl: "https://example.com/compare/x-vs-y"');
  });

  it('uses /faq path for faq type', () => {
    const md = `---
title: "Test"
generatedAt: "2026-01-01T00:00:00Z"
---`;
    const result = enrichFrontmatter(md, target, 'faq', 'common-questions');
    expect(result).toContain('canonicalUrl: "https://example.com/faq/common-questions"');
  });
});

describe('getFilename', () => {
  it('returns slug.md', () => {
    expect(getFilename('blog-post' as ContentType, 'my-post')).toBe('my-post.md');
  });
});
