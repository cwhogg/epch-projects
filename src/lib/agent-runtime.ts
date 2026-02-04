import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';
import type {
  AgentConfig,
  AgentState,
  AgentMessage,
  AgentContentBlock,
  ToolDefinition,
} from '@/types';

// ---------------------------------------------------------------------------
// Redis singleton (same pattern as other modules)
// ---------------------------------------------------------------------------

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error('Redis not configured: missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
    }
    redis = new Redis({ url, token });
  }
  return redis;
}

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

const STATE_TTL = 7200; // 2 hours — longer than old 1hr to survive multiple resumes

function stateKey(runId: string): string {
  return `agent_state:${runId}`;
}

export async function saveAgentState(state: AgentState): Promise<void> {
  await getRedis().set(stateKey(state.runId), JSON.stringify(state), { ex: STATE_TTL });
}

export async function getAgentState(runId: string): Promise<AgentState | null> {
  const data = await getRedis().get(stateKey(runId));
  if (!data) return null;
  if (typeof data === 'string') return JSON.parse(data) as AgentState;
  return data as AgentState;
}

export async function deleteAgentState(runId: string): Promise<void> {
  await getRedis().del(stateKey(runId));
}

// ---------------------------------------------------------------------------
// Active run tracking — maps agentId:entityId → runId
// ---------------------------------------------------------------------------

function activeRunKey(agentId: string, entityId: string): string {
  return `active_run:${agentId}:${entityId}`;
}

/**
 * Record that this agent+entity has an active (running/paused) run.
 * Used so the next invocation can find and resume a paused run.
 */
export async function saveActiveRun(agentId: string, entityId: string, runId: string): Promise<void> {
  await getRedis().set(activeRunKey(agentId, entityId), runId, { ex: STATE_TTL });
}

/**
 * Get the runId for an active run (if any).
 */
export async function getActiveRunId(agentId: string, entityId: string): Promise<string | null> {
  const data = await getRedis().get(activeRunKey(agentId, entityId));
  if (!data) return null;
  return typeof data === 'string' ? data : String(data);
}

/**
 * Clear the active run mapping. Call this when the agent completes or errors.
 */
export async function clearActiveRun(agentId: string, entityId: string): Promise<void> {
  await getRedis().del(activeRunKey(agentId, entityId));
}

// ---------------------------------------------------------------------------
// Anthropic client
// ---------------------------------------------------------------------------

let anthropicClient: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
  }
  return anthropicClient;
}

// ---------------------------------------------------------------------------
// Convert our ToolDefinition[] to Anthropic API tool format
// ---------------------------------------------------------------------------

function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Messages.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Messages.Tool.InputSchema,
  }));
}

// ---------------------------------------------------------------------------
// Build a tool lookup map
// ---------------------------------------------------------------------------

function buildToolMap(tools: ToolDefinition[]): Map<string, ToolDefinition> {
  const map = new Map<string, ToolDefinition>();
  for (const t of tools) map.set(t.name, t);
  return map;
}

// ---------------------------------------------------------------------------
// Execute tool calls from an assistant response
// ---------------------------------------------------------------------------

async function executeToolCalls(
  toolUseBlocks: Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }>,
  toolMap: Map<string, ToolDefinition>,
): Promise<AgentContentBlock[]> {
  const results = await Promise.all(
    toolUseBlocks.map(async (block) => {
      const tool = toolMap.get(block.name);
      if (!tool) {
        return {
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: JSON.stringify({ error: `Unknown tool: ${block.name}` }),
          is_error: true,
        };
      }
      try {
        const result = await tool.execute(block.input);
        return {
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Tool execution failed';
        return {
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: JSON.stringify({ error: message }),
          is_error: true,
        };
      }
    }),
  );
  return results;
}

// ---------------------------------------------------------------------------
// Extract text content from assistant response
// ---------------------------------------------------------------------------

function extractFinalText(blocks: AgentContentBlock[]): string | undefined {
  const textBlocks = blocks.filter((b): b is { type: 'text'; text: string } => b.type === 'text');
  if (textBlocks.length === 0) return undefined;
  return textBlocks.map((b) => b.text).join('\n');
}

// ---------------------------------------------------------------------------
// Core agent loop
// ---------------------------------------------------------------------------

const MAX_RESUME_COUNT = 5;
const TIME_BUDGET_MS = 270_000; // 270s — 30s safety margin before Vercel's 300s limit

export async function runAgent(
  config: AgentConfig,
  initialMessage: string,
): Promise<AgentState> {
  const state: AgentState = {
    runId: config.runId,
    agentId: config.agentId,
    messages: [{ role: 'user', content: initialMessage }],
    turnCount: 0,
    status: 'running',
    plan: [],
    startedAt: new Date().toISOString(),
    resumeCount: 0,
  };

  return agentLoop(config, state);
}

export async function resumeAgent(
  config: AgentConfig,
  state: AgentState,
): Promise<AgentState> {
  if (state.resumeCount >= MAX_RESUME_COUNT) {
    state.status = 'error';
    state.error = `Max resume count (${MAX_RESUME_COUNT}) exceeded`;
    await saveAgentState(state);
    return state;
  }

  state.status = 'running';
  state.resumeCount += 1;
  return agentLoop(config, state);
}

async function agentLoop(
  config: AgentConfig,
  state: AgentState,
): Promise<AgentState> {
  const anthropic = getAnthropic();
  const toolMap = buildToolMap(config.tools);
  const anthropicTools = toAnthropicTools(config.tools);
  const loopStart = Date.now();

  try {
    while (state.turnCount < config.maxTurns) {
      // --- Time budget check ---
      if (Date.now() - loopStart > TIME_BUDGET_MS) {
        state.status = 'paused';
        await saveAgentState(state);
        await config.onProgress('paused', 'Time budget reached, will resume');
        return state;
      }

      // --- Call Claude ---
      const response = await anthropic.messages.create({
        model: config.model,
        max_tokens: config.maxTokens,
        system: config.systemPrompt,
        tools: anthropicTools,
        messages: state.messages as Anthropic.Messages.MessageParam[],
      });

      state.turnCount += 1;

      // --- Parse response into our serializable format ---
      const assistantBlocks: AgentContentBlock[] = response.content.map((block) => {
        if (block.type === 'text') {
          return { type: 'text' as const, text: block.text };
        }
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          };
        }
        // Shouldn't happen, but handle gracefully
        return { type: 'text' as const, text: '' };
      });

      const assistantMessage: AgentMessage = { role: 'assistant', content: assistantBlocks };
      state.messages.push(assistantMessage);

      // --- Check stop reason ---
      if (response.stop_reason === 'end_turn') {
        // No tool calls — agent is done
        state.status = 'complete';
        state.finalOutput = extractFinalText(assistantBlocks);
        await saveAgentState(state);
        await config.onProgress('complete', state.finalOutput?.slice(0, 200));
        return state;
      }

      // --- Extract and execute tool calls ---
      const toolUseBlocks = assistantBlocks.filter(
        (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
          b.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0) {
        // No tool calls and not end_turn — treat as complete
        state.status = 'complete';
        state.finalOutput = extractFinalText(assistantBlocks);
        await saveAgentState(state);
        return state;
      }

      // Fire progress for each tool being called
      state.lastToolCall = toolUseBlocks.map((b) => b.name).join(', ');
      await config.onProgress(
        'tool_call',
        state.lastToolCall,
      );

      // Execute all tool calls (parallel if multiple)
      const toolResults = await executeToolCalls(toolUseBlocks, toolMap);

      // Add tool results as a user message (Anthropic API format)
      const toolResultMessage: AgentMessage = { role: 'user', content: toolResults };
      state.messages.push(toolResultMessage);

      // --- Checkpoint after every turn ---
      await saveAgentState(state);
    }

    // Hit max turns
    state.status = 'error';
    state.error = `Exceeded max turns (${config.maxTurns})`;
    await saveAgentState(state);
    await config.onProgress('error', state.error);
    return state;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    state.status = 'error';
    state.error = message;
    await saveAgentState(state);
    await config.onProgress('error', message);
    return state;
  }
}
