import { ContentCalendar, ContentProgress } from '@/types';
import {
  saveContentProgress,
  getContentProgress,
} from './db';
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
import { CLAUDE_MODEL } from './config';
import type { AgentConfig } from '@/types';

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

export async function generateContentPiecesV2(
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
    model: CLAUDE_MODEL,
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
