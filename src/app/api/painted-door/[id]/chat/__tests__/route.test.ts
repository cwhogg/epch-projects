import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
const mockStream = {
  [Symbol.asyncIterator]: vi.fn(),
};

const mockMessagesStream = vi.fn().mockReturnValue(mockStream);

vi.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({ messages: { stream: mockMessagesStream } }),
}));

vi.mock('@/lib/config', () => ({
  CLAUDE_MODEL: 'claude-test-model',
}));

vi.mock('@/lib/advisors/prompt-loader', () => ({
  getAdvisorSystemPrompt: vi.fn().mockReturnValue('You are Julian Shapiro, The Growth Writer.'),
}));

vi.mock('@/lib/frameworks/framework-loader', () => ({
  getFrameworkPrompt: vi.fn().mockReturnValue('## Landing Page Assembly\nPhase 1: Extract...'),
}));

vi.mock('@/lib/db', () => ({
  getIdeaFromDb: vi.fn().mockResolvedValue({
    id: 'idea-1',
    name: 'Test Product',
    description: 'A test product',
    targetUser: 'developers',
    problemSolved: 'testing',
  }),
  getAllFoundationDocs: vi.fn().mockResolvedValue({
    strategy: { type: 'strategy', content: 'Strategy content', generatedAt: '2026-02-17' },
    positioning: { type: 'positioning', content: 'Positioning content', generatedAt: '2026-02-17' },
    'brand-voice': { type: 'brand-voice', content: 'Brand voice content', generatedAt: '2026-02-17' },
    'design-principles': { type: 'design-principles', content: 'Design principles content', generatedAt: '2026-02-17' },
    'seo-strategy': { type: 'seo-strategy', content: 'SEO strategy content', generatedAt: '2026-02-17' },
  }),
}));

vi.mock('@/lib/content-context', () => ({
  buildContentContext: vi.fn().mockResolvedValue({
    ideaName: 'Test Product',
    ideaDescription: 'A test product',
    targetUser: 'developers',
    problemSolved: 'testing',
    topKeywords: [{ keyword: 'testing tool', intentType: 'commercial' }],
    competitors: 'Competitor A, Competitor B',
  }),
}));

vi.mock('@/lib/painted-door-db', () => ({
  getBuildSession: vi.fn().mockResolvedValue(null),
  saveBuildSession: vi.fn(),
  getConversationHistory: vi.fn().mockResolvedValue([]),
  saveConversationHistory: vi.fn(),
  getPaintedDoorSite: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/advisors/registry', () => ({
  advisorRegistry: [
    { id: 'oli-gardner', name: 'Oli Gardner', role: 'critic', evaluationExpertise: 'Conversion' },
    { id: 'joanna-wiebe', name: 'Joanna Wiebe', role: 'critic', evaluationExpertise: 'Copy' },
    { id: 'shirin-oreizy', name: 'Shirin Oreizy', role: 'critic', evaluationExpertise: 'Behavioral' },
  ],
}));

vi.mock('@/lib/agent-tools/website', () => ({
  createWebsiteTools: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/agent-tools/website-chat', () => ({
  createConsultAdvisorTool: vi.fn().mockReturnValue({
    name: 'consult_advisor',
    description: 'mock',
    input_schema: { type: 'object', properties: {}, required: [] },
    execute: vi.fn(),
  }),
}));

// Import after mocks
import { assembleSystemPrompt } from '../route';

describe('assembleSystemPrompt', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes Julian Shapiro advisor prompt', async () => {
    const prompt = await assembleSystemPrompt('idea-1', 'interactive');
    expect(prompt).toContain('Julian Shapiro');
  });

  it('includes Landing Page Assembly framework', async () => {
    const prompt = await assembleSystemPrompt('idea-1', 'interactive');
    expect(prompt).toContain('Landing Page Assembly');
  });

  it('includes all foundation documents', async () => {
    const prompt = await assembleSystemPrompt('idea-1', 'interactive');
    expect(prompt).toContain('Strategy content');
    expect(prompt).toContain('Positioning content');
    expect(prompt).toContain('Brand voice content');
    expect(prompt).toContain('Design principles content');
    expect(prompt).toContain('SEO strategy content');
  });

  it('includes idea analysis context', async () => {
    const prompt = await assembleSystemPrompt('idea-1', 'interactive');
    expect(prompt).toContain('Test Product');
    expect(prompt).toContain('developers');
  });

  it('includes mode instruction for interactive', async () => {
    const prompt = await assembleSystemPrompt('idea-1', 'interactive');
    expect(prompt).toContain('checkpoint');
    expect(prompt).toContain('pause');
  });

  it('includes mode instruction for autonomous', async () => {
    const prompt = await assembleSystemPrompt('idea-1', 'autonomous');
    expect(prompt).not.toContain('pause');
    expect(prompt).toContain('narrat');
  });

  it('includes available advisor roster', async () => {
    const prompt = await assembleSystemPrompt('idea-1', 'interactive');
    expect(prompt).toContain('oli-gardner');
    expect(prompt).toContain('Conversion');
  });

  it('degrades gracefully when foundation docs are missing', async () => {
    const { getAllFoundationDocs } = await import('@/lib/db');
    (getAllFoundationDocs as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const prompt = await assembleSystemPrompt('idea-1', 'interactive');
    expect(prompt).toContain('Julian Shapiro');
    expect(prompt).toContain('No foundation documents');
  });
});

import { POST } from '../route';

// Helper to read a streaming response to completion
async function readStream(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

describe('POST /api/painted-door/[id]/chat', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 for missing type field', async () => {
    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    expect(response.status).toBe(400);
  });

  it('returns 404 for unknown idea', async () => {
    const { getIdeaFromDb } = await import('@/lib/db');
    (getIdeaFromDb as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'mode_select', mode: 'interactive' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    expect(response.status).toBe(404);
  });

  it('creates build session on mode_select', async () => {
    // Restore idea mock
    const { getIdeaFromDb } = await import('@/lib/db');
    (getIdeaFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'idea-1', name: 'Test', description: 'Test', targetUser: 'devs', problemSolved: 'testing',
    });

    // getBuildSession returns session after save
    const { getBuildSession, saveBuildSession } = await import('@/lib/painted-door-db');
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ideaId: 'idea-1',
      mode: 'interactive',
      currentStep: 0,
      steps: [{ name: 'Extract Ingredients', status: 'pending' }],
      artifacts: {},
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });

    // Mock streaming to immediately yield then close
    const finalMsg = {
      content: [{ type: 'text', text: 'Hello!' }],
      stop_reason: 'end_turn',
    };
    const events = (async function* () {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello!' } };
    })();
    mockMessagesStream.mockReturnValue({
      [Symbol.asyncIterator]: () => events,
      finalMessage: () => Promise.resolve(finalMsg),
    });

    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'mode_select', mode: 'interactive' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(saveBuildSession).toHaveBeenCalled();
  });

  it('returns 400 for mode_select without mode', async () => {
    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'mode_select' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    expect(response.status).toBe(400);
  });

  it('handles request body parse failure', async () => {
    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    expect(response.status).toBe(400);
  });
});

describe('Agent loop with tool execution', () => {
  beforeEach(() => vi.clearAllMocks());

  it('appends stream end signal as final JSON line', async () => {
    // Restore default mocks
    const { getIdeaFromDb } = await import('@/lib/db');
    (getIdeaFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'idea-1', name: 'Test', description: 'Test', targetUser: 'devs', problemSolved: 'testing',
    });

    const { getBuildSession } = await import('@/lib/painted-door-db');
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ideaId: 'idea-1',
      mode: 'interactive',
      currentStep: 0,
      steps: [{ name: 'Extract Ingredients', status: 'active' }],
      artifacts: {},
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });

    const finalMsg = {
      content: [{ type: 'text', text: 'Work done.' }],
      stop_reason: 'end_turn',
    };
    const events = (async function* () {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Work done.' } };
    })();
    mockMessagesStream.mockReturnValue({
      [Symbol.asyncIterator]: () => events,
      finalMessage: () => Promise.resolve(finalMsg),
    });

    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'user', content: 'Looks good, continue' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    const text = await readStream(response);

    // Should contain the text content
    expect(text).toContain('Work done.');
    // Should end with a __SIGNAL__ line
    expect(text).toContain('__SIGNAL__:');
    const signalMatch = text.match(/__SIGNAL__:(.+)$/);
    expect(signalMatch).not.toBeNull();
    const signal = JSON.parse(signalMatch![1]);
    expect(signal).toHaveProperty('action');
  });

  it('executes tool calls and continues the loop', async () => {
    const { getIdeaFromDb } = await import('@/lib/db');
    (getIdeaFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'idea-1', name: 'Test', description: 'Test', targetUser: 'devs', problemSolved: 'testing',
    });

    const { getBuildSession } = await import('@/lib/painted-door-db');
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ideaId: 'idea-1',
      mode: 'autonomous',
      currentStep: 0,
      steps: [{ name: 'Extract Ingredients', status: 'active' }],
      artifacts: {},
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });

    // Mock the consult_advisor tool to verify it gets called
    const { createConsultAdvisorTool } = await import('@/lib/agent-tools/website-chat');
    const mockExecute = vi.fn().mockResolvedValue('Advisor says: great hero copy!');
    (createConsultAdvisorTool as ReturnType<typeof vi.fn>).mockReturnValue({
      name: 'consult_advisor',
      description: 'mock',
      input_schema: { type: 'object', properties: {}, required: [] },
      execute: mockExecute,
    });

    // First round: model returns text + tool_use
    const firstFinalMsg = {
      content: [
        { type: 'text', text: 'Let me consult an advisor.' },
        { type: 'tool_use', id: 'tool-1', name: 'consult_advisor', input: { advisorId: 'oli-gardner', question: 'Review hero' } },
      ],
      stop_reason: 'tool_use',
    };
    const firstEvents = (async function* () {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Let me consult an advisor.' } };
    })();

    // Second round: model returns text only (done)
    const secondFinalMsg = {
      content: [{ type: 'text', text: ' The advisor recommends improvements.' }],
      stop_reason: 'end_turn',
    };
    const secondEvents = (async function* () {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: ' The advisor recommends improvements.' } };
    })();

    let callCount = 0;
    mockMessagesStream.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          [Symbol.asyncIterator]: () => firstEvents,
          finalMessage: () => Promise.resolve(firstFinalMsg),
        };
      }
      return {
        [Symbol.asyncIterator]: () => secondEvents,
        finalMessage: () => Promise.resolve(secondFinalMsg),
      };
    });

    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'user', content: 'Start building' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    const text = await readStream(response);

    // Verify tool was executed
    expect(mockExecute).toHaveBeenCalledWith({ advisorId: 'oli-gardner', question: 'Review hero' });
    // Verify both rounds of text are present
    expect(text).toContain('Let me consult an advisor.');
    expect(text).toContain('The advisor recommends improvements.');
    // Verify stream called twice (two rounds of the agent loop)
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
  });

  it('emits checkpoint signal for interactive mode at checkpoint step', async () => {
    const { getIdeaFromDb } = await import('@/lib/db');
    (getIdeaFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'idea-1', name: 'Test', description: 'Test', targetUser: 'devs', problemSolved: 'testing',
    });

    const { getBuildSession } = await import('@/lib/painted-door-db');
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ideaId: 'idea-1',
      mode: 'interactive',
      currentStep: 0, // Step 0 = Extract Ingredients, which IS a checkpoint
      steps: [{ name: 'Extract Ingredients', status: 'active' }],
      artifacts: {},
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });

    const finalMsg = {
      content: [{ type: 'text', text: 'Here are the ingredients.' }],
      stop_reason: 'end_turn',
    };
    const events = (async function* () {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Here are the ingredients.' } };
    })();
    mockMessagesStream.mockReturnValue({
      [Symbol.asyncIterator]: () => events,
      finalMessage: () => Promise.resolve(finalMsg),
    });

    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'user', content: 'Extract ingredients' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    const text = await readStream(response);

    const signalMatch = text.match(/__SIGNAL__:(.+)$/);
    expect(signalMatch).not.toBeNull();
    const signal = JSON.parse(signalMatch![1]);
    expect(signal.action).toBe('checkpoint');
    expect(signal.step).toBe(0);
  });

  it('emits continue signal for autonomous mode', async () => {
    const { getIdeaFromDb } = await import('@/lib/db');
    (getIdeaFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'idea-1', name: 'Test', description: 'Test', targetUser: 'devs', problemSolved: 'testing',
    });

    const { getBuildSession } = await import('@/lib/painted-door-db');
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ideaId: 'idea-1',
      mode: 'autonomous',
      currentStep: 0,
      steps: [{ name: 'Extract Ingredients', status: 'active' }],
      artifacts: {},
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });

    const finalMsg = {
      content: [{ type: 'text', text: 'Done with ingredients.' }],
      stop_reason: 'end_turn',
    };
    const events = (async function* () {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Done with ingredients.' } };
    })();
    mockMessagesStream.mockReturnValue({
      [Symbol.asyncIterator]: () => events,
      finalMessage: () => Promise.resolve(finalMsg),
    });

    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'user', content: 'Go' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    const text = await readStream(response);

    const signalMatch = text.match(/__SIGNAL__:(.+)$/);
    expect(signalMatch).not.toBeNull();
    const signal = JSON.parse(signalMatch![1]);
    expect(signal.action).toBe('continue');
  });

  it('handles Anthropic API failure in stream gracefully', async () => {
    const { getIdeaFromDb } = await import('@/lib/db');
    (getIdeaFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'idea-1', name: 'Test', description: 'Test', targetUser: 'devs', problemSolved: 'testing',
    });

    const { getBuildSession } = await import('@/lib/painted-door-db');
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ideaId: 'idea-1',
      mode: 'interactive',
      currentStep: 0,
      steps: [{ name: 'Extract Ingredients', status: 'active' }],
      artifacts: {},
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });

    // Stream that throws an error
    const events = (async function* () {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Starting...' } };
      throw new Error('API rate limit exceeded');
    })();
    mockMessagesStream.mockReturnValue({
      [Symbol.asyncIterator]: () => events,
      finalMessage: () => Promise.reject(new Error('API rate limit exceeded')),
    });

    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'user', content: 'Start' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    // Stream should still return 200 (streaming already started)
    expect(response.status).toBe(200);
    // Reading the stream should eventually encounter the error or partial content
    try {
      await readStream(response);
    } catch {
      // Expected — stream error propagates
    }
  });
});
