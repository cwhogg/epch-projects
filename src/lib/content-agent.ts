import { ContentPiece, ContentCalendar, ContentProgress, ContentType } from '@/types';
import {
  getAnalysisFromDb,
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
  buildComparisonPrompt,
  buildFAQPrompt,
} from './content-prompts';
import { parseLLMJson } from './llm-utils';
import { getAnthropic } from './anthropic';
import { CLAUDE_MODEL } from './config';
import { writeContentToVault, writeCalendarIndex } from './content-vault';
import { buildContentContext } from './content-context';
import { generateContentPiecesV2 } from './content-agent-v2';

// Re-export buildContentContext so existing importers continue to work
export { buildContentContext } from './content-context';

// ---------- Calendar Generation ----------

export async function generateContentCalendar(ideaId: string, targetId?: string): Promise<ContentCalendar> {
  const ctx = await buildContentContext(ideaId);
  if (!ctx) throw new Error('No analysis found for this idea');

  const prompt = buildCalendarPrompt(ctx);

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Parse JSON response
  const parsed = parseLLMJson<{ strategySummary: string; pieces: Array<{ type: string; title: string; slug: string; targetKeywords: string[]; contentGap?: string; priority: number; rationale: string }> }>(text);

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

  // Sort by priority
  pieces.sort((a, b) => a.priority - b.priority);

  const calendar: ContentCalendar = {
    ideaId,
    ideaName: ctx.ideaName,
    targetId,
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

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  const parsed = parseLLMJson<{ pieces: Array<{ type: string; title: string; slug: string; targetKeywords: string[]; contentGap?: string; priority: number; rationale: string }> }>(text);

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

  const validTypes: ContentType[] = ['blog-post', 'comparison', 'faq'];

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
      } catch (error) {
        console.debug('[content-agent] fs write skipped:', error);
      }

      progress.steps[i].status = 'complete';
      progress.steps[i].detail = `${wordCount} words`;
      progress.completedPieceIds.push(piece.id);
    } catch (error) {
      console.error(`[content-agent] Failed to generate ${piece.title}:`, error);
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
  } catch (error) {
    console.debug('[content-agent] calendar fs write skipped:', error);
  }
}

export async function generateSinglePiece(ctx: ContentContext, piece: ContentPiece): Promise<string> {
  let prompt: string;

  switch (piece.type) {
    case 'blog-post':
      prompt = buildBlogPostPrompt(ctx, piece);
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

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
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

/**
 * Entry point that switches between v1 and v2 based on AGENT_V2 env var.
 */
export async function generateContentPiecesAuto(
  calendar: ContentCalendar,
  selectedIds: string[],
  onProgress?: (progress: ContentProgress) => Promise<void>,
): Promise<void> {
  if (process.env.AGENT_V2 === 'true') {
    return generateContentPiecesV2(calendar, selectedIds);
  }
  return generateContentPieces(calendar, selectedIds, onProgress);
}
