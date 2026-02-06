import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';
import type { ToolDefinition, ContentPiece, ContentCalendar, ContentType, Evaluation } from '@/types';
import {
  saveContentCalendar,
  saveContentPiece,
  saveAnalysisToDb,
  getAnalysisFromDb,
  getContentPieces,
  getRejectedPieces,
  getContentCalendar,
} from '@/lib/db';
import {
  ContentContext,
  buildCalendarPrompt,
  buildBlogPostPrompt,
  buildComparisonPrompt,
  buildFAQPrompt,
} from '@/lib/content-prompts';
import { buildContentContext } from '@/lib/content-agent';
import {
  checkKeywordPresence,
  checkWordCount,
  checkHeadingHierarchy,
  combineEvaluations,
} from './common';
import { parseLLMJson } from '../llm-utils';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

function slugifyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function getFilename(piece: ContentPiece): string {
  const prefix = piece.type === 'comparison' ? 'comparison' : piece.type === 'faq' ? 'faq' : 'blog';
  return `${prefix}-${piece.slug}.md`;
}

/**
 * Build all tools for the content agent.
 * ideaId is injected at construction time.
 */
export function createContentTools(ideaId: string): ToolDefinition[] {
  // Shared state across tool calls
  let cachedCtx: ContentContext | null = null;
  const generatedPieces: Map<string, { markdown: string; wordCount: number }> = new Map();

  return [
    // -----------------------------------------------------------------------
    // Load research context
    // -----------------------------------------------------------------------
    {
      name: 'get_research_context',
      description:
        'Load the analysis, SEO data, competitor data, and expertise profile for this idea. Call this first to understand what content to create.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        const ctx = await buildContentContext(ideaId);
        if (!ctx) return { error: 'No analysis found for this idea — run research agent first' };
        cachedCtx = ctx;
        return {
          ideaName: ctx.ideaName,
          description: ctx.ideaDescription,
          targetUser: ctx.targetUser,
          problemSolved: ctx.problemSolved,
          summary: ctx.summary,
          topKeywords: ctx.topKeywords.slice(0, 10).map((k) => ({
            keyword: k.keyword,
            intent: k.intentType,
            competition: k.estimatedCompetitiveness,
          })),
          serpValidated: ctx.serpValidated.map((v) => ({
            keyword: v.keyword,
            hasContentGap: v.hasContentGap,
            insight: v.serpInsight,
            peopleAlsoAsk: v.peopleAlsoAsk.slice(0, 5),
          })),
          contentStrategy: ctx.contentStrategy,
          difficultyAssessment: ctx.difficultyAssessment,
          risks: ctx.risks,
        };
      },
    },

    // -----------------------------------------------------------------------
    // Generate a content calendar
    // -----------------------------------------------------------------------
    {
      name: 'plan_content_calendar',
      description:
        'Generate a prioritized content calendar of 6-10 pieces. Requires get_research_context to have been called first. Optionally provide a targetId for the publish target.',
      input_schema: {
        type: 'object',
        properties: {
          targetId: {
            type: 'string',
            description: 'Publish target ID (default: "secondlook")',
          },
        },
        required: [],
      },
      execute: async (input) => {
        if (!cachedCtx) return { error: 'Call get_research_context first' };

        const prompt = buildCalendarPrompt(cachedCtx);
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const parsed = parseLLMJson<{
          strategySummary: string;
          pieces: Array<{
            type: string; title: string; slug: string;
            targetKeywords: string[]; contentGap?: string;
            priority: number; rationale: string;
          }>;
        }>(text);

        const validTypes: ContentType[] = ['blog-post', 'comparison', 'faq'];
        const pieces: ContentPiece[] = parsed.pieces.map((p, index) => ({
          id: `${ideaId}-piece-${index}`,
          ideaId,
          type: validTypes.includes(p.type as ContentType) ? (p.type as ContentType) : 'blog-post',
          title: p.title,
          slug: p.slug,
          targetKeywords: p.targetKeywords || [],
          contentGap: p.contentGap || undefined,
          priority: p.priority || index + 1,
          rationale: p.rationale,
          status: 'pending',
        }));

        pieces.sort((a, b) => a.priority - b.priority);

        const calendar: ContentCalendar = {
          ideaId,
          ideaName: cachedCtx.ideaName,
          targetId: (input.targetId as string) || 'secondlook',
          strategySummary: parsed.strategySummary,
          pieces,
          createdAt: new Date().toISOString(),
        };

        await saveContentCalendar(ideaId, calendar);

        return {
          success: true,
          strategySummary: calendar.strategySummary,
          pieceCount: pieces.length,
          pieces: pieces.map((p) => ({
            id: p.id,
            type: p.type,
            title: p.title,
            slug: p.slug,
            targetKeywords: p.targetKeywords,
            priority: p.priority,
          })),
        };
      },
    },

    // -----------------------------------------------------------------------
    // Evaluate a content calendar against SEO data
    // -----------------------------------------------------------------------
    {
      name: 'evaluate_calendar',
      description:
        'Evaluate a content calendar against SEO targets. Checks keyword coverage, content gap targeting, type diversity, and priority ordering. Call this after plan_content_calendar to verify quality before writing pieces.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        if (!cachedCtx) return { error: 'Call get_research_context first' };

        const calendar = await getContentCalendar(ideaId);
        if (!calendar) return { error: 'No calendar found — call plan_content_calendar first' };

        const issues: string[] = [];
        const suggestions: string[] = [];

        // Check keyword coverage — are top keywords targeted?
        const targetedKeywords = new Set(
          calendar.pieces.flatMap((p) => p.targetKeywords.map((k) => k.toLowerCase())),
        );
        const topKeywords = cachedCtx.topKeywords.slice(0, 8);
        const untargetedKeywords = topKeywords.filter(
          (k) => !targetedKeywords.has(k.keyword.toLowerCase()),
        );
        if (untargetedKeywords.length > 2) {
          issues.push(`${untargetedKeywords.length} of top 8 keywords are not targeted by any piece`);
          suggestions.push(
            `Consider adding pieces for: ${untargetedKeywords.slice(0, 3).map((k) => `"${k.keyword}"`).join(', ')}`,
          );
        }

        // Check content gap coverage — are SERP-validated gaps addressed?
        const gapKeywords = cachedCtx.serpValidated.filter((v) => v.hasContentGap);
        const gapsCovered = gapKeywords.filter((g) =>
          calendar.pieces.some((p) =>
            p.targetKeywords.some((k) => k.toLowerCase() === g.keyword.toLowerCase()) ||
            p.contentGap?.toLowerCase().includes(g.keyword.toLowerCase()),
          ),
        );
        if (gapKeywords.length > 0 && gapsCovered.length < gapKeywords.length * 0.5) {
          issues.push(`Only ${gapsCovered.length}/${gapKeywords.length} confirmed content gaps are targeted`);
          suggestions.push('Prioritize pieces that address validated content gaps from SERP analysis');
        }

        // Check type diversity
        const typeCounts: Record<string, number> = {};
        for (const p of calendar.pieces) {
          typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
        }
        const types = Object.keys(typeCounts);
        if (types.length === 1) {
          issues.push(`All ${calendar.pieces.length} pieces are type "${types[0]}" — no diversity`);
          suggestions.push('Include a mix of blog posts, comparisons, and FAQ pages for broader keyword coverage');
        }

        // Check minimum piece count
        if (calendar.pieces.length < 4) {
          issues.push(`Only ${calendar.pieces.length} pieces planned — recommend at least 6`);
          suggestions.push('Add more pieces to cover additional keyword clusters');
        }

        // Check for duplicate target keywords across pieces
        const keywordPieceMap = new Map<string, string[]>();
        for (const p of calendar.pieces) {
          for (const kw of p.targetKeywords) {
            const lower = kw.toLowerCase();
            const existing = keywordPieceMap.get(lower) || [];
            existing.push(p.title);
            keywordPieceMap.set(lower, existing);
          }
        }
        const duplicateKeywords = Array.from(keywordPieceMap.entries())
          .filter(([, titles]) => titles.length > 2);
        if (duplicateKeywords.length > 0) {
          issues.push(`${duplicateKeywords.length} keywords targeted by 3+ pieces (keyword cannibalization risk)`);
          suggestions.push(`Differentiate target keywords: ${duplicateKeywords[0][0]} is shared by ${duplicateKeywords[0][1].length} pieces`);
        }

        const score = Math.max(0, 10 - issues.length * 2);

        return {
          pass: issues.length === 0,
          score,
          issues,
          suggestions,
          pieceCount: calendar.pieces.length,
          typeDistribution: typeCounts,
          keywordCoverage: `${topKeywords.length - untargetedKeywords.length}/${topKeywords.length} top keywords targeted`,
          gapCoverage: gapKeywords.length > 0
            ? `${gapsCovered.length}/${gapKeywords.length} content gaps addressed`
            : 'No SERP-validated gaps available',
        };
      },
    },

    // -----------------------------------------------------------------------
    // Write a single content piece
    // -----------------------------------------------------------------------
    {
      name: 'write_content_piece',
      description:
        'Generate a single content piece (blog post, comparison, or FAQ). Provide the piece ID from the calendar. Returns the generated markdown.',
      input_schema: {
        type: 'object',
        properties: {
          pieceId: {
            type: 'string',
            description: 'The piece ID from the content calendar',
          },
        },
        required: ['pieceId'],
      },
      execute: async (input) => {
        if (!cachedCtx) return { error: 'Call get_research_context first' };

        const calendar = await getContentCalendar(ideaId);
        if (!calendar) return { error: 'No calendar found — call plan_content_calendar first' };

        const piece = calendar.pieces.find((p) => p.id === input.pieceId);
        if (!piece) return { error: `Piece not found: ${input.pieceId}` };

        let prompt: string;
        switch (piece.type) {
          case 'comparison':
            prompt = buildComparisonPrompt(cachedCtx, piece);
            break;
          case 'faq':
            prompt = buildFAQPrompt(cachedCtx, piece);
            break;
          default:
            prompt = buildBlogPostPrompt(cachedCtx, piece);
        }

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          messages: [{ role: 'user', content: prompt }],
        });

        const markdown = response.content[0].type === 'text' ? response.content[0].text : '';
        const wordCount = markdown.split(/\s+/).length;

        if (response.stop_reason === 'max_tokens') {
          console.warn(`Content truncated for ${piece.title}`);
        }

        generatedPieces.set(piece.id, { markdown, wordCount });

        return {
          pieceId: piece.id,
          title: piece.title,
          type: piece.type,
          wordCount,
          truncated: response.stop_reason === 'max_tokens',
          preview: markdown.slice(0, 500),
        };
      },
    },

    // -----------------------------------------------------------------------
    // Evaluate generated content
    // -----------------------------------------------------------------------
    {
      name: 'evaluate_content',
      description:
        'Evaluate a generated content piece against SEO targets. Checks keyword presence, word count, and heading structure. Call this after write_content_piece.',
      input_schema: {
        type: 'object',
        properties: {
          pieceId: {
            type: 'string',
            description: 'The piece ID to evaluate',
          },
        },
        required: ['pieceId'],
      },
      execute: async (input) => {
        const generated = generatedPieces.get(input.pieceId as string);
        if (!generated) return { error: `No generated content for piece ${input.pieceId}. Call write_content_piece first.` };

        const calendar = await getContentCalendar(ideaId);
        const piece = calendar?.pieces.find((p) => p.id === input.pieceId);
        if (!piece) return { error: `Piece not found: ${input.pieceId}` };

        const evals: Evaluation[] = [];

        // Check keywords
        evals.push(checkKeywordPresence(generated.markdown, piece.targetKeywords));

        // Check word count based on type
        const minWords = piece.type === 'faq' ? 1500 : 1200;
        const maxWords = 4000;
        evals.push(checkWordCount(generated.markdown, minWords, maxWords));

        // Check heading hierarchy
        evals.push(checkHeadingHierarchy(generated.markdown));

        const combined = combineEvaluations(evals);

        return {
          pieceId: input.pieceId,
          title: piece.title,
          ...combined,
          wordCount: generated.wordCount,
          targetKeywords: piece.targetKeywords,
        };
      },
    },

    // -----------------------------------------------------------------------
    // Revise content based on evaluation feedback
    // -----------------------------------------------------------------------
    {
      name: 'revise_content',
      description:
        'Revise a content piece based on evaluation feedback. Provide the piece ID and specific instructions for what to fix.',
      input_schema: {
        type: 'object',
        properties: {
          pieceId: {
            type: 'string',
            description: 'The piece ID to revise',
          },
          instructions: {
            type: 'string',
            description: 'Specific revision instructions based on evaluation results',
          },
        },
        required: ['pieceId', 'instructions'],
      },
      execute: async (input) => {
        const generated = generatedPieces.get(input.pieceId as string);
        if (!generated) return { error: `No generated content for piece ${input.pieceId}` };

        const calendar = await getContentCalendar(ideaId);
        const piece = calendar?.pieces.find((p) => p.id === input.pieceId);
        if (!piece) return { error: `Piece not found: ${input.pieceId}` };

        const prompt = `You are revising a content piece based on quality feedback.

ORIGINAL CONTENT:
${generated.markdown}

REVISION INSTRUCTIONS:
${input.instructions as string}

TARGET KEYWORDS (must be present in the revised content):
${piece.targetKeywords.join(', ')}

Rewrite the complete content piece with the requested improvements. Preserve the overall structure and YAML frontmatter. Output ONLY the revised markdown starting with the YAML frontmatter.`;

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          messages: [{ role: 'user', content: prompt }],
        });

        const revisedMarkdown = response.content[0].type === 'text' ? response.content[0].text : '';
        const wordCount = revisedMarkdown.split(/\s+/).length;

        generatedPieces.set(piece.id, { markdown: revisedMarkdown, wordCount });

        return {
          pieceId: piece.id,
          title: piece.title,
          wordCount,
          preview: revisedMarkdown.slice(0, 500),
        };
      },
    },

    // -----------------------------------------------------------------------
    // Save a completed piece to Redis + filesystem
    // -----------------------------------------------------------------------
    {
      name: 'save_piece',
      description:
        'Save a completed content piece to the database and filesystem. Call this after writing and (optionally) evaluating/revising the piece.',
      input_schema: {
        type: 'object',
        properties: {
          pieceId: {
            type: 'string',
            description: 'The piece ID to save',
          },
        },
        required: ['pieceId'],
      },
      execute: async (input) => {
        const generated = generatedPieces.get(input.pieceId as string);
        if (!generated) return { error: `No generated content for piece ${input.pieceId}` };

        const calendar = await getContentCalendar(ideaId);
        const piece = calendar?.pieces.find((p) => p.id === input.pieceId);
        if (!piece) return { error: `Piece not found: ${input.pieceId}` };

        const completedPiece: ContentPiece = {
          ...piece,
          status: 'complete',
          markdown: generated.markdown,
          wordCount: generated.wordCount,
          generatedAt: new Date().toISOString(),
        };

        await saveContentPiece(ideaId, completedPiece);

        // Write to vault (best-effort)
        if (cachedCtx) {
          try {
            const dir = path.join(process.cwd(), 'experiments', slugifyName(cachedCtx.ideaName), 'content');
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(path.join(dir, getFilename(completedPiece)), generated.markdown, 'utf-8');
          } catch {
            // Expected on Vercel
          }
        }

        return {
          success: true,
          pieceId: input.pieceId,
          title: piece.title,
          wordCount: generated.wordCount,
        };
      },
    },

    // -----------------------------------------------------------------------
    // Mark the analysis as having content generated
    // -----------------------------------------------------------------------
    {
      name: 'finalize_content_generation',
      description:
        'Mark the analysis as having content generated. Call this as the last step after all pieces are saved.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        const analysis = await getAnalysisFromDb(ideaId);
        if (analysis) {
          analysis.hasContentGenerated = true;
          await saveAnalysisToDb(analysis);
        }

        const savedCount = generatedPieces.size;
        return {
          success: true,
          totalPiecesSaved: savedCount,
          pieceIds: Array.from(generatedPieces.keys()),
        };
      },
    },

    // -----------------------------------------------------------------------
    // Get existing calendar and pieces (for appending)
    // -----------------------------------------------------------------------
    {
      name: 'get_existing_content',
      description:
        'Load the existing content calendar, completed pieces, and rejected pieces. Useful for understanding what content already exists before planning new pieces.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        const calendar = await getContentCalendar(ideaId);
        if (!calendar) return { hasCalendar: false };

        const completedPieces = await getContentPieces(ideaId);
        const rejectedPieces = await getRejectedPieces(ideaId);

        return {
          hasCalendar: true,
          strategySummary: calendar.strategySummary,
          pieces: calendar.pieces.map((p) => {
            const completed = completedPieces.find((cp) => cp.id === p.id);
            return {
              id: p.id,
              type: p.type,
              title: p.title,
              slug: p.slug,
              targetKeywords: p.targetKeywords,
              status: completed?.status || p.status,
              wordCount: completed?.wordCount,
            };
          }),
          rejectedPieces: rejectedPieces.map((p) => ({
            title: p.title,
            slug: p.slug,
            reason: p.rejectionReason,
          })),
        };
      },
    },
  ];
}
