import Anthropic from '@anthropic-ai/sdk';
import type { ToolDefinition, BrandIdentity, PaintedDoorSite, ProductIdea, Evaluation } from '@/types';
import { ContentContext } from '@/lib/content-prompts';
import { buildContentContext, generateContentCalendar } from '@/lib/content-agent';
import { detectVertical } from '@/lib/seo-knowledge';
import { getIdeaFromDb } from '@/lib/db';
import {
  buildBrandIdentityPrompt,
  buildCoreFilesPrompt,
  buildContentPagesPrompt,
} from '@/lib/painted-door-prompts';
import {
  savePaintedDoorSite,
  saveDynamicPublishTarget,
  getPaintedDoorSite,
} from '@/lib/painted-door-db';
import { PublishTarget } from '@/lib/publish-targets';
import { checkMetaDescription, combineEvaluations } from './common';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// ---------------------------------------------------------------------------
// JSON parsing helper (same as painted-door-agent.ts)
// ---------------------------------------------------------------------------

function parseJsonResponse(text: string): unknown {
  let jsonStr = text.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('Failed to parse JSON from LLM response');
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ---------------------------------------------------------------------------
// GitHub API helpers (extracted from painted-door-agent.ts)
// ---------------------------------------------------------------------------

async function createGitHubRepo(
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

async function triggerDeployViaGitPush(
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

// ---------------------------------------------------------------------------
// Create all tools for the website (painted door) agent
// ---------------------------------------------------------------------------

export function createWebsiteTools(ideaId: string): ToolDefinition[] {
  // Shared mutable state across tool calls within a single run
  let idea: ProductIdea | null = null;
  let ctx: ContentContext | null = null;
  let brand: BrandIdentity | null = null;
  let coreFiles: Record<string, string> = {};
  let contentFiles: Record<string, string> = {};
  let allFiles: Record<string, string> = {};
  let siteSlug = '';
  let siteId = '';
  let repo: { owner: string; name: string; url: string } | null = null;
  let vercelProjectId = '';
  let siteUrl = '';

  return [
    // -----------------------------------------------------------------------
    // Load idea and analysis context
    // -----------------------------------------------------------------------
    {
      name: 'get_idea_context',
      description:
        'Load the product idea, analysis context, and detect the vertical. Call this first.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        idea = await getIdeaFromDb(ideaId);
        if (!idea) return { error: 'Idea not found' };

        ctx = await buildContentContext(ideaId);
        if (!ctx) return { error: 'No analysis context found — run research agent first' };

        const vertical = detectVertical(idea);
        siteSlug = slugify(idea.name);
        siteId = `pd-${siteSlug}`;

        return {
          ideaName: ctx.ideaName,
          description: ctx.ideaDescription,
          targetUser: ctx.targetUser,
          problemSolved: ctx.problemSolved,
          vertical,
          siteSlug,
          siteId,
          topKeywords: ctx.topKeywords.slice(0, 5).map((k) => k.keyword),
        };
      },
    },

    // -----------------------------------------------------------------------
    // Design brand identity
    // -----------------------------------------------------------------------
    {
      name: 'design_brand',
      description:
        'Generate the brand identity (colors, typography, voice, landing page copy) using an LLM. Requires get_idea_context to have been called first.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!idea || !ctx) return { error: 'Call get_idea_context first' };

        const prompt = buildBrandIdentityPrompt(idea, ctx);
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        brand = parseJsonResponse(text) as BrandIdentity;

        return {
          success: true,
          siteName: brand.siteName,
          tagline: brand.tagline,
          seoDescription: brand.seoDescription,
          heroHeadline: brand.landingPage.heroHeadline,
        };
      },
    },

    // -----------------------------------------------------------------------
    // Generate core files (layout, CSS, page, signup API, etc.)
    // -----------------------------------------------------------------------
    {
      name: 'generate_core_files',
      description:
        'Generate the core website files (layout, CSS, landing page, signup API, robots, sitemap, components). Requires design_brand to have been called first.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!brand || !idea || !ctx) return { error: 'Call design_brand first' };

        const prompt = buildCoreFilesPrompt(brand, idea, ctx);
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 16384,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const result = parseJsonResponse(text) as { files: Record<string, string> };
        coreFiles = result.files;

        // Validate expected files
        const expectedCore = ['app/layout.tsx', 'app/globals.css', 'app/page.tsx'];
        const missing = expectedCore.filter((f) => !coreFiles[f]);

        return {
          success: true,
          fileCount: Object.keys(coreFiles).length,
          files: Object.keys(coreFiles),
          missingExpected: missing.length > 0 ? missing : undefined,
          truncated: response.stop_reason === 'max_tokens',
        };
      },
    },

    // -----------------------------------------------------------------------
    // Generate content pages and config
    // -----------------------------------------------------------------------
    {
      name: 'generate_content_pages',
      description:
        'Generate content pages (blog, compare, FAQ routes), package.json, tsconfig, next.config, postcss config, and lib/content.ts. Requires generate_core_files to have been called first.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!brand || !idea || !ctx) return { error: 'Call generate_core_files first' };
        if (Object.keys(coreFiles).length === 0) return { error: 'No core files generated yet' };

        const prompt = buildContentPagesPrompt(
          brand,
          coreFiles['app/layout.tsx'] || '',
          coreFiles['app/globals.css'] || '',
          idea,
          ctx,
        );
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 12288,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const result = parseJsonResponse(text) as { files: Record<string, string> };
        contentFiles = result.files;

        // Merge all files
        allFiles = {
          ...coreFiles,
          ...contentFiles,
          'content/blog/.gitkeep': '',
          'content/comparison/.gitkeep': '',
          'content/faq/.gitkeep': '',
        };

        return {
          success: true,
          contentFileCount: Object.keys(contentFiles).length,
          totalFileCount: Object.keys(allFiles).length,
          files: Object.keys(contentFiles),
          truncated: response.stop_reason === 'max_tokens',
        };
      },
    },

    // -----------------------------------------------------------------------
    // Evaluate brand identity against SEO requirements
    // -----------------------------------------------------------------------
    {
      name: 'evaluate_brand',
      description:
        'Evaluate the generated brand identity against SEO requirements. Checks keyword placement in headlines, meta description length, and color contrast. Call this after design_brand to catch issues before code generation.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!brand || !ctx) return { error: 'Call design_brand first' };

        const evals: Evaluation[] = [];
        const primaryKeyword = ctx.topKeywords[0]?.keyword || '';

        // Check seoDescription
        if (primaryKeyword) {
          evals.push(checkMetaDescription(brand.seoDescription, primaryKeyword));
        }

        // Check heroHeadline contains primary keyword
        if (primaryKeyword) {
          const headlineLower = brand.landingPage.heroHeadline.toLowerCase();
          const kwLower = primaryKeyword.toLowerCase();
          const hasKeyword = headlineLower.includes(kwLower);
          evals.push({
            pass: hasKeyword,
            score: hasKeyword ? 10 : 3,
            issues: hasKeyword ? [] : [`Hero headline does not contain primary keyword "${primaryKeyword}"`],
            suggestions: hasKeyword ? [] : [`Rewrite headline to naturally include "${primaryKeyword}"`],
          });
        }

        // Check heroSubheadline includes at least one secondary keyword
        if (ctx.topKeywords.length > 1) {
          const subLower = brand.landingPage.heroSubheadline.toLowerCase();
          const secondaryHit = ctx.topKeywords.slice(1, 4).some(
            (k) => subLower.includes(k.keyword.toLowerCase()),
          );
          evals.push({
            pass: secondaryHit,
            score: secondaryHit ? 10 : 5,
            issues: secondaryHit ? [] : ['Hero subheadline does not contain any secondary keywords'],
            suggestions: secondaryHit ? [] : [`Incorporate one of: ${ctx.topKeywords.slice(1, 4).map((k) => `"${k.keyword}"`).join(', ')}`],
          });
        }

        // Check color contrast (basic: ensure text and background differ significantly)
        const hexToLuminance = (hex: string): number => {
          const rgb = hex.replace('#', '').match(/.{2}/g);
          if (!rgb || rgb.length < 3) return 0;
          const [r, g, b] = rgb.map((c) => {
            const v = parseInt(c, 16) / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const contrastRatio = (hex1: string, hex2: string): number => {
          const l1 = hexToLuminance(hex1);
          const l2 = hexToLuminance(hex2);
          const lighter = Math.max(l1, l2);
          const darker = Math.min(l1, l2);
          return (lighter + 0.05) / (darker + 0.05);
        };

        if (brand.colors.textPrimary && brand.colors.background) {
          const ratio = contrastRatio(brand.colors.textPrimary, brand.colors.background);
          const passes = ratio >= 4.5; // WCAG AA for normal text
          evals.push({
            pass: passes,
            score: passes ? 10 : Math.round(ratio),
            issues: passes ? [] : [`Text/background contrast ratio ${ratio.toFixed(1)}:1 is below WCAG AA minimum (4.5:1)`],
            suggestions: passes ? [] : ['Lighten text color or darken background for better readability'],
          });
        }

        // Check value props target different keywords
        const vpTitles = brand.landingPage.valueProps.map((vp) => vp.title.toLowerCase());
        const vpKeywordHits = ctx.topKeywords.slice(0, 6).filter(
          (k) => vpTitles.some((t) => t.includes(k.keyword.toLowerCase())),
        );
        evals.push({
          pass: vpKeywordHits.length >= 2,
          score: Math.min(10, vpKeywordHits.length * 3),
          issues: vpKeywordHits.length < 2 ? [`Only ${vpKeywordHits.length} value props incorporate target keywords`] : [],
          suggestions: vpKeywordHits.length < 2 ? ['Rewrite value prop titles to naturally include secondary keywords'] : [],
        });

        const combined = combineEvaluations(evals);

        return {
          ...combined,
          primaryKeyword,
          seoDescriptionLength: brand.seoDescription.length,
          headlineHasKeyword: evals[1]?.pass ?? null,
          valuePropsWithKeywords: vpKeywordHits.length,
        };
      },
    },

    // -----------------------------------------------------------------------
    // Validate generated code for common issues
    // -----------------------------------------------------------------------
    {
      name: 'validate_code',
      description:
        'Run lightweight validation checks on generated code files. Checks for: exactly one H1 per page, OG meta tags in layout, semantic HTML elements, correct Tailwind v4 syntax, and use client directives. Call this after generate_content_pages before pushing to GitHub.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (Object.keys(allFiles).length === 0) return { error: 'No files generated yet' };

        const issues: string[] = [];
        const suggestions: string[] = [];

        // Check layout.tsx for OG tags and meta description
        const layout = allFiles['app/layout.tsx'] || '';
        if (layout) {
          if (!layout.includes('openGraph') && !layout.includes('og:')) {
            issues.push('layout.tsx: Missing Open Graph metadata');
            suggestions.push('Add openGraph property to metadata export in layout.tsx');
          }
          if (!layout.includes('twitter') && !layout.includes('twitter:')) {
            issues.push('layout.tsx: Missing Twitter Card metadata');
            suggestions.push('Add twitter property to metadata export in layout.tsx');
          }
          if (!layout.includes('description')) {
            issues.push('layout.tsx: Missing meta description');
            suggestions.push('Add description to metadata export using seoDescription');
          }
        }

        // Check page.tsx for H1 and semantic HTML
        const page = allFiles['app/page.tsx'] || '';
        if (page) {
          const h1Matches = page.match(/<h1[\s>]/gi) || [];
          if (h1Matches.length === 0) {
            issues.push('page.tsx: No <h1> tag found');
            suggestions.push('Add exactly one <h1> containing the primary keyword');
          } else if (h1Matches.length > 1) {
            issues.push(`page.tsx: Found ${h1Matches.length} <h1> tags (should be exactly 1)`);
            suggestions.push('Convert extra <h1> tags to <h2>');
          }

          if (!page.includes('<main')) {
            issues.push('page.tsx: Missing <main> element');
            suggestions.push('Wrap page content in a <main> element');
          }
          if (!page.includes('<section')) {
            issues.push('page.tsx: No <section> elements found');
            suggestions.push('Wrap major content blocks in <section> elements with aria-label');
          }
        }

        // Check globals.css for Tailwind v4 syntax
        const css = allFiles['app/globals.css'] || '';
        if (css) {
          if (css.includes('@tailwind')) {
            issues.push('globals.css: Uses @tailwind directives (Tailwind v3 syntax)');
            suggestions.push('Replace @tailwind directives with @import "tailwindcss" (Tailwind v4)');
          }
          if (!css.includes('@import') && !css.includes('tailwindcss')) {
            issues.push('globals.css: Missing Tailwind v4 import');
            suggestions.push('Add @import "tailwindcss" at the top of globals.css');
          }

          // Check that custom colors are registered in @theme, not just :root
          const applyMatches = css.matchAll(/@apply\s+[^;]*\b(bg|text|border|ring|shadow|outline|decoration|from|to|via)-([\w-]+)/g);
          const builtinColors = new Set([
            'white', 'black', 'transparent', 'current', 'inherit',
            'slate', 'gray', 'zinc', 'neutral', 'stone',
            'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
            'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
          ]);
          const hasThemeBlock = css.includes('@theme');
          const themeColors = new Set<string>();
          if (hasThemeBlock) {
            const themeMatch = css.match(/@theme\s*\{([^}]*)\}/);
            if (themeMatch) {
              const colorVars = themeMatch[1].matchAll(/--color-([\w-]+)/g);
              for (const m of colorVars) themeColors.add(m[1]);
            }
          }

          for (const match of applyMatches) {
            const colorName = match[2].split('-')[0]; // handle bg-primary-500 → primary
            if (!builtinColors.has(colorName) && !themeColors.has(match[2]) && !themeColors.has(colorName)) {
              issues.push(`globals.css: @apply uses "${match[1]}-${match[2]}" but "${colorName}" is not registered in @theme`);
              suggestions.push(`Add --color-${colorName}: #hexval; inside a @theme { } block in globals.css`);
              break; // One warning is enough to flag the pattern
            }
          }

          if (!hasThemeBlock && /:root\s*\{[^}]*--color-/.test(css)) {
            issues.push('globals.css: Custom colors defined in :root instead of @theme — Tailwind v4 utility classes (bg-primary, text-accent, etc.) will not work');
            suggestions.push('Move --color-* variables from :root into a @theme { } block');
          }
        }

        // Check postcss.config.mjs exists
        const postcssConfig = allFiles['postcss.config.mjs'] || allFiles['postcss.config.js'] || '';
        if (!postcssConfig) {
          issues.push('Missing postcss.config.mjs — required for Tailwind v4');
          suggestions.push('Add postcss.config.mjs with @tailwindcss/postcss plugin');
        } else if (!postcssConfig.includes('@tailwindcss/postcss')) {
          issues.push('postcss.config: Missing @tailwindcss/postcss plugin');
          suggestions.push('Add @tailwindcss/postcss to the plugins in postcss.config.mjs');
        }

        // Check for use client directive where needed
        for (const [filePath, content] of Object.entries(allFiles)) {
          if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) continue;
          const hasClientHooks = /\b(useState|useEffect|useRef|useCallback|useMemo|useReducer|onClick|onChange|onSubmit)\b/.test(content);
          const hasUseClient = content.includes("'use client'") || content.includes('"use client"');
          if (hasClientHooks && !hasUseClient && !filePath.includes('route.ts')) {
            issues.push(`${filePath}: Uses client hooks/handlers but missing 'use client' directive`);
            suggestions.push(`Add 'use client' at the top of ${filePath}`);
          }
        }

        // Check for removed Next.js 15 APIs
        for (const [filePath, content] of Object.entries(allFiles)) {
          if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) continue;
          if (content.includes('request.ip') || content.includes('req.ip')) {
            issues.push(`${filePath}: Uses request.ip which does not exist on NextRequest in Next.js 15`);
            suggestions.push(`Replace with request.headers.get('x-forwarded-for') || 'unknown'`);
          }
        }

        // Check for Next.js 15 async params pattern in dynamic routes
        for (const [filePath, content] of Object.entries(allFiles)) {
          if (!filePath.includes('[') || !filePath.endsWith('page.tsx')) continue;
          if (content.includes('params: {') && !content.includes('params: Promise<')) {
            issues.push(`${filePath}: Uses sync params pattern (Next.js 14 style)`);
            suggestions.push(`Update to async params: type Props = { params: Promise<{ slug: string }> }`);
          }
        }

        // Check package.json exists and has key deps
        const pkg = allFiles['package.json'];
        if (!pkg) {
          issues.push('Missing package.json');
          suggestions.push('Generate package.json with all required dependencies');
        } else {
          const requiredDeps = ['next', 'react', '@upstash/redis', 'gray-matter', 'tailwindcss'];
          for (const dep of requiredDeps) {
            if (!pkg.includes(dep)) {
              issues.push(`package.json: Missing dependency "${dep}"`);
              suggestions.push(`Add "${dep}" to dependencies in package.json`);
            }
          }
        }

        // Check internal links resolve to generated pages
        const generatedRoutes = new Set<string>();
        generatedRoutes.add('/'); // landing page always exists
        for (const filePath of Object.keys(allFiles)) {
          // app/blog/page.tsx → /blog, app/compare/[slug]/page.tsx → /compare/* (dynamic)
          const pageMatch = filePath.match(/^app\/(.+)\/page\.tsx$/);
          if (pageMatch) {
            const route = '/' + pageMatch[1];
            generatedRoutes.add(route);
            // Dynamic routes: /blog/[slug] means /blog/* is valid
            if (route.includes('[')) {
              const base = route.replace(/\/\[.*$/, '');
              generatedRoutes.add(base + '/*');
            }
          }
        }
        // Content directories mean dynamic content will be served
        for (const filePath of Object.keys(allFiles)) {
          if (filePath.startsWith('content/blog/')) generatedRoutes.add('/blog/*');
          if (filePath.startsWith('content/comparison/') || filePath.startsWith('content/compare/')) generatedRoutes.add('/compare/*');
          if (filePath.startsWith('content/faq/')) generatedRoutes.add('/faq/*');
        }

        const brokenLinks: string[] = [];
        for (const [filePath, content] of Object.entries(allFiles)) {
          if (!filePath.endsWith('.tsx')) continue;
          // Match href="/..." patterns (both JSX and template literals)
          const linkMatches = content.matchAll(/href=["'`](\/?[a-z][a-z0-9\-\/]*)["'`]/gi);
          for (const match of linkMatches) {
            const href = match[1].startsWith('/') ? match[1] : '/' + match[1];
            if (href.startsWith('/#')) continue; // anchor links are fine
            if (generatedRoutes.has(href)) continue; // exact match
            // Check if covered by a dynamic route wildcard
            const parentPath = href.replace(/\/[^/]+$/, '');
            if (generatedRoutes.has(parentPath + '/*')) continue;
            brokenLinks.push(`${filePath}: links to "${href}" but no page exists for this route`);
          }
        }
        if (brokenLinks.length > 0) {
          // Deduplicate by route
          const seenRoutes = new Set<string>();
          for (const link of brokenLinks) {
            const route = link.match(/"([^"]+)"/)?.[1] || '';
            if (seenRoutes.has(route)) continue;
            seenRoutes.add(route);
            issues.push(link);
          }
          suggestions.push('Remove links to pages that do not exist, or generate the missing pages. Only link to routes that have a corresponding page.tsx file or will be served by a dynamic [slug] route with content.');
        }

        const score = Math.max(0, 10 - issues.length);
        return {
          pass: issues.length === 0,
          score,
          issues,
          suggestions,
          totalFiles: Object.keys(allFiles).length,
          checkedFiles: Object.keys(allFiles).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.css') || f === 'package.json').length,
        };
      },
    },

    // -----------------------------------------------------------------------
    // Create GitHub repo
    // -----------------------------------------------------------------------
    {
      name: 'create_repo',
      description:
        'Create a new GitHub repository for the site. Handles name collisions by appending a random suffix.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!brand) return { error: 'Call design_brand first' };

        repo = await createGitHubRepo(siteSlug, `${brand.siteName} — ${brand.tagline}`);

        return {
          success: true,
          owner: repo.owner,
          name: repo.name,
          url: repo.url,
        };
      },
    },

    // -----------------------------------------------------------------------
    // Push files to GitHub
    // -----------------------------------------------------------------------
    {
      name: 'push_files',
      description:
        'Push all generated files to the GitHub repository. Requires create_repo and file generation to have been called first.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!repo) return { error: 'Call create_repo first' };
        if (Object.keys(allFiles).length === 0) return { error: 'No files to push — generate files first' };
        if (!idea || !brand) return { error: 'Missing idea or brand context' };

        const commitSha = await pushFilesToGitHub(repo.owner, repo.name, allFiles);

        // Save partial site state
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

        return {
          success: true,
          commitSha: commitSha.substring(0, 7),
          fileCount: Object.keys(allFiles).length,
        };
      },
    },

    // -----------------------------------------------------------------------
    // Create Vercel project
    // -----------------------------------------------------------------------
    {
      name: 'create_vercel_project',
      description:
        'Create a Vercel project linked to the GitHub repo, with environment variables configured. Requires push_files to have been called first.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!repo) return { error: 'Call create_repo first' };

        const result = await createVercelProject(repo.owner, repo.name, siteId);
        vercelProjectId = result.projectId;

        // Update site state
        const existingSite = await getPaintedDoorSite(ideaId);
        if (existingSite) {
          existingSite.vercelProjectId = vercelProjectId;
          existingSite.status = 'deploying';
          await savePaintedDoorSite(existingSite);
        }

        return {
          success: true,
          projectId: vercelProjectId,
        };
      },
    },

    // -----------------------------------------------------------------------
    // Trigger deploy via git push
    // -----------------------------------------------------------------------
    {
      name: 'trigger_deploy',
      description:
        'Push an empty commit to trigger the Vercel GitHub webhook for initial deployment. Requires create_vercel_project to have been called first.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!repo) return { error: 'Call create_repo first' };

        await triggerDeployViaGitPush(repo.owner, repo.name);

        return { success: true, message: 'Empty commit pushed to trigger Vercel deploy' };
      },
    },

    // -----------------------------------------------------------------------
    // Check deployment status
    // -----------------------------------------------------------------------
    {
      name: 'check_deploy_status',
      description:
        'Check the current status of the Vercel deployment. Returns the deployment state and URL if ready. Call this repeatedly until the deployment is READY or ERROR.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!vercelProjectId) return { error: 'Call create_vercel_project first' };

        const token = process.env.VERCEL_TOKEN;
        if (!token) return { error: 'VERCEL_TOKEN not configured' };

        const res = await fetch(
          `https://api.vercel.com/v6/deployments?projectId=${vercelProjectId}&limit=1`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (!res.ok) {
          return { error: `Vercel API error: ${res.status}` };
        }

        const data = await res.json();
        const deployments = data.deployments || [];

        if (deployments.length === 0) {
          return { status: 'NO_DEPLOYMENTS', message: 'No deployments found yet — deployment may not have been triggered' };
        }

        const deployment = deployments[0];
        const state = deployment.state || deployment.readyState;

        if (state === 'READY') {
          siteUrl = `https://${deployment.url}`;
          return { status: 'READY', siteUrl };
        }

        if (state === 'ERROR') {
          return { status: 'ERROR', message: `Deployment failed: ${deployment.url}`, deploymentUrl: deployment.url };
        }

        return { status: state, message: 'Deployment in progress' };
      },
    },

    // -----------------------------------------------------------------------
    // Register publish target
    // -----------------------------------------------------------------------
    {
      name: 'register_publish_target',
      description:
        'Register the site as a publish target so content can be pushed to it later. Requires the site URL to be available (deployment READY).',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!repo) return { error: 'No repo info — call create_repo first' };
        if (!siteUrl) return { error: 'No site URL — wait for deployment to be READY' };

        const target: PublishTarget = {
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
        await saveDynamicPublishTarget(target);

        return { success: true, targetId: siteId, siteUrl };
      },
    },

    // -----------------------------------------------------------------------
    // Verify the deployed site is accessible
    // -----------------------------------------------------------------------
    {
      name: 'verify_site',
      description:
        'Verify the deployed site is accessible by making an HTTP request. Returns the status code.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!siteUrl) return { error: 'No site URL — deployment not ready yet' };

        try {
          const res = await fetch(siteUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(10000),
          });
          return { success: res.ok, statusCode: res.status, siteUrl };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Verification failed';
          return { success: false, error: msg, siteUrl };
        }
      },
    },

    // -----------------------------------------------------------------------
    // Finalize — save the completed site record
    // -----------------------------------------------------------------------
    {
      name: 'finalize_site',
      description:
        'Save the final site record with status "live" and all metadata. Call this as the last step after deployment is verified.',
      input_schema: {
        type: 'object',
        properties: {
          verified: {
            type: 'boolean',
            description: 'Whether the site was successfully verified as accessible',
          },
        },
        required: ['verified'],
      },
      execute: async () => {
        if (!idea || !brand || !repo) return { error: 'Missing required context' };

        const finalSite: PaintedDoorSite = {
          id: siteId,
          ideaId,
          ideaName: idea.name,
          brand,
          repoOwner: repo.owner,
          repoName: repo.name,
          repoUrl: repo.url,
          siteUrl: siteUrl || '',
          vercelProjectId,
          status: siteUrl ? 'live' : 'deploying',
          createdAt: new Date().toISOString(),
          deployedAt: siteUrl ? new Date().toISOString() : undefined,
          signupCount: 0,
        };
        await savePaintedDoorSite(finalSite);

        return {
          success: true,
          siteId,
          siteUrl: finalSite.siteUrl,
          repoUrl: repo.url,
          status: finalSite.status,
        };
      },
    },

    // -----------------------------------------------------------------------
    // Delegate: invoke content agent to create a content calendar
    // -----------------------------------------------------------------------
    {
      name: 'invoke_content_agent',
      description:
        'Delegate to the content agent to generate a content calendar for this idea. Creates blog posts, comparisons, and FAQ pieces based on SEO research. Call this after the site is deployed and finalized so content can be published to it.',
      input_schema: {
        type: 'object',
        properties: {
          targetId: {
            type: 'string',
            description: 'Optional publish target ID. Defaults to the site ID.',
          },
        },
        required: [],
      },
      execute: async (input) => {
        const targetId = (input.targetId as string) || siteId;

        try {
          const calendar = await generateContentCalendar(ideaId, targetId);

          return {
            success: true,
            ideaId,
            targetId,
            calendarSummary: calendar.strategySummary,
            pieceCount: calendar.pieces.length,
            pieces: calendar.pieces.map((p) => ({
              id: p.id,
              type: p.type,
              title: p.title,
              slug: p.slug,
              targetKeywords: p.targetKeywords,
              priority: p.priority,
            })),
            message: 'Content calendar created. Pieces can be generated via the content agent pipeline.',
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Content calendar generation failed';
          return { success: false, error: msg };
        }
      },
    },
  ];
}
