import type { AgentConfig, PipelineProgress } from '@/types';
import {
  runAgent,
  resumeAgent,
  getAgentState,
  deleteAgentState,
  saveActiveRun,
  getActiveRunId,
  clearActiveRun,
} from './agent-runtime';
import { createCritiqueTools } from './agent-tools/critique';
import { createPlanTools, createScratchpadTools } from './agent-tools/common';
import { createFoundationTools } from './agent-tools/foundation';
import { getRedis } from './redis';
import { CLAUDE_MODEL } from './config';
import { recipes, type ContentRecipe } from './content-recipes';

const PROGRESS_TTL = 7200;

function buildSystemPrompt(recipe: ContentRecipe): string {
  return `You are a content pipeline orchestrator. You execute a write-critique-revise cycle.

Content type: ${recipe.contentType}
Max revision rounds: ${recipe.maxRevisionRounds}

Your tools: generate_draft, run_critiques, editor_decision, revise_draft, summarize_round, save_content.
You also have load_foundation_docs to load reference documents if needed.

Procedure:
1. Call generate_draft with content context.
2. Call run_critiques.
3. Read the critique results. Apply these rules:
   - ANY high-severity issue -> editor_decision(decision='revise', brief=...)
   - NO high-severity AND avg score >= ${recipe.minAggregateScore} -> editor_decision(decision='approve')
   - NO high-severity BUT avg < ${recipe.minAggregateScore} -> editor_decision(decision='revise')
   - Scores decreasing from previous round -> editor_decision(decision='approve')
4. After editor_decision, call summarize_round with the round data.
5. If revise: call revise_draft with the brief, then back to step 2.
6. If approve: call save_content with quality='approved'.
7. If you've hit ${recipe.maxRevisionRounds} rounds without approval: call save_content with quality='max-rounds-reached'.

When writing revision briefs:
- Focus on HIGH and MEDIUM issues only.
- Include the "do not regress" list from summarize_round output.
- Instruct: "Address only the listed issues. Do not change aspects on the do-not-regress list."

Do NOT narrate your reasoning. Call the tools.`;
}

function makeInitialProgress(
  contentType: string,
  maxRounds: number,
): PipelineProgress {
  return {
    status: 'running',
    contentType,
    currentStep: 'Starting content generation...',
    round: 0,
    maxRounds,
    quality: null,
    selectedCritics: [],
    steps: [
      { name: 'Generate Draft', status: 'pending' },
      { name: 'Run Critiques', status: 'pending' },
      { name: 'Editor Review', status: 'pending' },
      { name: 'Save Content', status: 'pending' },
    ],
    critiqueHistory: [],
  };
}

export async function runContentCritiquePipeline(
  ideaId: string,
  contentType: string,
  contentContext: string,
): Promise<{ runId: string }> {
  const recipe = recipes[contentType];
  if (!recipe) throw new Error(`Unknown content type: ${contentType}`);

  // Check for paused run
  const existingRunId = await getActiveRunId('content-critique', ideaId);
  let pausedState = existingRunId ? await getAgentState(existingRunId) : null;
  if (pausedState && pausedState.status !== 'paused') {
    pausedState = null;
  }

  const runId = pausedState
    ? pausedState.runId
    : `critique-${ideaId}-${Date.now()}`;

  // Initialize progress
  const progress = makeInitialProgress(contentType, recipe.maxRevisionRounds);
  await getRedis().set(
    `pipeline_progress:${runId}`,
    JSON.stringify(progress),
    { ex: PROGRESS_TTL },
  );

  const tools = [
    ...createPlanTools(runId),
    ...createScratchpadTools(),
    ...createFoundationTools(ideaId),
    ...createCritiqueTools(runId, ideaId, recipe),
  ];

  const config: AgentConfig = {
    agentId: 'content-critique',
    runId,
    model: CLAUDE_MODEL,
    maxTokens: 4096,
    maxTurns: 30,
    tools,
    systemPrompt: buildSystemPrompt(recipe),
    onProgress: async (step, detail) => {
      console.log(`[content-critique] ${step}: ${detail ?? ''}`);

      const existing = await getRedis().get<string>(
        `pipeline_progress:${runId}`,
      );
      if (!existing) return;

      const p: PipelineProgress =
        typeof existing === 'string' ? JSON.parse(existing) : existing;

      if (step === 'tool_call' && detail) {
        p.currentStep = detail;
      } else if (step === 'complete') {
        p.status = 'complete';
        p.currentStep = 'Content pipeline complete!';
      } else if (step === 'error') {
        p.status = 'error';
        p.currentStep = detail || 'Pipeline failed';
      }

      await getRedis().set(
        `pipeline_progress:${runId}`,
        JSON.stringify(p),
        { ex: PROGRESS_TTL },
      );
    },
  };

  const initialMessage = `Generate ${contentType} content for idea ${ideaId}.\n\nContent context:\n${contentContext}`;

  let state;
  if (pausedState) {
    console.log(
      `[content-critique] Resuming paused run ${runId} (resume #${pausedState.resumeCount + 1})`,
    );
    state = await resumeAgent(config, pausedState);
  } else {
    state = await runAgent(config, initialMessage);
  }

  if (state.status === 'paused') {
    await saveActiveRun('content-critique', ideaId, runId);
    throw new Error('AGENT_PAUSED');
  }

  await clearActiveRun('content-critique', ideaId);
  await deleteAgentState(runId);

  if (state.status === 'error') {
    throw new Error(state.error || 'Content critique pipeline failed');
  }

  return { runId };
}
