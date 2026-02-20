import type { ToolDefinition, BrandIdentity, PaintedDoorSite, ProductIdea, Evaluation } from '@/types';
import { ContentContext } from '@/lib/content-prompts';
import { buildContentContext, generateContentCalendar } from '@/lib/content-agent';
import { detectVertical } from '@/lib/seo-knowledge';
import { getIdeaFromDb, getFoundationDoc } from '@/lib/db';
import { assembleFromSpec } from '@/lib/painted-door-templates';
import { validateSectionCopy, validatePageMeta, getMissingSectionTypes } from '@/lib/painted-door-page-spec';
import type { SectionType, PageSection, PageSpec } from '@/lib/painted-door-page-spec';
import { extractBrandFromDesignPrinciples } from '@/lib/foundation-tokens';
import {
  savePaintedDoorSite,
  saveDynamicPublishTarget,
  getPaintedDoorSite,
  getBuildSession,
  saveBuildSession,
} from '@/lib/painted-door-db';
import { PublishTarget } from '@/lib/publish-targets';
import { checkMetaDescription, combineEvaluations } from './common';
import { slugify } from '../utils';
import { createGitHubRepo, pushFilesToGitHub, createVercelProject, triggerDeployViaGitPush } from '../github-api';
import { contrastRatio } from '../contrast-utils';

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
    // Lock section copy into PageSpec accumulator
    // -----------------------------------------------------------------------
    {
      name: 'lock_section_copy',
      description:
        'Validate and lock a section\'s copy into the PageSpec accumulator. Call this after each copy-producing stage. All 8 sections must be locked before assemble_site_files can run.',
      input_schema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Section type: hero, problem, features, how-it-works, audience, objections, final-cta, or faq',
          },
          copy: {
            type: 'object',
            description: 'Section copy matching the schema for the given type',
          },
          overwrite: {
            type: 'boolean',
            description: 'Set to true to replace an already-locked section (e.g. during final review)',
          },
        },
        required: ['type', 'copy'],
      },
      execute: async (input) => {
        const sectionType = input.type as SectionType;
        const copy = input.copy as Record<string, unknown>;
        const overwrite = (input.overwrite as boolean) || false;

        // Validate the copy
        const validation = validateSectionCopy(sectionType, copy);
        if (!validation.valid) {
          return { error: `Validation failed for ${sectionType}: ${validation.errors.join('; ')}` };
        }

        try {
          // Read current session
          const session = await getBuildSession(ideaId);
          if (!session) return { error: 'No build session found — start a build first' };

          // Initialize pageSpec if missing
          if (!session.artifacts.pageSpec) {
            session.artifacts.pageSpec = { sections: [], metaTitle: '', metaDescription: '', ogDescription: '' };
          }

          const pageSpec = session.artifacts.pageSpec;

          // Check for duplicate
          const existingIdx = pageSpec.sections.findIndex((s) => s.type === sectionType);
          if (existingIdx >= 0 && !overwrite) {
            return { error: `Section "${sectionType}" is already locked. Pass overwrite: true to replace it.` };
          }

          // Build the section entry — cast through unknown because copy is validated but typed as Record
          const section = { type: sectionType, copy } as unknown as PageSection;

          if (existingIdx >= 0) {
            pageSpec.sections[existingIdx] = section;
          } else {
            pageSpec.sections.push(section);
          }

          session.updatedAt = new Date().toISOString();
          await saveBuildSession(ideaId, session);

          return {
            success: true,
            lockedSection: sectionType,
            copy,
            totalLocked: pageSpec.sections.length,
            remaining: getMissingSectionTypes(pageSpec.sections),
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { error: `Failed to save section: ${msg}` };
        }
      },
    },

    // -----------------------------------------------------------------------
    // Lock page meta into PageSpec accumulator
    // -----------------------------------------------------------------------
    {
      name: 'lock_page_meta',
      description:
        'Validate and lock page metadata (metaTitle, metaDescription, ogDescription) into the PageSpec. Call this during final review.',
      input_schema: {
        type: 'object',
        properties: {
          metaTitle: { type: 'string', description: 'Page meta title' },
          metaDescription: { type: 'string', description: 'Page meta description' },
          ogDescription: { type: 'string', description: 'Open Graph description' },
        },
        required: ['metaTitle', 'metaDescription', 'ogDescription'],
      },
      execute: async (input) => {
        const meta = input as Record<string, unknown>;
        const validation = validatePageMeta(meta);
        if (!validation.valid) {
          return { error: `Validation failed: ${validation.errors.join('; ')}` };
        }

        try {
          const session = await getBuildSession(ideaId);
          if (!session) return { error: 'No build session found — start a build first' };

          if (!session.artifacts.pageSpec) {
            session.artifacts.pageSpec = { sections: [], metaTitle: '', metaDescription: '', ogDescription: '' };
          }

          session.artifacts.pageSpec.metaTitle = input.metaTitle as string;
          session.artifacts.pageSpec.metaDescription = input.metaDescription as string;
          session.artifacts.pageSpec.ogDescription = input.ogDescription as string;
          session.updatedAt = new Date().toISOString();
          await saveBuildSession(ideaId, session);

          return {
            success: true,
            metaTitle: session.artifacts.pageSpec.metaTitle,
            metaDescription: session.artifacts.pageSpec.metaDescription,
            ogDescription: session.artifacts.pageSpec.ogDescription,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { error: `Failed to save page meta: ${msg}` };
        }
      },
    },

    // -----------------------------------------------------------------------
    // Lock brand identity into session
    // -----------------------------------------------------------------------
    {
      name: 'lock_brand',
      description:
        'Validate and lock the brand identity (colors, fonts, theme) into the build session. Call this at Stage 0 after reading the design-principles Foundation document. The brand feeds directly into site rendering.',
      input_schema: {
        type: 'object',
        properties: {
          siteName: { type: 'string', description: 'The product/site name' },
          tagline: { type: 'string', description: 'Short tagline for the product' },
          theme: { type: 'string', enum: ['light', 'dark'], description: 'Light or dark theme' },
          colors: {
            type: 'object',
            description: 'All 9 color fields as 6-digit hex codes (#RRGGBB)',
            properties: {
              primary: { type: 'string', description: 'Primary/CTA color' },
              primaryLight: { type: 'string', description: 'Lighter variant for hover states' },
              background: { type: 'string', description: 'Page background color' },
              backgroundElevated: { type: 'string', description: 'Card/elevated surface background' },
              text: { type: 'string', description: 'Primary text color' },
              textSecondary: { type: 'string', description: 'Secondary text color' },
              textMuted: { type: 'string', description: 'Muted/placeholder text color' },
              accent: { type: 'string', description: 'Accent color for highlights (distinct from primary)' },
              border: { type: 'string', description: 'Subtle border color' },
            },
            required: ['primary', 'primaryLight', 'background', 'backgroundElevated', 'text', 'textSecondary', 'textMuted', 'accent', 'border'],
          },
          fonts: {
            type: 'object',
            description: 'Font family names from Google Fonts',
            properties: {
              heading: { type: 'string', description: 'Heading font' },
              body: { type: 'string', description: 'Body font' },
              mono: { type: 'string', description: 'Monospace font' },
            },
            required: ['heading', 'body', 'mono'],
          },
          overwrite: {
            type: 'boolean',
            description: 'Set to true to replace previously locked brand (e.g. during final review)',
          },
        },
        required: ['siteName', 'tagline', 'theme', 'colors', 'fonts'],
      },
      execute: async (input) => {
        const overwrite = (input.overwrite as boolean) || false;
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate required string fields
        if (!input.siteName || typeof input.siteName !== 'string') errors.push('siteName is required');
        if (!input.tagline || typeof input.tagline !== 'string') errors.push('tagline is required');
        if (!input.theme || (input.theme !== 'light' && input.theme !== 'dark')) {
          errors.push('theme must be "light" or "dark"');
        }

        // Validate colors
        const colors = input.colors as Record<string, string> | undefined;
        if (!colors || typeof colors !== 'object') {
          errors.push('colors object is required');
        } else {
          const hexPattern = /^#[0-9A-Fa-f]{6}$/;
          const colorFields = ['primary', 'primaryLight', 'background', 'backgroundElevated', 'text', 'textSecondary', 'textMuted', 'accent', 'border'];
          for (const field of colorFields) {
            if (!colors[field] || !hexPattern.test(colors[field])) {
              errors.push(`colors.${field} must be a valid 6-digit hex code (#RRGGBB)`);
            }
          }
        }

        // Validate fonts
        const fonts = input.fonts as Record<string, string> | undefined;
        if (!fonts || typeof fonts !== 'object') {
          errors.push('fonts object is required');
        } else {
          for (const field of ['heading', 'body', 'mono']) {
            if (!fonts[field] || typeof fonts[field] !== 'string' || fonts[field].trim() === '') {
              errors.push(`fonts.${field} must be a non-empty string`);
            }
          }
        }

        if (errors.length > 0) {
          return { error: `Brand validation failed: ${errors.join('; ')}` };
        }

        // WCAG contrast check (warning only)
        if (colors) {
          const ratio = contrastRatio(colors.text, colors.background);
          if (ratio < 4.5) {
            warnings.push(`WCAG AA contrast warning: text (${colors.text}) on background (${colors.background}) has ratio ${ratio.toFixed(1)}:1, minimum recommended is 4.5:1`);
          }
        }

        try {
          const session = await getBuildSession(ideaId);
          if (!session) return { error: 'No build session found — start a build first' };

          // Check for existing brand
          if (session.artifacts.brand && !overwrite) {
            return { error: 'Brand is already locked. Pass overwrite: true to replace it.' };
          }

          const lockedBrand: BrandIdentity = {
            siteName: input.siteName as string,
            tagline: input.tagline as string,
            siteUrl: '', // Resolved later by assemble_site_files from the site record
            colors: {
              primary: colors!.primary,
              primaryLight: colors!.primaryLight,
              background: colors!.background,
              backgroundElevated: colors!.backgroundElevated,
              text: colors!.text,
              textSecondary: colors!.textSecondary,
              textMuted: colors!.textMuted,
              accent: colors!.accent,
              border: colors!.border,
            },
            fonts: {
              heading: fonts!.heading,
              body: fonts!.body,
              mono: fonts!.mono,
            },
            theme: input.theme as 'light' | 'dark',
          };

          session.artifacts.brand = lockedBrand;
          session.updatedAt = new Date().toISOString();
          await saveBuildSession(ideaId, session);

          // Also set the closure variable for downstream tools (create_repo, push_files, finalize_site)
          brand = lockedBrand;

          return {
            success: true,
            siteName: lockedBrand.siteName,
            tagline: lockedBrand.tagline,
            theme: lockedBrand.theme,
            colorCount: 9,
            fonts: lockedBrand.fonts,
            warnings,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { error: `Failed to save brand: ${msg}` };
        }
      },
    },

    // -----------------------------------------------------------------------
    // Assemble all site files from PageSpec + design tokens
    // -----------------------------------------------------------------------
    {
      name: 'assemble_site_files',
      description:
        'Assemble all site files from the locked PageSpec and design-principles Foundation doc. Deterministic — no LLM call. Requires all 8 sections to be locked via lock_section_copy.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        try {
          // Read build session for PageSpec
          const session = await getBuildSession(ideaId);
          if (!session?.artifacts?.pageSpec) {
            return { error: 'No PageSpec found — lock all sections first' };
          }
          const pageSpec = session.artifacts.pageSpec as PageSpec;

          // Check for missing sections
          const missing = getMissingSectionTypes(pageSpec.sections);
          if (missing.length > 0) {
            return { error: `Cannot assemble: missing section types: ${missing.join(', ')}` };
          }

          // Extract brand from design-principles Foundation doc
          const designDoc = await getFoundationDoc(ideaId, 'design-principles');
          if (!designDoc) {
            return { error: 'No design-principles Foundation doc found. Generate one first.' };
          }

          // Determine siteUrl from existing site record
          let existingSiteUrl = '';
          try {
            const existingSite = await getPaintedDoorSite(ideaId);
            if (existingSite?.siteUrl) existingSiteUrl = existingSite.siteUrl;
          } catch { /* ignore */ }

          const extraction = extractBrandFromDesignPrinciples(designDoc.content, existingSiteUrl);
          if (!extraction.ok) {
            return { error: `Brand extraction failed: ${extraction.error}` };
          }

          brand = extraction.brand as BrandIdentity;
          allFiles = assembleFromSpec(pageSpec, brand);

          return {
            success: true,
            totalFileCount: Object.keys(allFiles).length,
            files: Object.keys(allFiles),
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { error: `Assembly failed: ${msg}` };
        }
      },
    },

    // -----------------------------------------------------------------------
    // Evaluate locked PageSpec against SEO requirements
    // -----------------------------------------------------------------------
    {
      name: 'evaluate_brand',
      description:
        'Evaluate the locked PageSpec and extracted brand against SEO requirements. Checks keyword placement in hero headline, meta description, feature count, FAQ count, and color contrast. Call after locking sections.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!ctx) return { error: 'Call get_idea_context first' };

        try {
          // Read PageSpec from session
          const session = await getBuildSession(ideaId);
          const pageSpec = session?.artifacts?.pageSpec;

          // Read brand from design-principles
          const designDoc = await getFoundationDoc(ideaId, 'design-principles');
          let extractedBrand: BrandIdentity | null = null;
          if (designDoc) {
            const extraction = extractBrandFromDesignPrinciples(designDoc.content, '');
            if (extraction.ok) extractedBrand = extraction.brand as BrandIdentity;
          }

          const evals: Evaluation[] = [];
          const primaryKeyword = ctx.topKeywords[0]?.keyword || '';
          let headlineHasKeyword: boolean | null = null;
          let featureCount = 0;
          let faqCount = 0;

          if (pageSpec) {
            // Check hero headline for primary keyword
            const heroSection = pageSpec.sections.find((s: PageSection) => s.type === 'hero');
            if (heroSection && primaryKeyword) {
              const heroCopy = heroSection.copy as { headline: string; subheadline: string };
              const headlineLower = heroCopy.headline.toLowerCase();
              const kwLower = primaryKeyword.toLowerCase();
              headlineHasKeyword = headlineLower.includes(kwLower);
              evals.push({
                pass: headlineHasKeyword,
                score: headlineHasKeyword ? 10 : 3,
                issues: headlineHasKeyword ? [] : [`Hero headline does not contain primary keyword "${primaryKeyword}"`],
                suggestions: headlineHasKeyword ? [] : [`Rewrite headline to naturally include "${primaryKeyword}"`],
              });
            }

            // Check meta description
            if (primaryKeyword && pageSpec.metaDescription) {
              evals.push(checkMetaDescription(pageSpec.metaDescription, primaryKeyword));
            }

            // Check feature count
            const featuresSection = pageSpec.sections.find((s: PageSection) => s.type === 'features');
            if (featuresSection) {
              const featuresCopy = featuresSection.copy as { features: unknown[] };
              featureCount = featuresCopy.features?.length || 0;
              const inRange = featureCount >= 3 && featureCount <= 6;
              evals.push({
                pass: inRange,
                score: inRange ? 10 : 5,
                issues: inRange ? [] : [`Feature count ${featureCount} is outside recommended range (3-6)`],
                suggestions: inRange ? [] : ['Aim for 3-6 features for optimal landing page layout'],
              });
            }

            // Check FAQ count
            const faqSection = pageSpec.sections.find((s: PageSection) => s.type === 'faq');
            if (faqSection) {
              const faqCopy = faqSection.copy as { faqs: unknown[] };
              faqCount = faqCopy.faqs?.length || 0;
              const inRange = faqCount >= 3 && faqCount <= 10;
              evals.push({
                pass: inRange,
                score: inRange ? 10 : 5,
                issues: inRange ? [] : [`FAQ count ${faqCount} is outside recommended range (3-10)`],
                suggestions: inRange ? [] : ['Aim for 3-10 FAQs for good SEO coverage'],
              });
            }
          }

          // Check color contrast from extracted brand
          if (extractedBrand?.colors.text && extractedBrand?.colors.background) {
            const ratio = contrastRatio(extractedBrand.colors.text, extractedBrand.colors.background);
            const passes = ratio >= 4.5;
            evals.push({
              pass: passes,
              score: passes ? 10 : Math.round(ratio),
              issues: passes ? [] : [`Text/background contrast ratio ${ratio.toFixed(1)}:1 is below WCAG AA minimum (4.5:1)`],
              suggestions: passes ? [] : ['Lighten text color or darken background for better readability'],
            });
          }

          const combined = combineEvaluations(evals);

          return {
            ...combined,
            primaryKeyword,
            metaDescriptionLength: pageSpec?.metaDescription?.length ?? 0,
            headlineHasKeyword,
            featureCount,
            faqCount,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { error: `Evaluation failed: ${msg}` };
        }
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
        if (!brand) return { error: 'Call assemble_site_files first' };

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
          // Prefer production alias over deployment-specific URL
          const aliases: string[] = deployment.alias || [];
          const productionAlias = aliases.find((a: string) => !a.includes('-' + deployment.uid.slice(0, 9)));
          siteUrl = `https://${productionAlias || deployment.url}`;
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
