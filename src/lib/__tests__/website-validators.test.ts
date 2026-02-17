import { describe, it, expect } from 'vitest';
import {
  checkLayoutMetadata,
  checkH1Count,
  checkSemanticHtml,
  checkTailwindImport,
  checkThemeColors,
  checkPostcssConfig,
  checkUseClientDirectives,
  checkRemovedNextJsApis,
  checkAsyncParams,
  checkPackageJson,
  checkBrokenLinks,
} from '../agent-tools/website';

// Helper to build allFiles with defaults
function files(overrides: Record<string, string> = {}): Record<string, string> {
  return overrides;
}

describe('checkLayoutMetadata', () => {
  it('returns no issues when layout has all metadata', () => {
    const allFiles = files({
      'app/layout.tsx': `
        export const metadata = {
          title: 'Test',
          description: 'A test site',
          openGraph: { title: 'Test' },
          twitter: { card: 'summary' },
        };
      `,
    });
    const result = checkLayoutMetadata(allFiles);
    expect(result.issues).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
  });

  it('reports missing OG tags', () => {
    const allFiles = files({
      'app/layout.tsx': `
        export const metadata = {
          title: 'Test',
          description: 'A test site',
          twitter: { card: 'summary' },
        };
      `,
    });
    const result = checkLayoutMetadata(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining('Open Graph'));
  });

  it('reports missing Twitter card', () => {
    const allFiles = files({
      'app/layout.tsx': `
        export const metadata = {
          title: 'Test',
          description: 'A test site',
          openGraph: { title: 'Test' },
        };
      `,
    });
    const result = checkLayoutMetadata(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining('Twitter'));
  });

  it('reports missing description', () => {
    const allFiles = files({
      'app/layout.tsx': `
        export const metadata = {
          title: 'Test',
          openGraph: { title: 'Test' },
          twitter: { card: 'summary' },
        };
      `,
    });
    const result = checkLayoutMetadata(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining('description'));
  });

  it('returns no issues when layout.tsx is absent', () => {
    const result = checkLayoutMetadata(files());
    expect(result.issues).toHaveLength(0);
  });
});

describe('checkH1Count', () => {
  it('returns no issues with exactly one H1', () => {
    const allFiles = files({
      'app/page.tsx': '<h1>Hello</h1>',
    });
    const result = checkH1Count(allFiles);
    expect(result.issues).toHaveLength(0);
  });

  it('reports missing H1', () => {
    const allFiles = files({
      'app/page.tsx': '<h2>Hello</h2>',
    });
    const result = checkH1Count(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining('No <h1>'));
  });

  it('reports multiple H1 tags', () => {
    const allFiles = files({
      'app/page.tsx': '<h1>First</h1><h1>Second</h1>',
    });
    const result = checkH1Count(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining('2 <h1> tags'));
  });

  it('returns no issues when page.tsx is absent', () => {
    const result = checkH1Count(files());
    expect(result.issues).toHaveLength(0);
  });
});

describe('checkSemanticHtml', () => {
  it('returns no issues with main and section', () => {
    const allFiles = files({
      'app/page.tsx': '<main><section>Content</section></main>',
    });
    const result = checkSemanticHtml(allFiles);
    expect(result.issues).toHaveLength(0);
  });

  it('reports missing main element', () => {
    const allFiles = files({
      'app/page.tsx': '<div><section>Content</section></div>',
    });
    const result = checkSemanticHtml(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining('<main>'));
  });

  it('reports missing section element', () => {
    const allFiles = files({
      'app/page.tsx': '<main><div>Content</div></main>',
    });
    const result = checkSemanticHtml(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining('<section>'));
  });

  it('returns no issues when page.tsx is absent', () => {
    const result = checkSemanticHtml(files());
    expect(result.issues).toHaveLength(0);
  });
});

describe('checkTailwindImport', () => {
  it('returns no issues with correct Tailwind v4 import', () => {
    const allFiles = files({
      'app/globals.css': '@import "tailwindcss";',
    });
    const result = checkTailwindImport(allFiles);
    expect(result.issues).toHaveLength(0);
  });

  it('reports @tailwind directives (v3 syntax)', () => {
    const allFiles = files({
      'app/globals.css': '@tailwind base;\n@tailwind components;\n@tailwind utilities;',
    });
    const result = checkTailwindImport(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining('@tailwind'));
  });

  it('reports missing Tailwind import entirely', () => {
    const allFiles = files({
      'app/globals.css': 'body { margin: 0; }',
    });
    const result = checkTailwindImport(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining('Missing Tailwind v4'));
  });

  it('returns no issues when globals.css is absent', () => {
    const result = checkTailwindImport(files());
    expect(result.issues).toHaveLength(0);
  });
});

describe('checkThemeColors', () => {
  it('returns no issues when custom colors are in @theme', () => {
    const allFiles = files({
      'app/globals.css': `
        @theme {
          --color-primary: #ff0000;
        }
        .foo { @apply bg-primary; }
      `,
    });
    const result = checkThemeColors(allFiles);
    expect(result.issues).toHaveLength(0);
  });

  it('reports @apply with unregistered custom color', () => {
    const allFiles = files({
      'app/globals.css': `
        .foo { @apply bg-brand; }
      `,
    });
    const result = checkThemeColors(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining('brand'));
  });

  it('allows built-in colors without @theme', () => {
    const allFiles = files({
      'app/globals.css': `
        .foo { @apply bg-blue-500; }
      `,
    });
    const result = checkThemeColors(allFiles);
    expect(result.issues).toHaveLength(0);
  });

  it('reports :root colors without @theme block', () => {
    const allFiles = files({
      'app/globals.css': `
        :root {
          --color-primary: #ff0000;
        }
      `,
    });
    const result = checkThemeColors(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining(':root'));
  });

  it('returns no issues when globals.css is absent', () => {
    const result = checkThemeColors(files());
    expect(result.issues).toHaveLength(0);
  });
});

describe('checkPostcssConfig', () => {
  it('returns no issues with correct postcss config', () => {
    const allFiles = files({
      'postcss.config.mjs': `export default { plugins: { '@tailwindcss/postcss': {} } };`,
    });
    const result = checkPostcssConfig(allFiles);
    expect(result.issues).toHaveLength(0);
  });

  it('reports missing postcss config', () => {
    const result = checkPostcssConfig(files());
    expect(result.issues).toContainEqual(expect.stringContaining('Missing postcss'));
  });

  it('reports missing @tailwindcss/postcss plugin', () => {
    const allFiles = files({
      'postcss.config.mjs': `export default { plugins: {} };`,
    });
    const result = checkPostcssConfig(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining('@tailwindcss/postcss'));
  });

  it('accepts postcss.config.js as alternative', () => {
    const allFiles = files({
      'postcss.config.js': `module.exports = { plugins: { '@tailwindcss/postcss': {} } };`,
    });
    const result = checkPostcssConfig(allFiles);
    expect(result.issues).toHaveLength(0);
  });
});

describe('checkUseClientDirectives', () => {
  it('returns no issues when use client is present', () => {
    const allFiles = files({
      'app/components/form.tsx': `'use client';\nimport { useState } from 'react';\nexport default function Form() { const [x, setX] = useState(0); }`,
    });
    const result = checkUseClientDirectives(allFiles);
    expect(result.issues).toHaveLength(0);
  });

  it('reports missing use client with hooks', () => {
    const allFiles = files({
      'app/components/form.tsx': `import { useState } from 'react';\nexport default function Form() { const [x, setX] = useState(0); }`,
    });
    const result = checkUseClientDirectives(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining("'use client'"));
  });

  it('skips route.ts files', () => {
    const allFiles = files({
      'app/api/route.ts': `import { NextRequest } from 'next/server';\nexport function POST(req: NextRequest) { const onChange = () => {}; }`,
    });
    const result = checkUseClientDirectives(allFiles);
    expect(result.issues).toHaveLength(0);
  });

  it('skips non-tsx/ts files', () => {
    const allFiles = files({
      'app/globals.css': 'body { color: red; }',
    });
    const result = checkUseClientDirectives(allFiles);
    expect(result.issues).toHaveLength(0);
  });

  it('returns no issues for empty file set', () => {
    const result = checkUseClientDirectives(files());
    expect(result.issues).toHaveLength(0);
  });
});

describe('checkRemovedNextJsApis', () => {
  it('returns no issues when no removed APIs are used', () => {
    const allFiles = files({
      'app/api/route.ts': `export function GET(req: NextRequest) { return new Response('ok'); }`,
    });
    const result = checkRemovedNextJsApis(allFiles);
    expect(result.issues).toHaveLength(0);
  });

  it('reports request.ip usage', () => {
    const allFiles = files({
      'app/api/route.ts': `export function GET(req: NextRequest) { const ip = request.ip; }`,
    });
    const result = checkRemovedNextJsApis(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining('request.ip'));
  });

  it('reports req.ip usage', () => {
    const allFiles = files({
      'app/api/route.ts': `export function GET(req: NextRequest) { const ip = req.ip; }`,
    });
    const result = checkRemovedNextJsApis(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining('request.ip'));
  });

  it('returns no issues for empty file set', () => {
    const result = checkRemovedNextJsApis(files());
    expect(result.issues).toHaveLength(0);
  });
});

describe('checkAsyncParams', () => {
  it('returns no issues with async params pattern', () => {
    const allFiles = files({
      'app/blog/[slug]/page.tsx': `type Props = { params: Promise<{ slug: string }> };\nexport default async function Page({ params }: Props) {}`,
    });
    const result = checkAsyncParams(allFiles);
    expect(result.issues).toHaveLength(0);
  });

  it('reports sync params pattern in dynamic routes', () => {
    const allFiles = files({
      'app/blog/[slug]/page.tsx': `export default function Page({ params: { slug } }: { params: { slug: string } }) {}`,
    });
    const result = checkAsyncParams(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining('sync params'));
  });

  it('skips non-dynamic route pages', () => {
    const allFiles = files({
      'app/about/page.tsx': `export default function Page({ params: { slug } }: { params: { slug: string } }) {}`,
    });
    const result = checkAsyncParams(allFiles);
    expect(result.issues).toHaveLength(0);
  });

  it('returns no issues for empty file set', () => {
    const result = checkAsyncParams(files());
    expect(result.issues).toHaveLength(0);
  });
});

describe('checkPackageJson', () => {
  it('returns no issues with all required deps', () => {
    const allFiles = files({
      'package.json': JSON.stringify({
        dependencies: {
          next: '^15.0.0',
          react: '^19.0.0',
          '@upstash/redis': '^1.0.0',
          'gray-matter': '^4.0.0',
          tailwindcss: '^4.0.0',
        },
      }),
    });
    const result = checkPackageJson(allFiles);
    expect(result.issues).toHaveLength(0);
  });

  it('reports missing package.json', () => {
    const result = checkPackageJson(files());
    expect(result.issues).toContainEqual(expect.stringContaining('Missing package.json'));
  });

  it('reports missing required dependencies', () => {
    const allFiles = files({
      'package.json': JSON.stringify({
        dependencies: { next: '^15.0.0' },
      }),
    });
    const result = checkPackageJson(allFiles);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues).toContainEqual(expect.stringContaining('react'));
  });
});

describe('checkBrokenLinks', () => {
  it('returns no issues when all links resolve', () => {
    const allFiles = files({
      'app/page.tsx': '<a href="/">Home</a><a href="/blog">Blog</a>',
      'app/blog/page.tsx': '<h1>Blog</h1>',
    });
    const result = checkBrokenLinks(allFiles);
    expect(result.issues).toHaveLength(0);
  });

  it('reports broken internal links', () => {
    const allFiles = files({
      'app/page.tsx': '<a href="/about">About</a>',
    });
    const result = checkBrokenLinks(allFiles);
    expect(result.issues).toContainEqual(expect.stringContaining('/about'));
  });

  it('allows links covered by dynamic routes', () => {
    const allFiles = files({
      'app/page.tsx': '<a href="/blog/my-post">Post</a>',
      'app/blog/[slug]/page.tsx': '<h1>Blog Post</h1>',
      'content/blog/my-post.md': '---\ntitle: My Post\n---',
    });
    const result = checkBrokenLinks(allFiles);
    expect(result.issues).toHaveLength(0);
  });

  it('allows anchor links (/#section)', () => {
    const allFiles = files({
      'app/page.tsx': '<a href="/#features">Features</a>',
    });
    const result = checkBrokenLinks(allFiles);
    expect(result.issues).toHaveLength(0);
  });

  it('returns no issues for empty file set', () => {
    const result = checkBrokenLinks(files());
    expect(result.issues).toHaveLength(0);
  });
});
