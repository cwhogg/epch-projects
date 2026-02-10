import type { AgentConfig, FoundationProgress } from '@/types';
import {
  runAgent,
  resumeAgent,
  getAgentState,
  deleteAgentState,
  saveActiveRun,
  getActiveRunId,
  clearActiveRun,
} from './agent-runtime';
import { createFoundationTools } from './agent-tools/foundation';
import { createPlanTools, createScratchpadTools } from './agent-tools/common';
import { saveFoundationProgress } from './db';
import { CLAUDE_MODEL } from './config';
import type { StrategicInputs } from '@/types';

const FOUNDATION_SYSTEM_PROMPT = `You are a foundation document generation orchestrator. Your job is to generate strategic foundation documents for a product idea by calling tools in the correct order.

GENERATION ORDER (strict):
1. First: Call generate_foundation_doc with docType="strategy"
2. Second: Call generate_foundation_doc with docType="positioning"
3. Then generate these in order (each depends on positioning):
   a. generate_foundation_doc with docType="brand-voice"
   b. generate_foundation_doc with docType="design-principles"
   c. generate_foundation_doc with docType="seo-strategy"
   d. generate_foundation_doc with docType="social-media-strategy"

RULES:
- Call generate_foundation_doc for each document type in order.
- If a tool returns an error about a missing upstream document, skip that doc and move to the next.
- Do NOT narrate or explain. Just call the tools.
- After all documents are generated, end your turn.

If you are resuming from a pause, first call load_foundation_docs to check which documents already exist, then only generate the missing ones.`;

function makeInitialProgress(ideaId: string): FoundationProgress {
  return {
    ideaId,
    status: 'running',
    currentStep: 'Starting foundation generation...',
    docs: {
      'strategy': 'pending',
      'positioning': 'pending',
      'brand-voice': 'pending',
      'design-principles': 'pending',
      'seo-strategy': 'pending',
      'social-media-strategy': 'pending',
    },
  };
}

export async function runFoundationGeneration(
  ideaId: string,
  strategicInputs?: StrategicInputs,
): Promise<void> {
  // Check for a paused run to resume
  const existingRunId = await getActiveRunId('foundation', ideaId);
  let pausedState = existingRunId ? await getAgentState(existingRunId) : null;
  if (pausedState && pausedState.status !== 'paused') {
    pausedState = null;
  }

  const runId = pausedState ? pausedState.runId : `foundation-${ideaId}-${Date.now()}`;
  const isResume = !!pausedState;

  // Progress tracking
  const progress = makeInitialProgress(ideaId);
  progress.status = 'running';
  progress.currentStep = isResume ? 'Resuming foundation generation...' : 'Starting foundation generation...';
  await saveFoundationProgress(ideaId, progress);

  const tools = [
    ...createPlanTools(runId),
    ...createScratchpadTools(),
    ...createFoundationTools(ideaId),
  ];

  const config: AgentConfig = {
    agentId: 'foundation',
    runId,
    model: CLAUDE_MODEL,
    maxTokens: 4096,
    maxTurns: 20,
    tools,
    systemPrompt: FOUNDATION_SYSTEM_PROMPT,
    onProgress: async (step, detail) => {
      console.log(`[foundation] ${step}: ${detail ?? ''}`);

      if (step === 'tool_call' && detail) {
        progress.currentStep = `Generating foundation document...`;
      } else if (step === 'complete') {
        progress.status = 'complete';
        progress.currentStep = 'All foundation documents generated!';
      } else if (step === 'error') {
        progress.status = 'error';
        progress.error = detail;
        progress.currentStep = 'Foundation generation failed';
      }
      await saveFoundationProgress(ideaId, progress);
    },
  };

  // Build initial message
  let initialMessage = `Generate all foundation documents for this idea (ID: ${ideaId}).`;
  if (strategicInputs) {
    const parts: string[] = [];
    if (strategicInputs.differentiation) {
      parts.push(`Differentiation: ${strategicInputs.differentiation}`);
    }
    if (strategicInputs.deliberateTradeoffs) {
      parts.push(`Deliberate tradeoffs: ${strategicInputs.deliberateTradeoffs}`);
    }
    if (strategicInputs.antiTarget) {
      parts.push(`Not targeting: ${strategicInputs.antiTarget}`);
    }
    if (parts.length > 0) {
      initialMessage += `\n\nStrategic inputs from the user:\n${parts.join('\n')}`;
    }
  }

  // Run or resume
  let state;
  if (pausedState) {
    console.log(`[foundation] Resuming paused run ${runId} (resume #${pausedState.resumeCount + 1})`);
    state = await resumeAgent(config, pausedState);
  } else {
    state = await runAgent(config, initialMessage);
  }

  // Handle result
  if (state.status === 'paused') {
    await saveActiveRun('foundation', ideaId, runId);
    throw new Error('AGENT_PAUSED');
  }

  await clearActiveRun('foundation', ideaId);
  await deleteAgentState(runId);

  if (state.status === 'error') {
    throw new Error(state.error || 'Foundation generation failed');
  }
}
