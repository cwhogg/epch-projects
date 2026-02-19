import type { ToolDefinition, BrandIdentity, PaintedDoorSite, ProductIdea, Evaluation } from '@/types';
import { ContentContext } from '@/lib/content-prompts';
import { buildContentContext, generateContentCalendar } from '@/lib/content-agent';
import { detectVertical } from '@/lib/seo-knowledge';
import { getIdeaFromDb } from '@/lib/db';
import { buildBrandIdentityPrompt } from '@/lib/painted-door-prompts';
import { assembleAllFiles, ApprovedCopy } from '@/lib/painted-door-templates';
import {
  savePaintedDoorSite,
  saveDynamicPublishTarget,
  getPaintedDoorSite,
} from '@/lib/painted-door-db';
import { PublishTarget } from '@/lib/publish-targets';
import { checkMetaDescription, combineEvaluations } from './common';
import { parseLLMJson } from '../llm-utils';
import { slugify } from '../utils';
import { getAnthropic } from '../anthropic';
import { CLAUDE_MODEL } from '../config';
import { createGitHubRepo, pushFilesToGitHub, createVercelProject, triggerDeployViaGitPush } from '../github-api';

// ---------------------------------------------------------------------------
// Validation helpers — each checks allFiles and returns { issues, suggestions }
// ---------------------------------------------------------------------------

type ValidationResult = { issues: string[]; suggestions: string[] };

export function checkLayoutMetadata(allFiles: Record<string, string>): ValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
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
  return { issues, suggestions };
}

export function checkH1Count(allFiles: Record<string, string>): ValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
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
  }
  return { issues, suggestions };
}

export function checkSemanticHtml(allFiles: Record<string, string>): ValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const page = allFiles['app/page.tsx'] || '';
  if (page) {
    if (!page.includes('<main')) {
      issues.push('page.tsx: Missing <main> element');
      suggestions.push('Wrap page content in a <main> element');
    }
    if (!page.includes('<section')) {
      issues.push('page.tsx: No <section> elements found');
      suggestions.push('Wrap major content blocks in <section> elements with aria-label');
    }
  }
  return { issues, suggestions };
}

export function checkTailwindImport(allFiles: Record<string, string>): ValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
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
  }
  return { issues, suggestions };
}

export function checkThemeColors(allFiles: Record<string, string>): ValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const css = allFiles['app/globals.css'] || '';
  if (css) {
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
      const colorName = match[2].split('-')[0];
      if (!builtinColors.has(colorName) && !themeColors.has(match[2]) && !themeColors.has(colorName)) {
        issues.push(`globals.css: @apply uses "${match[1]}-${match[2]}" but "${colorName}" is not registered in @theme`);
        suggestions.push(`Add --color-${colorName}: #hexval; inside a @theme { } block in globals.css`);
        break;
      }
    }

    if (!hasThemeBlock && /:root\s*\{[^}]*--color-/.test(css)) {
      issues.push('globals.css: Custom colors defined in :root instead of @theme — Tailwind v4 utility classes (bg-primary, text-accent, etc.) will not work');
      suggestions.push('Move --color-* variables from :root into a @theme { } block');
    }
  }
  return { issues, suggestions };
}

export function checkPostcssConfig(allFiles: Record<string, string>): ValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const postcssConfig = allFiles['postcss.config.mjs'] || allFiles['postcss.config.js'] || '';
  if (!postcssConfig) {
    issues.push('Missing postcss.config.mjs — required for Tailwind v4');
    suggestions.push('Add postcss.config.mjs with @tailwindcss/postcss plugin');
  } else if (!postcssConfig.includes('@tailwindcss/postcss')) {
    issues.push('postcss.config: Missing @tailwindcss/postcss plugin');
    suggestions.push('Add @tailwindcss/postcss to the plugins in postcss.config.mjs');
  }
  return { issues, suggestions };
}

export function checkUseClientDirectives(allFiles: Record<string, string>): ValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  for (const [filePath, content] of Object.entries(allFiles)) {
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) continue;
    const hasClientHooks = /\b(useState|useEffect|useRef|useCallback|useMemo|useReducer|onClick|onChange|onSubmit)\b/.test(content);
    const hasUseClient = content.includes("'use client'") || content.includes('"use client"');
    if (hasClientHooks && !hasUseClient && !filePath.includes('route.ts')) {
      issues.push(`${filePath}: Uses client hooks/handlers but missing 'use client' directive`);
      suggestions.push(`Add 'use client' at the top of ${filePath}`);
    }
  }
  return { issues, suggestions };
}

export function checkRemovedNextJsApis(allFiles: Record<string, string>): ValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  for (const [filePath, content] of Object.entries(allFiles)) {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) continue;
    if (content.includes('request.ip') || content.includes('req.ip')) {
      issues.push(`${filePath}: Uses request.ip which does not exist on NextRequest in Next.js 15`);
      suggestions.push(`Replace with request.headers.get('x-forwarded-for') || 'unknown'`);
    }
  }
  return { issues, suggestions };
}

export function checkAsyncParams(allFiles: Record<string, string>): ValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  for (const [filePath, content] of Object.entries(allFiles)) {
    if (!filePath.includes('[') || !filePath.endsWith('page.tsx')) continue;
    if (content.includes('params: {') && !content.includes('params: Promise<')) {
      issues.push(`${filePath}: Uses sync params pattern (Next.js 14 style)`);
      suggestions.push(`Update to async params: type Props = { params: Promise<{ slug: string }> }`);
    }
  }
  return { issues, suggestions };
}

export function checkPackageJson(allFiles: Record<string, string>): ValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
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
  return { issues, suggestions };
}

export function checkBrokenLinks(allFiles: Record<string, string>): ValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];

  const generatedRoutes = new Set<string>();
  generatedRoutes.add('/');
  for (const filePath of Object.keys(allFiles)) {
    const pageMatch = filePath.match(/^app\/(.+)\/page\.tsx$/);
    if (pageMatch) {
      const route = '/' + pageMatch[1];
      generatedRoutes.add(route);
      if (route.includes('[')) {
        const base = route.replace(/\/\[.*$/, '');
        generatedRoutes.add(base + '/*');
      }
    }
  }
  for (const filePath of Object.keys(allFiles)) {
    if (filePath.startsWith('content/blog/')) generatedRoutes.add('/blog/*');
    if (filePath.startsWith('content/comparison/') || filePath.startsWith('content/compare/')) generatedRoutes.add('/compare/*');
    if (filePath.startsWith('content/faq/')) generatedRoutes.add('/faq/*');
  }

  const brokenLinks: string[] = [];
  for (const [filePath, content] of Object.entries(allFiles)) {
    if (!filePath.endsWith('.tsx')) continue;
    const linkMatches = content.matchAll(/href=["'`](\/?[a-z][a-z0-9\-\/]*)["'`]/gi);
    for (const match of linkMatches) {
      const href = match[1].startsWith('/') ? match[1] : '/' + match[1];
      if (href.startsWith('/#')) continue;
      if (generatedRoutes.has(href)) continue;
      const parentPath = href.replace(/\/[^/]+$/, '');
      if (generatedRoutes.has(parentPath + '/*')) continue;
      brokenLinks.push(`${filePath}: links to "${href}" but no page exists for this route`);
    }
  }
  if (brokenLinks.length > 0) {
    const seenRoutes = new Set<string>();
    for (const link of brokenLinks) {
      const route = link.match(/"([^"]+)"/)?.[1] || '';
      if (seenRoutes.has(route)) continue;
      seenRoutes.add(route);
      issues.push(link);
    }
    suggestions.push('Remove links to pages that do not exist, or generate the missing pages. Only link to routes that have a corresponding page.tsx file or will be served by a dynamic [slug] route with content.');
  }
  return { issues, suggestions };
}

// ---------------------------------------------------------------------------
// Create all tools for the website (painted door) agent
// ---------------------------------------------------------------------------

export async function createWebsiteTools(ideaId: string): Promise<ToolDefinition[]> {
  // Shared mutable state across tool calls within a single run
  let idea: ProductIdea | null = null;
  let ctx: ContentContext | null = null;
  let brand: BrandIdentity | null = null;
  let allFiles: Record<string, string> = {};
  let siteSlug = '';
  let siteId = '';
  let repo: { owner: string; name: string; url: string } | null = null;
  let vercelProjectId = '';
  let siteUrl = '';
  let lastDeploymentId: string | null = null;
  let pushCount = 0;
  let isRebuild = false;

  // Best-effort preload from database — errors leave state as null
  try {
    idea = await getIdeaFromDb(ideaId);
    if (idea) {
      ctx = await buildContentContext(ideaId);
      siteSlug = slugify(idea.name);
      siteId = `pd-${siteSlug}`;
    }
  } catch { /* continue with null — tools will fetch on demand */ }

  try {
    const existingSite = await getPaintedDoorSite(ideaId);
    if (existingSite) {
      brand = existingSite.brand || null;
      if (existingSite.repoOwner && existingSite.repoName) {
        repo = { owner: existingSite.repoOwner, name: existingSite.repoName, url: existingSite.repoUrl };
      }
      vercelProjectId = existingSite.vercelProjectId || '';
      siteUrl = existingSite.siteUrl || '';
    }
  } catch { /* continue with null — tools will create fresh */ }

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
        properties: {
          visualOnly: {
            type: 'boolean',
            description: 'If true, generates only visual identity (no copy). Used when critique pipeline provides copy.',
          },
        },
        required: [],
      },
      execute: async (input) => {
        if (!idea || !ctx) return { error: 'Call get_idea_context first' };

        const visualOnly = (input.visualOnly as boolean) || false;
        const prompt = buildBrandIdentityPrompt(idea, ctx, visualOnly);
        const response = await getAnthropic().messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        brand = parseLLMJson<BrandIdentity>(text);

        return {
          success: true,
          siteName: brand.siteName,
          tagline: brand.tagline,
          seoDescription: brand.seoDescription,
          heroHeadline: brand.landingPage?.heroHeadline,
          mode: visualOnly ? 'visual-only' : 'full',
        };
      },
    },

    // -----------------------------------------------------------------------
    // Assemble all site files from templates
    // -----------------------------------------------------------------------
    {
      name: 'assemble_site_files',
      description:
        'Assemble all site files from templates using the brand identity. Instant — no LLM call needed. Requires design_brand to have been called first.',
      input_schema: {
        type: 'object',
        properties: {
          approvedCopy: {
            type: 'object',
            description: 'Optional approved copy from critique pipeline. When provided, overrides brand copy.',
            properties: {
              landingPage: { type: 'object' },
              seoDescription: { type: 'string' },
            },
          },
        },
        required: [],
      },
      execute: async (input) => {
        if (!brand || !ctx) return { error: 'Call design_brand first' };

        const approvedCopy = input.approvedCopy as ApprovedCopy | undefined;
        allFiles = assembleAllFiles(brand, ctx, approvedCopy);

        return {
          success: true,
          totalFileCount: Object.keys(allFiles).length,
          files: Object.keys(allFiles),
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
        if (primaryKeyword && brand.seoDescription) {
          evals.push(checkMetaDescription(brand.seoDescription, primaryKeyword));
        }

        if (brand.landingPage) {
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
        let vpKeywordHitCount = 0;
        if (brand.landingPage) {
          const vpTitles = brand.landingPage.valueProps.map((vp) => vp.title.toLowerCase());
          const vpKeywordHits = ctx.topKeywords.slice(0, 6).filter(
            (k) => vpTitles.some((t) => t.includes(k.keyword.toLowerCase())),
          );
          vpKeywordHitCount = vpKeywordHits.length;
          evals.push({
            pass: vpKeywordHits.length >= 2,
            score: Math.min(10, vpKeywordHits.length * 3),
            issues: vpKeywordHits.length < 2 ? [`Only ${vpKeywordHits.length} value props incorporate target keywords`] : [],
            suggestions: vpKeywordHits.length < 2 ? ['Rewrite value prop titles to naturally include secondary keywords'] : [],
          });
        }

        const combined = combineEvaluations(evals);

        return {
          ...combined,
          primaryKeyword,
          seoDescriptionLength: brand.seoDescription?.length ?? 0,
          headlineHasKeyword: evals[1]?.pass ?? null,
          valuePropsWithKeywords: vpKeywordHitCount,
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

        const checks = [
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
        ];

        const issues: string[] = [];
        const suggestions: string[] = [];
        for (const check of checks) {
          const result = check(allFiles);
          issues.push(...result.issues);
          suggestions.push(...result.suggestions);
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
        'Get or create the GitHub repository for the site. Reuses the existing repo when rebuilding; creates a new one only on first build.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!brand) return { error: 'Call design_brand first' };

        // Reuse existing repo if preloaded or found in DB
        if (repo) {
          isRebuild = true;
          return {
            success: true,
            reused: true,
            owner: repo.owner,
            name: repo.name,
            url: repo.url,
          };
        }

        // Check DB as fallback (in case preload missed it)
        try {
          const existingSite = await getPaintedDoorSite(ideaId);
          if (existingSite?.repoOwner && existingSite?.repoName) {
            repo = { owner: existingSite.repoOwner, name: existingSite.repoName, url: existingSite.repoUrl };
            isRebuild = true;
            return {
              success: true,
              reused: true,
              owner: repo.owner,
              name: repo.name,
              url: repo.url,
            };
          }
        } catch { /* fall through to create new */ }

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
        'Push all generated files to the GitHub repository. On rebuilds this updates the existing repo with new content. Requires create_repo and file generation to have been called first.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!repo) return { error: 'Call create_repo first' };
        if (Object.keys(allFiles).length === 0) return { error: 'No files to push — generate files first' };
        if (!idea || !brand) return { error: 'Missing idea or brand context' };

        const commitMessage = pushCount === 0
          ? (isRebuild ? 'Rebuild: painted door test site' : 'Initial commit: painted door test site')
          : 'Fix build errors';
        const commitSha = await pushFilesToGitHub(repo.owner, repo.name, allFiles, commitMessage);
        pushCount++;

        // Save partial site state — preserve existing fields from prior builds
        const existingSite = await getPaintedDoorSite(ideaId);
        const partialSite: PaintedDoorSite = {
          id: siteId,
          ideaId,
          ideaName: idea.name,
          brand,
          repoOwner: repo.owner,
          repoName: repo.name,
          repoUrl: repo.url,
          siteUrl: existingSite?.siteUrl || '',
          vercelProjectId: existingSite?.vercelProjectId || vercelProjectId || '',
          status: 'pushing',
          createdAt: existingSite?.createdAt || new Date().toISOString(),
          signupCount: existingSite?.signupCount || 0,
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
        'Get or create the Vercel project linked to the GitHub repo. Reuses the existing project when rebuilding. Requires push_files to have been called first.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!repo) return { error: 'Call create_repo first' };

        // Reuse existing Vercel project if preloaded
        if (vercelProjectId) {
          // Still mark site as deploying so the polling endpoint detects it
          const existingSite = await getPaintedDoorSite(ideaId);
          if (existingSite && existingSite.status !== 'deploying') {
            existingSite.status = 'deploying';
            await savePaintedDoorSite(existingSite);
          }
          return {
            success: true,
            reused: true,
            projectId: vercelProjectId,
          };
        }

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
        'Push an empty commit to trigger the Vercel GitHub webhook for deployment. Requires create_vercel_project to have been called first.',
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
        lastDeploymentId = deployment.uid;
        const state = deployment.state || deployment.readyState;

        if (state === 'READY') {
          siteUrl = `https://${deployment.url}`;
          return { status: 'READY', siteUrl };
        }

        if (state === 'ERROR') {
          return { status: 'ERROR', message: `Deployment failed: ${deployment.url}`, deploymentUrl: deployment.url, deploymentId: deployment.uid };
        }

        return { status: state, message: 'Deployment in progress' };
      },
    },

    // -----------------------------------------------------------------------
    // Fetch build error logs from a failed deployment
    // -----------------------------------------------------------------------
    {
      name: 'get_deploy_error',
      description:
        'Fetch the build error logs from a failed Vercel deployment. Call this after check_deploy_status returns ERROR.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!lastDeploymentId) {
          return { error: 'No deployment ID — call check_deploy_status first' };
        }

        const token = process.env.VERCEL_TOKEN;
        if (!token) return { error: 'VERCEL_TOKEN not configured' };

        const res = await fetch(
          `https://api.vercel.com/v2/deployments/${lastDeploymentId}/events`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (!res.ok) {
          const errBody = await res.text();
          return { error: `Failed to fetch deploy events: ${res.status} ${errBody}` };
        }

        const events = await res.json() as { type?: string; text?: string; payload?: { text?: string; deploymentId?: string } }[];

        // Extract build output lines
        const buildLines: string[] = [];
        for (const event of events) {
          const text = event.text || event.payload?.text || '';
          if (text) buildLines.push(text);
        }

        // Return the last 50 lines (where errors typically appear)
        const tail = buildLines.slice(-50);

        // Also extract lines that look like errors for quick identification
        const errorLines = buildLines.filter(
          (line) =>
            /error/i.test(line) ||
            /failed/i.test(line) ||
            /Type '.*' is not assignable/i.test(line) ||
            /Cannot find module/i.test(line) ||
            /Module not found/i.test(line),
        );

        return {
          deploymentId: lastDeploymentId,
          totalLines: buildLines.length,
          errorLines: errorLines.length > 0 ? errorLines : undefined,
          buildOutput: tail,
        };
      },
    },

    // -----------------------------------------------------------------------
    // Update a single file in the generated site
    // -----------------------------------------------------------------------
    {
      name: 'update_file',
      description:
        'Update or create a single file in the generated site. Use this to fix build errors without regenerating all files.',
      input_schema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'File path (e.g. "app/api/signup/route.ts")',
          },
          content: {
            type: 'string',
            description: 'Full file content',
          },
        },
        required: ['filePath', 'content'],
      },
      execute: async (input) => {
        const filePath = input.filePath as string;
        const content = input.content as string;
        allFiles[filePath] = content;
        return { success: true, filePath, size: content.length };
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

        const existingSite = await getPaintedDoorSite(ideaId);
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
          createdAt: existingSite?.createdAt || new Date().toISOString(),
          deployedAt: siteUrl ? new Date().toISOString() : undefined,
          signupCount: existingSite?.signupCount || 0,
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
