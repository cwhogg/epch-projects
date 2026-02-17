import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentConfig, AgentState } from '@/types';

// ---------------------------------------------------------------------------
// Mock Redis at the lowest level
// ---------------------------------------------------------------------------
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();

vi.mock('@upstash/redis', () => {
  return {
    Redis: class MockRedis {
      get = mockRedisGet;
      set = mockRedisSet;
      del = mockRedisDel;
    },
  };
});

// Mock Anthropic — runAgent/resumeAgent call it internally.
const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
}));

// Set env vars for Redis
process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

// Import after mocks
const { runAgentLifecycle } = await import('@/lib/agent-runtime');

function makeBaseConfig(): AgentConfig {
  return {
    agentId: 'test',
    runId: '',
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 4096,
    maxTurns: 10,
    tools: [],
    systemPrompt: 'test system prompt',
    onProgress: vi.fn(),
  };
}

describe('runAgentLifecycle', () => {
  const makeConfig = vi.fn<(runId: string, isResume: boolean, pausedState: AgentState | null) => AgentConfig>();
  const makeInitialMessage = vi.fn<() => string>();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing active run
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockRedisDel.mockResolvedValue(1);
    makeInitialMessage.mockReturnValue('Do the thing.');

    // Default: Anthropic returns a simple end_turn response (agent completes in 1 turn)
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Done.' }],
      stop_reason: 'end_turn',
    });
  });

  it('runs a fresh agent when no paused state exists', async () => {
    const config = makeBaseConfig();
    makeConfig.mockReturnValue(config);

    const result = await runAgentLifecycle('test', 'entity-1', makeConfig, makeInitialMessage);

    // Should have checked for active run (Redis get for active_run:test:entity-1)
    expect(mockRedisGet).toHaveBeenCalledWith('active_run:test:entity-1');
    // makeConfig called with fresh runId, not resume
    expect(makeConfig).toHaveBeenCalledWith(expect.stringContaining('test-entity-1-'), false, null);
    expect(makeInitialMessage).toHaveBeenCalled();
    // Agent completed
    expect(result.status).toBe('complete');
    // Cleanup: clearActiveRun + deleteAgentState
    expect(mockRedisDel).toHaveBeenCalled();
  });

  it('resumes a paused agent when paused state exists', async () => {
    const pausedState: AgentState = {
      runId: 'paused-run-1',
      agentId: 'test',
      messages: [{ role: 'user', content: 'Do the thing.' }],
      turnCount: 5,
      status: 'paused',
      plan: [],
      startedAt: new Date().toISOString(),
      resumeCount: 1,
    };

    // First get: active_run key returns runId
    // Second get: agent_state key returns paused state
    mockRedisGet
      .mockResolvedValueOnce('paused-run-1')               // getActiveRunId
      .mockResolvedValueOnce(JSON.stringify(pausedState));  // getAgentState

    const config = makeBaseConfig();
    config.runId = 'paused-run-1';
    makeConfig.mockReturnValue(config);

    const result = await runAgentLifecycle('test', 'entity-1', makeConfig, makeInitialMessage);

    // makeConfig called with paused runId, isResume=true, paused state
    // Note: resumeAgent mutates the state object, so we check key fields
    expect(makeConfig).toHaveBeenCalledWith('paused-run-1', true, expect.objectContaining({
      runId: 'paused-run-1',
      agentId: 'test',
      status: expect.any(String), // may have been mutated by resumeAgent
    }));
    // makeInitialMessage should NOT be called for resume
    expect(makeInitialMessage).not.toHaveBeenCalled();
    // Agent completed after resume
    expect(result.status).toBe('complete');
  });

  it('throws AGENT_PAUSED and saves active run when agent pauses', async () => {
    const originalDateNow = Date.now;
    let callCount = 0;
    // The agent loop calls Date.now() once for loopStart, then once per iteration.
    // We need: loopStart=0, first iteration check passes (< budget), first API call
    // returns tool_use, second iteration check fails (> budget) → pause.
    Date.now = () => {
      callCount++;
      // Call 1: loopStart → 0
      // Call 2: first loop iteration time check → still within budget
      // Call 3: second loop iteration time check → beyond budget → pause
      if (callCount <= 2) return 0;
      return 300_000; // Beyond TIME_BUDGET_MS (270s)
    };

    const config = makeBaseConfig();
    config.maxTurns = 10;
    makeConfig.mockReturnValue(config);

    // First API call returns tool_use so the loop continues to a second iteration
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'call_1', name: 'fake', input: {} }],
      stop_reason: 'tool_use',
    });

    try {
      await expect(
        runAgentLifecycle('test', 'entity-1', makeConfig, makeInitialMessage),
      ).rejects.toThrow('AGENT_PAUSED');

      // saveActiveRun should have been called (Redis set for active_run key)
      const activeRunSetCalls = mockRedisSet.mock.calls.filter(
        (call) => typeof call[0] === 'string' && (call[0] as string).startsWith('active_run:'),
      );
      expect(activeRunSetCalls.length).toBeGreaterThan(0);
    } finally {
      Date.now = originalDateNow;
    }
  });

  it('throws the agent error when status is error', async () => {
    const config = makeBaseConfig();
    config.maxTurns = 1;
    makeConfig.mockReturnValue(config);

    // Return tool_use so agent doesn't end_turn — it will exceed maxTurns
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'call_1', name: 'fake', input: {} }],
      stop_reason: 'tool_use',
    });

    await expect(
      runAgentLifecycle('test', 'entity-1', makeConfig, makeInitialMessage),
    ).rejects.toThrow('Exceeded max turns');

    // Cleanup should still happen
    expect(mockRedisDel).toHaveBeenCalled();
  });

  it('ignores non-paused existing state and starts fresh', async () => {
    const completedOldState: AgentState = {
      runId: 'old-run',
      agentId: 'test',
      messages: [],
      turnCount: 3,
      status: 'complete', // Not paused
      plan: [],
      startedAt: new Date().toISOString(),
      resumeCount: 0,
    };

    mockRedisGet
      .mockResolvedValueOnce('old-run')                        // getActiveRunId
      .mockResolvedValueOnce(JSON.stringify(completedOldState)); // getAgentState

    const config = makeBaseConfig();
    makeConfig.mockReturnValue(config);

    const result = await runAgentLifecycle('test', 'entity-1', makeConfig, makeInitialMessage);

    // Should have started fresh
    expect(makeConfig).toHaveBeenCalledWith(expect.stringContaining('test-entity-1-'), false, null);
    expect(makeInitialMessage).toHaveBeenCalled();
    expect(result.status).toBe('complete');
  });

  // Error path tests
  it('propagates error when Redis rejects on getActiveRunId', async () => {
    mockRedisGet.mockRejectedValue(new Error('Redis connection failed'));
    makeConfig.mockReturnValue(makeBaseConfig());

    await expect(
      runAgentLifecycle('test', 'entity-1', makeConfig, makeInitialMessage),
    ).rejects.toThrow('Redis connection failed');
  });

  it('propagates error when Anthropic API rejects', async () => {
    mockMessagesCreate.mockRejectedValue(new Error('Anthropic API down'));

    const config = makeBaseConfig();
    makeConfig.mockReturnValue(config);

    // The agent loop catches the error and sets state.status='error'
    // runAgentLifecycle then throws with that error message
    await expect(
      runAgentLifecycle('test', 'entity-1', makeConfig, makeInitialMessage),
    ).rejects.toThrow('Anthropic API down');
  });
});
