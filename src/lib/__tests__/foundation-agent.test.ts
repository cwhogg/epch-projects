import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the agent runtime
const mockRunAgent = vi.fn();
const mockResumeAgent = vi.fn();
const mockGetAgentState = vi.fn();
const mockDeleteAgentState = vi.fn();
const mockSaveActiveRun = vi.fn();
const mockGetActiveRunId = vi.fn();
const mockClearActiveRun = vi.fn();

vi.mock('@/lib/agent-runtime', () => ({
  runAgent: (...args: unknown[]) => mockRunAgent(...args),
  resumeAgent: (...args: unknown[]) => mockResumeAgent(...args),
  getAgentState: (...args: unknown[]) => mockGetAgentState(...args),
  deleteAgentState: (...args: unknown[]) => mockDeleteAgentState(...args),
  saveActiveRun: (...args: unknown[]) => mockSaveActiveRun(...args),
  getActiveRunId: (...args: unknown[]) => mockGetActiveRunId(...args),
  clearActiveRun: (...args: unknown[]) => mockClearActiveRun(...args),
}));

// Mock db
vi.mock('@/lib/db', () => ({
  saveFoundationProgress: vi.fn(),
  getFoundationProgress: vi.fn(),
  getIdeaFromDb: vi.fn().mockResolvedValue({ id: 'idea-123', name: 'TestApp' }),
}));

// Mock agent tools
vi.mock('@/lib/agent-tools/foundation', () => ({
  createFoundationTools: vi.fn().mockReturnValue([]),
}));
vi.mock('@/lib/agent-tools/common', () => ({
  createPlanTools: vi.fn().mockReturnValue([]),
  createScratchpadTools: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/config', () => ({
  CLAUDE_MODEL: 'claude-test-model',
}));

import { runFoundationGeneration } from '@/lib/foundation-agent';
import { saveFoundationProgress } from '@/lib/db';

describe('Foundation generation orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveRunId.mockResolvedValue(null);
  });

  it('starts a new agent run when no paused run exists', async () => {
    mockRunAgent.mockResolvedValue({ status: 'complete', runId: 'test-run' });

    await runFoundationGeneration('idea-123');

    expect(mockRunAgent).toHaveBeenCalledTimes(1);
    const config = mockRunAgent.mock.calls[0][0];
    expect(config.agentId).toBe('foundation');
    expect(config.systemPrompt).toContain('foundation document');
  });

  it('resumes a paused run when one exists', async () => {
    const pausedState = {
      runId: 'paused-run',
      status: 'paused',
      resumeCount: 0,
    };
    mockGetActiveRunId.mockResolvedValue('paused-run');
    mockGetAgentState.mockResolvedValue(pausedState);
    mockResumeAgent.mockResolvedValue({ status: 'complete', runId: 'paused-run' });

    await runFoundationGeneration('idea-123');

    expect(mockResumeAgent).toHaveBeenCalledTimes(1);
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it('throws AGENT_PAUSED when agent pauses', async () => {
    mockRunAgent.mockResolvedValue({ status: 'paused', runId: 'test-run' });

    await expect(runFoundationGeneration('idea-123')).rejects.toThrow('AGENT_PAUSED');
    expect(mockSaveActiveRun).toHaveBeenCalledWith('foundation', 'idea-123', expect.any(String));
  });

  it('clears active run on completion', async () => {
    mockRunAgent.mockResolvedValue({ status: 'complete', runId: 'test-run' });

    await runFoundationGeneration('idea-123');

    expect(mockClearActiveRun).toHaveBeenCalledWith('foundation', 'idea-123');
    expect(mockDeleteAgentState).toHaveBeenCalled();
  });

  it('saves progress during run', async () => {
    mockRunAgent.mockResolvedValue({ status: 'complete', runId: 'test-run' });

    await runFoundationGeneration('idea-123');

    expect(saveFoundationProgress).toHaveBeenCalled();
  });

  it('throws on agent error', async () => {
    mockRunAgent.mockResolvedValue({ status: 'error', runId: 'test-run', error: 'Something broke' });

    await expect(runFoundationGeneration('idea-123')).rejects.toThrow('Something broke');
  });
});
