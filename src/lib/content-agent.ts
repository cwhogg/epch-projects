import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';
import { ContentPiece, ContentCalendar, ContentProgress, ContentType } from '@/types';
import {
  getAnalysisFromDb,
  getAnalysisContent,
  getIdeaFromDb,
  saveContentCalendar,
  getContentCalendar,
  saveContentPiece,
  getContentPieces,
  saveContentProgress,
  saveAnalysisToDb,
  getRejectedPieces,
} from './db';
import {
  ContentContext,
  buildCalendarPrompt,
  buildAppendCalendarPrompt,
  buildBlogPostPrompt,
  buildLandingPagePrompt,
  buildComparisonPrompt,
  buildFAQPrompt,
} from './content-prompts';
import { buildExpertiseContext } from './expertise-profile';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// ---------- Context Builder ----------

export async function buildContentContext(ideaId: string): Promise<ContentContext | null> {
  const analysis = await getAnalysisFromDb(ideaId);
  if (!analysis) return null;

  const idea = await getIdeaFromDb(ideaId);
  if (!idea) return null;

  const content = await getAnalysisContent(ideaId);

  // Parse SEO data
  let topKeywords: ContentContext['topKeywords'] = [];
  let serpValidated: ContentContext['serpValidated'] = [];
  let contentStrategy: ContentContext['contentStrategy'] = { topOpportunities: [], recommendedAngle: '' };
  let difficultyAssessment: ContentContext['difficultyAssessment'] = { dominantPlayers: [], roomForNewEntrant: false, reasoning: '' };

  if (content?.seoData) {
    try {
      const seoData = JSON.parse(content.seoData);
      const syn = seoData.synthesis;
      if (syn) {
        topKeywords = (syn.topKeywords || []).map((k: Record<string, unknown>) => ({
          keyword: String(k.keyword || ''),
          intentType: String(k.intentType || ''),
          estimatedVolume: String(k.estimatedVolume || ''),
          estimatedCompetitiveness: String(k.estimatedCompetitiveness || ''),
          contentGapHypothesis: String(k.contentGapHypothesis || ''),
          relevanceToMillionARR: String(k.relevanceToMillionARR || ''),
        }));
        serpValidated = (syn.serpValidated || []).map((v: Record<string, unknown>) => ({
          keyword: String(v.keyword || ''),
          hasContentGap: Boolean(v.hasContentGap),
          serpInsight: String(v.serpInsight || ''),
          peopleAlsoAsk: Array.isArray((v.serpData as Record<string, unknown>)?.peopleAlsoAsk)
            ? ((v.serpData as Record<string, unknown>).peopleAlsoAsk as { question: string }[]).map((q) => q.question)
            : [],
          relatedSearches: Array.isArray((v.serpData as Record<string, unknown>)?.relatedSearches)
            ? ((v.serpData as Record<string, unknown>).relatedSearches as string[])
            : [],
          contentGapTypes: Array.isArray(v.contentGapTypes) ? (v.contentGapTypes as string[]) : undefined,
          greenFlags: Array.isArray(v.greenFlags) ? (v.greenFlags as string[]) : undefined,
          redFlags: Array.isArray(v.redFlags) ? (v.redFlags as string[]) : undefined,
        }));
        if (syn.contentStrategy) {
          contentStrategy = {
            topOpportunities: Array.isArray(syn.contentStrategy.topOpportunities) ? syn.contentStrategy.topOpportunities : [],
            recommendedAngle: String(syn.contentStrategy.recommendedAngle || ''),
          };
        }
        if (syn.difficultyAssessment) {
          difficultyAssessment = {
            dominantPlayers: Array.isArray(syn.difficultyAssessment.dominantPlayers) ? syn.difficultyAssessment.dominantPlayers : [],
            roomForNewEntrant: Boolean(syn.difficultyAssessment.roomForNewEntrant),
            reasoning: String(syn.difficultyAssessment.reasoning || ''),
          };
        }
      }
    } catch {
      console.error('Failed to parse SEO data for content context');
    }
  }

  return {
    ideaName: idea.name,
    ideaDescription: idea.description,
    targetUser: idea.targetUser,
    problemSolved: idea.problemSolved,
    url: idea.url,
    scores: analysis.scores,
    summary: analysis.summary,
    risks: analysis.risks,
    topKeywords,
    serpValidated,
    contentStrategy,
    difficultyAssessment,
    competitors: content?.competitors || '(No competitor data available)',
    expertiseProfile: buildExpertiseContext(),
  };
}

// ---------- Calendar Generation ----------

export async function generateContentCalendar(ideaId: string, targetId?: string): Promise<ContentCalendar> {
  const ctx = await buildContentContext(ideaId);
  if (!ctx) throw new Error('No analysis found for this idea');

  const prompt = buildCalendarPrompt(ctx);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Parse JSON response
  let parsed: { strategySummary: string; pieces: Array<{ type: string; title: string; slug: string; targetKeywords: string[]; contentGap?: string; priority: number; rationale: string }> };
  try {
    // Strip markdown code fences if present
    let jsonStr = text.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }
    parsed = JSON.parse(jsonStr);
  } catch {
    // Try extracting JSON object from text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Failed to parse content calendar response');
    }
  }

  const validTypes: ContentType[] = ['blog-post', 'landing-page', 'comparison', 'faq'];

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

  // Sort by priority
  pieces.sort((a, b) => a.priority - b.priority);

  const calendar: ContentCalendar = {
    ideaId,
    ideaName: ctx.ideaName,
    targetId: targetId || 'secondlook',
    strategySummary: parsed.strategySummary,
    pieces,
    createdAt: new Date().toISOString(),
  };

  await saveContentCalendar(ideaId, calendar);
  return calendar;
}

// ---------- Append New Pieces ----------

export async function appendNewPieces(ideaId: string, targetId?: string, userFeedback?: string): Promise<ContentCalendar> {
  const calendar = await getContentCalendar(ideaId);
  if (!calendar) throw new Error('No existing calendar found — use full generation first');

  const ctx = await buildContentContext(ideaId);
  if (!ctx) throw new Error('No analysis found for this idea');

  // Load completed pieces and rejected pieces for context
  const completedPieces = await getContentPieces(ideaId);
  const rejectedPieces = await getRejectedPieces(ideaId);

  // Merge completed data into existing pieces for full context
  const existingPieces = calendar.pieces.map((p) => {
    const completed = completedPieces.find((cp) => cp.id === p.id);
    return completed || p;
  });

  const publishedPieces = existingPieces.filter((p) => p.status === 'complete');

  // Augment context with append-specific fields
  ctx.existingPieces = existingPieces;
  ctx.publishedPieces = publishedPieces;
  ctx.rejectedPieces = rejectedPieces.length > 0 ? rejectedPieces : (calendar.rejectedPieces || []);
  ctx.userFeedback = userFeedback;

  const prompt = buildAppendCalendarPrompt(ctx);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  let parsed: { pieces: Array<{ type: string; title: string; slug: string; targetKeywords: string[]; contentGap?: string; priority: number; rationale: string }> };
  try {
    let jsonStr = text.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }
    parsed = JSON.parse(jsonStr);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Failed to parse append calendar response');
    }
  }

  // Determine nextPieceIndex by scanning all existing + rejected IDs
  const allIds = [
    ...calendar.pieces.map((p) => p.id),
    ...(calendar.rejectedPieces || []).map((p) => p.id),
  ];
  let maxIndex = calendar.nextPieceIndex || 0;
  for (const id of allIds) {
    const match = id.match(/-piece-(\d+)$/);
    if (match) {
      maxIndex = Math.max(maxIndex, parseInt(match[1], 10) + 1);
    }
  }

  const validTypes: ContentType[] = ['blog-post', 'landing-page', 'comparison', 'faq'];

  const newPieces: ContentPiece[] = parsed.pieces.slice(0, 3).map((p, i) => ({
    id: `${ideaId}-piece-${maxIndex + i}`,
    ideaId,
    type: validTypes.includes(p.type as ContentType) ? (p.type as ContentType) : 'blog-post',
    title: p.title,
    slug: p.slug,
    targetKeywords: p.targetKeywords || [],
    contentGap: p.contentGap || undefined,
    priority: p.priority || 5,
    rationale: p.rationale,
    status: 'pending',
  }));

  calendar.pieces.push(...newPieces);
  calendar.nextPieceIndex = maxIndex + newPieces.length;
  if (targetId) calendar.targetId = targetId;

  await saveContentCalendar(ideaId, calendar);
  return calendar;
}

// ---------- Content Generation ----------

export async function generateContentPieces(
  calendar: ContentCalendar,
  selectedIds: string[],
  onProgress?: (progress: ContentProgress) => Promise<void>,
): Promise<void> {
  const ctx = await buildContentContext(calendar.ideaId);
  if (!ctx) throw new Error('No analysis found for this idea');

  const selectedPieces = calendar.pieces.filter((p) => selectedIds.includes(p.id));

  const progress: ContentProgress = {
    ideaId: calendar.ideaId,
    status: 'running',
    currentStep: 'Starting content generation...',
    steps: selectedPieces.map((p) => ({ name: p.title, status: 'pending' as const })),
    completedPieceIds: [],
  };

  await saveContentProgress(calendar.ideaId, progress);
  if (onProgress) await onProgress(progress);

  for (let i = 0; i < selectedPieces.length; i++) {
    const piece = selectedPieces[i];

    // Skip already completed pieces (for re-trigger scenarios)
    if (piece.status === 'complete') {
      progress.steps[i].status = 'complete';
      progress.steps[i].detail = 'Already generated';
      progress.completedPieceIds.push(piece.id);
      await saveContentProgress(calendar.ideaId, progress);
      if (onProgress) await onProgress(progress);
      continue;
    }

    progress.steps[i].status = 'running';
    progress.currentStep = `Generating: ${piece.title}`;
    await saveContentProgress(calendar.ideaId, progress);
    if (onProgress) await onProgress(progress);

    try {
      const markdown = await generateSinglePiece(ctx, piece);
      const wordCount = markdown.split(/\s+/).length;

      const completedPiece: ContentPiece = {
        ...piece,
        status: 'complete',
        markdown,
        wordCount,
        generatedAt: new Date().toISOString(),
      };

      await saveContentPiece(calendar.ideaId, completedPiece);

      // Write to vault (best-effort — fails silently on read-only filesystems like Vercel)
      try {
        await writeContentToVault(ctx.ideaName, completedPiece);
      } catch {
        // Expected on Vercel — content is still saved in Redis
      }

      progress.steps[i].status = 'complete';
      progress.steps[i].detail = `${wordCount} words`;
      progress.completedPieceIds.push(piece.id);
    } catch (error) {
      console.error(`Failed to generate ${piece.title}:`, error);
      progress.steps[i].status = 'error';
      progress.steps[i].detail = error instanceof Error ? error.message : 'Generation failed';

      // Save error state for the piece
      const errorPiece: ContentPiece = { ...piece, status: 'error' };
      await saveContentPiece(calendar.ideaId, errorPiece);
    }

    await saveContentProgress(calendar.ideaId, progress);
    if (onProgress) await onProgress(progress);
  }

  // Mark overall progress
  const hasErrors = progress.steps.some((s) => s.status === 'error');
  progress.status = hasErrors ? 'error' : 'complete';
  progress.currentStep = hasErrors ? 'Some pieces failed' : 'All content generated!';
  await saveContentProgress(calendar.ideaId, progress);
  if (onProgress) await onProgress(progress);

  // Mark analysis as having content
  const analysis = await getAnalysisFromDb(calendar.ideaId);
  if (analysis) {
    analysis.hasContentGenerated = true;
    await saveAnalysisToDb(analysis);
  }

  // Write calendar index to vault (best-effort)
  try {
    await writeCalendarIndex(ctx.ideaName, calendar);
  } catch {
    // Expected on Vercel — calendar is still saved in Redis
  }
}

export async function generateSinglePiece(ctx: ContentContext, piece: ContentPiece): Promise<string> {
  let prompt: string;

  switch (piece.type) {
    case 'blog-post':
      prompt = buildBlogPostPrompt(ctx, piece);
      break;
    case 'landing-page':
      prompt = buildLandingPagePrompt(ctx, piece);
      break;
    case 'comparison':
      prompt = buildComparisonPrompt(ctx, piece);
      break;
    case 'faq':
      prompt = buildFAQPrompt(ctx, piece);
      break;
    default:
      prompt = buildBlogPostPrompt(ctx, piece);
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Handle potential continuation needed
  if (response.stop_reason === 'max_tokens') {
    console.warn(`Content truncated for ${piece.title} — consider increasing max_tokens`);
  }

  return text;
}

// ---------- File Output ----------

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function getContentDir(ideaName: string): string {
  return path.join(process.cwd(), 'experiments', slugifyName(ideaName), 'content');
}

function getFilename(piece: ContentPiece): string {
  switch (piece.type) {
    case 'blog-post':
      return `blog-${piece.slug}.md`;
    case 'landing-page':
      return `landing-page.md`;
    case 'comparison':
      return `comparison-${piece.slug}.md`;
    case 'faq':
      return `faq-${piece.slug}.md`;
    default:
      return `${piece.slug}.md`;
  }
}

async function writeContentToVault(ideaName: string, piece: ContentPiece): Promise<void> {
  if (!piece.markdown) return;

  const dir = getContentDir(ideaName);
  await fs.mkdir(dir, { recursive: true });

  const filePath = path.join(dir, getFilename(piece));
  await fs.writeFile(filePath, piece.markdown, 'utf-8');
}

async function writeCalendarIndex(ideaName: string, calendar: ContentCalendar): Promise<void> {
  const dir = getContentDir(ideaName);
  await fs.mkdir(dir, { recursive: true });

  const lines: string[] = [
    '---',
    `title: "Content Calendar — ${calendar.ideaName}"`,
    `type: calendar-index`,
    `generatedAt: "${calendar.createdAt}"`,
    `ideaName: "${calendar.ideaName}"`,
    `totalPieces: ${calendar.pieces.length}`,
    '---',
    '',
    `# Content Calendar: ${calendar.ideaName}`,
    '',
    `## Strategy`,
    '',
    calendar.strategySummary,
    '',
    `## Content Pieces`,
    '',
    '| # | Type | Title | Target Keywords | Status |',
    '|---|------|-------|----------------|--------|',
  ];

  for (const piece of calendar.pieces) {
    const keywords = piece.targetKeywords.slice(0, 3).join(', ');
    lines.push(`| ${piece.priority} | ${piece.type} | ${piece.title} | ${keywords} | ${piece.status} |`);
  }

  const filePath = path.join(dir, '_calendar.md');
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
}
