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
  getContentProgress,
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
import { buildExpertiseContext } from './expertise-profile';
import {
  runAgent,
  resumeAgent,
  getAgentState,
  deleteAgentState,
  saveActiveRun,
  getActiveRunId,
  clearActiveRun,
} from './agent-runtime';
import { createContentTools } from './agent-tools/content';
import { createPlanTools, createScratchpadTools } from './agent-tools/common';
import { emitEvent } from './agent-events';
import { parseLLMJson } from './llm-utils';
import type { AgentConfig } from '@/types';

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

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
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

// ---------------------------------------------------------------------------
// V2: Agentic content generation with tool use + evaluate/revise loops
// ---------------------------------------------------------------------------

const CONTENT_SYSTEM_PROMPT = `You are a CONTENT STRATEGIST and EXPERT WRITER for B2B SaaS products.

Your mission: Generate high-quality, SEO-optimized content pieces based on research data.

Your workflow:
1. Create a plan for the content generation session
2. Load the research context to understand keywords, competitors, and content gaps
3. Check for an existing calendar and content
4. If a calendar was just generated, call evaluate_calendar to verify keyword coverage, gap targeting, and type diversity
5. For each piece to generate:
   a. Write the content using write_content_piece
   b. Evaluate it using evaluate_content — check keyword presence, word count, heading structure
   c. If the evaluation reveals issues (score < 7 or pass=false), revise the content with specific fixes
   d. Save the completed piece
6. Finalize by marking the analysis as having content

CALENDAR EVALUATION:
- After plan_content_calendar, ALWAYS call evaluate_calendar
- If keyword coverage is low (many top keywords untargeted), note which keywords are missing
- If content gap coverage is poor, prioritize pieces that target validated SERP gaps
- If type diversity is lacking, consider whether comparisons or FAQs would serve the missing keywords better
- Do NOT regenerate the calendar based on evaluation — just use the insights to inform your writing

QUALITY STANDARDS:
- Every piece must include its target keywords naturally (not stuffed)
- Blog posts: 1500-3000 words, clear H1/H2/H3 hierarchy
- Comparisons: 1500-2500 words, include comparison table, balanced analysis
- FAQs: 2000-3000 words, use real People Also Ask data, schema-friendly Q&A format
- Always include YAML frontmatter with proper metadata
- Be genuinely helpful — don't write generic filler content

REVISION RULES:
- If a piece is missing keywords, revise to incorporate them naturally
- If word count is too low, add more substance (examples, data, actionable advice)
- If heading hierarchy is wrong, fix the H1/H2/H3 structure
- Maximum 1 revision per piece — don't over-iterate`;

async function generateContentPiecesV2(
  calendar: ContentCalendar,
  selectedIds: string[],
): Promise<void> {
  const ideaId = calendar.ideaId;

  // --- Check for a paused run to resume ---
  const existingRunId = await getActiveRunId('content', ideaId);
  let pausedState = existingRunId ? await getAgentState(existingRunId) : null;
  if (pausedState && pausedState.status !== 'paused') {
    pausedState = null;
  }

  const runId = pausedState ? pausedState.runId : `content-${ideaId}-${Date.now()}`;
  const isResume = !!pausedState;

  // Load existing progress on resume, or create fresh
  let progress: ContentProgress;
  if (isResume) {
    const existing = await getContentProgress(ideaId);
    progress = existing || {
      ideaId,
      status: 'running',
      currentStep: 'Resuming content generation...',
      steps: selectedIds.map((id) => {
        const piece = calendar.pieces.find((p) => p.id === id);
        return { name: piece?.title || id, status: 'pending' as const };
      }),
      completedPieceIds: [],
    };
    progress.status = 'running';
    progress.currentStep = 'Resuming content generation...';
  } else {
    progress = {
      ideaId,
      status: 'running',
      currentStep: 'Starting agentic content generation...',
      steps: selectedIds.map((id) => {
        const piece = calendar.pieces.find((p) => p.id === id);
        return { name: piece?.title || id, status: 'pending' as const };
      }),
      completedPieceIds: [],
    };
  }
  await saveContentProgress(ideaId, progress);

  const tools = [
    ...createPlanTools(runId),
    ...createScratchpadTools(),
    ...createContentTools(ideaId),
  ];

  let currentPieceIdx = isResume
    ? (progress.completedPieceIds?.length ?? 0)
    : -1;

  const config: AgentConfig = {
    agentId: 'content',
    runId,
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    maxTurns: selectedIds.length * 6 + 10,
    tools,
    systemPrompt: CONTENT_SYSTEM_PROMPT,
    onProgress: async (step, detail) => {
      console.log(`[content-v2] ${step}: ${detail ?? ''}`);

      if (step === 'tool_call' && detail) {
        const toolNames = detail.split(', ');
        if (toolNames.includes('save_piece') && currentPieceIdx >= 0 && currentPieceIdx < progress.steps.length) {
          progress.steps[currentPieceIdx].status = 'complete';
          if (!progress.completedPieceIds.includes(selectedIds[currentPieceIdx])) {
            progress.completedPieceIds.push(selectedIds[currentPieceIdx]);
          }
          currentPieceIdx++;
          if (currentPieceIdx < progress.steps.length) {
            progress.steps[currentPieceIdx].status = 'running';
            progress.currentStep = `Generating: ${progress.steps[currentPieceIdx].name}`;
          }
          await saveContentProgress(ideaId, progress);
        } else if (toolNames.includes('write_content_piece') && currentPieceIdx < 0) {
          currentPieceIdx = 0;
          progress.steps[0].status = 'running';
          progress.currentStep = `Generating: ${progress.steps[0].name}`;
          await saveContentProgress(ideaId, progress);
        }
      } else if (step === 'complete') {
        for (const s of progress.steps) {
          if (s.status !== 'error') s.status = 'complete';
        }
        progress.status = 'complete';
        progress.currentStep = 'All content generated!';
        await saveContentProgress(ideaId, progress);
      } else if (step === 'error') {
        progress.status = 'error';
        progress.error = detail;
        progress.currentStep = 'Content generation failed';
        await saveContentProgress(ideaId, progress);
      }
    },
  };

  // --- Run or resume ---
  let state;
  if (pausedState) {
    console.log(`[content-v2] Resuming paused run ${runId} (resume #${pausedState.resumeCount + 1})`);
    state = await resumeAgent(config, pausedState);
  } else {
    const pieceList = selectedIds.map((id) => {
      const piece = calendar.pieces.find((p) => p.id === id);
      return piece ? `- ${piece.id}: "${piece.title}" (${piece.type}, keywords: ${piece.targetKeywords.join(', ')})` : `- ${id}`;
    }).join('\n');

    const initialMessage = `Generate the following content pieces for idea "${calendar.ideaName}":

${pieceList}

For each piece:
1. Write it using write_content_piece
2. Evaluate it using evaluate_content
3. If evaluation score < 7 or pass is false, revise it using revise_content with specific fixes
4. Save it using save_piece

Start by loading the research context, then create a plan, then work through each piece.
After all pieces are saved, call finalize_content_generation.`;

    state = await runAgent(config, initialMessage);
  }

  // --- Handle result ---
  if (state.status === 'paused') {
    await saveActiveRun('content', ideaId, runId);
    throw new Error('AGENT_PAUSED');
  }

  await clearActiveRun('content', ideaId);
  await deleteAgentState(runId);

  if (state.status === 'error') {
    throw new Error(state.error || 'Content agent failed');
  }

  // Emit event
  await emitEvent({
    type: 'content_generated',
    agentId: 'content',
    ideaId,
    timestamp: new Date().toISOString(),
    payload: { pieceCount: selectedIds.length },
  });
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
