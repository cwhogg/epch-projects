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
import { advisorRegistry } from './advisors/registry';

const PROGRESS_TTL = 7200;

function buildSystemPrompt(recipe: ContentRecipe): string {
  // Build critic list from registry — all advisors with evaluationExpertise
  // (named + potential dynamic selections). The agent uses this for intelligent re-critique.
  const criticsList = advisorRegistry
    .filter((a) => a.evaluationExpertise && a.id !== recipe.authorAdvisor)
    .map((a) => `- ${a.id} (${a.name}): ${a.evaluationExpertise}`)
    .join('\n');

  return `You are a content pipeline orchestrator. Your goal: produce ${recipe.contentType} content that passes the editor quality rubric.

TOOLS AVAILABLE:
- generate_draft: Create initial content using the assigned author advisor
- run_critiques(advisorIds?): Get evaluations from critics (all, or a named subset)
- editor_decision(critiques): Apply mechanical rubric -> returns 'approve' or 'revise' with brief
- revise_draft(brief): Revise current draft addressing the editor's brief
- summarize_round(round, critiques, decision): Record round data, returns do-not-regress list
- save_content(quality): Persist final content
- load_foundation_docs(docTypes?): Load reference documents if needed

EDITOR RUBRIC (you do not override these rules):
- Any high-severity issue -> must revise
- No high issues + avg score >= ${recipe.minAggregateScore} -> approve
- No high issues + avg < ${recipe.minAggregateScore} -> revise
- Scores decreasing from previous round -> approve (oscillation guard)

CONSTRAINTS:
- Maximum ${recipe.maxRevisionRounds} revision rounds
- Always call summarize_round after each critique+decision cycle
- Always call editor_decision with critique results -- do not self-judge quality, even if all critics errored (pass the results as-is)
- After max rounds without approval: save_content(quality='max-rounds-reached')

AVAILABLE CRITICS:
${criticsList}

You decide the sequence. Typical approaches include drafting then running all critics, or targeted re-critique of specific dimensions after revision. Use your judgment about which critics to re-run based on what you changed.`;
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
