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
import type { BuildSession } from '@/types';

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

describe('Integration: full chat flow', () => {
  beforeEach(() => vi.clearAllMocks());

  async function setupDefaultMocks() {
    const { getIdeaFromDb } = await import('@/lib/db');
    (getIdeaFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'idea-1', name: 'Test', description: 'Test', targetUser: 'devs', problemSolved: 'testing',
    });
  }

  function mockStreamResponse(text: string) {
    const finalMsg = {
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
    };
    const events = (async function* () {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
    })();
    mockMessagesStream.mockReturnValue({
      [Symbol.asyncIterator]: () => events,
      finalMessage: () => Promise.resolve(finalMsg),
    });
  }

  function makeRequest(body: object) {
    return new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const paramsPromise = { params: Promise.resolve({ id: 'idea-1' }) };

  it('mode_select creates session and streams Julian intro', async () => {
    await setupDefaultMocks();

    const { getBuildSession, saveBuildSession, saveConversationHistory } = await import('@/lib/painted-door-db');
    // After saveBuildSession, getBuildSession returns the session
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ideaId: 'idea-1',
      mode: 'interactive',
      currentStep: 0,
      steps: [{ name: 'Extract Ingredients', status: 'pending' }],
      artifacts: {},
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });

    mockStreamResponse("I've reviewed your foundation documents. Let's begin with Step 1.");

    const response = await POST(makeRequest({ type: 'mode_select', mode: 'interactive' }), paramsPromise);
    const text = await readStream(response);

    // Session was created
    expect(saveBuildSession).toHaveBeenCalled();
    const savedSession = (saveBuildSession as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(savedSession[0]).toBe('idea-1');
    expect(savedSession[1].mode).toBe('interactive');

    // History was initialized and then saved with assistant response
    expect(saveConversationHistory).toHaveBeenCalled();

    // Stream contains Julian's intro
    expect(text).toContain("I've reviewed your foundation documents");
  });

  it('user message appends to history and streams response', async () => {
    await setupDefaultMocks();

    const { getBuildSession, getConversationHistory, saveConversationHistory } = await import('@/lib/painted-door-db');
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ideaId: 'idea-1',
      mode: 'interactive',
      currentStep: 0,
      steps: [{ name: 'Extract Ingredients', status: 'active' }],
      artifacts: {},
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });

    // Existing conversation history
    (getConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue([
      { role: 'user', content: 'Start building', timestamp: '2026-02-17T00:00:00Z' },
      { role: 'assistant', content: 'Starting ingredients extraction.', timestamp: '2026-02-17T00:01:00Z' },
    ]);

    mockStreamResponse('Here are the refined ingredients based on your feedback.');

    const response = await POST(
      makeRequest({ type: 'user', content: 'Focus more on developer pain points' }),
      paramsPromise,
    );
    const text = await readStream(response);

    // Assistant text is in the stream
    expect(text).toContain('refined ingredients');

    // History was saved with both the new user message and the assistant response
    const saveCalls = (saveConversationHistory as ReturnType<typeof vi.fn>).mock.calls;
    expect(saveCalls.length).toBeGreaterThan(0);
    const lastSavedHistory = saveCalls[saveCalls.length - 1][1];
    // Should have original 2 messages + new user message + new assistant message = 4
    expect(lastSavedHistory).toHaveLength(4);
    expect(lastSavedHistory[2].role).toBe('user');
    expect(lastSavedHistory[2].content).toContain('developer pain points');
    expect(lastSavedHistory[3].role).toBe('assistant');
  });

  it('continue message resumes agent at correct step', async () => {
    await setupDefaultMocks();

    const { getBuildSession, getConversationHistory, saveConversationHistory } = await import('@/lib/painted-door-db');
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ideaId: 'idea-1',
      mode: 'interactive',
      currentStep: 1, // Design Brand Identity step
      steps: [
        { name: 'Extract Ingredients', status: 'complete' },
        { name: 'Design Brand Identity', status: 'pending' },
      ],
      artifacts: { ingredients: 'extracted ingredients' },
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });

    (getConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue([
      { role: 'user', content: 'Start', timestamp: '2026-02-17T00:00:00Z' },
      { role: 'assistant', content: 'Ingredients done.', timestamp: '2026-02-17T00:01:00Z' },
    ]);

    mockStreamResponse('Moving to brand identity design...');

    const response = await POST(
      makeRequest({ type: 'continue', step: 1 }),
      paramsPromise,
    );
    const text = await readStream(response);

    expect(text).toContain('brand identity');

    // The continue message was added to history
    const saveCalls = (saveConversationHistory as ReturnType<typeof vi.fn>).mock.calls;
    const lastSavedHistory = saveCalls[saveCalls.length - 1][1];
    const continueMsg = lastSavedHistory.find(
      (m: { content: string }) => m.content.includes('Continue to the next step')
    );
    expect(continueMsg).toBeDefined();
  });

  it('conversation history persists across requests', async () => {
    await setupDefaultMocks();

    const { getBuildSession, getConversationHistory, saveConversationHistory } = await import('@/lib/painted-door-db');
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ideaId: 'idea-1',
      mode: 'interactive',
      currentStep: 0,
      steps: [{ name: 'Extract Ingredients', status: 'active' }],
      artifacts: {},
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });

    // First request: empty history
    (getConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    mockStreamResponse('First response.');
    const r1 = await POST(makeRequest({ type: 'user', content: 'Message 1' }), paramsPromise);
    await readStream(r1);

    // Get what was saved after first request
    const firstSave = (saveConversationHistory as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(firstSave).toHaveLength(2); // user + assistant

    // Second request: history from first request
    (getConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue([...firstSave]);
    mockStreamResponse('Second response.');
    const r2 = await POST(makeRequest({ type: 'user', content: 'Message 2' }), paramsPromise);
    await readStream(r2);

    // Get what was saved after second request
    const secondSave = (saveConversationHistory as ReturnType<typeof vi.fn>).mock.calls[1][1];
    expect(secondSave).toHaveLength(4); // 2 from first + user + assistant from second
    expect(secondSave[0].content).toBe('Message 1');
    expect(secondSave[1].content).toBe('First response.');
    expect(secondSave[2].content).toBe('Message 2');
    expect(secondSave[3].content).toBe('Second response.');
  });

  it('handles Redis failure during stream gracefully', async () => {
    await setupDefaultMocks();

    const { getBuildSession, getConversationHistory, saveConversationHistory } = await import('@/lib/painted-door-db');
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ideaId: 'idea-1',
      mode: 'autonomous',
      currentStep: 0,
      steps: [{ name: 'Extract Ingredients', status: 'active' }],
      artifacts: {},
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });
    (getConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    // Redis fails on save
    (saveConversationHistory as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Redis connection refused'));

    mockStreamResponse('Some content here.');

    const response = await POST(makeRequest({ type: 'user', content: 'Go' }), paramsPromise);
    // The response starts streaming (200 status set before Redis save)
    expect(response.status).toBe(200);

    // Reading the stream may error due to the Redis failure in the stream controller
    try {
      await readStream(response);
    } catch {
      // Expected — Redis failure propagates through stream error
    }

    // Verify save was attempted
    expect(saveConversationHistory).toHaveBeenCalled();
  });

  it('handles Anthropic API failure gracefully', async () => {
    await setupDefaultMocks();

    const { getBuildSession, getConversationHistory } = await import('@/lib/painted-door-db');
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ideaId: 'idea-1',
      mode: 'interactive',
      currentStep: 0,
      steps: [{ name: 'Extract Ingredients', status: 'active' }],
      artifacts: {},
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });
    (getConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    // Anthropic throws immediately
    const events = (async function* () {
      throw new Error('Service unavailable');
      // eslint-disable-next-line no-unreachable
      yield; // TypeScript requires at least one yield in a generator
    })();
    mockMessagesStream.mockReturnValue({
      [Symbol.asyncIterator]: () => events,
      finalMessage: () => Promise.reject(new Error('Service unavailable')),
    });

    const response = await POST(makeRequest({ type: 'user', content: 'Start' }), paramsPromise);
    expect(response.status).toBe(200); // Status already set before stream starts

    try {
      await readStream(response);
    } catch {
      // Expected — API failure propagates through stream
    }
  });
});

import { advanceSessionStep, determineStreamEndSignal } from '../route';
import { WEBSITE_BUILD_STEPS } from '@/types';

function makeBuildSession(overrides: Partial<BuildSession> = {}): BuildSession {
  return {
    ideaId: 'idea-1',
    mode: 'interactive',
    currentStep: 0,
    steps: WEBSITE_BUILD_STEPS.map((s) => ({ name: s.name, status: 'pending' as const })),
    artifacts: {},
    createdAt: '2026-02-17T00:00:00Z',
    updatedAt: '2026-02-17T00:00:00Z',
    ...overrides,
  };
}

describe('determineStreamEndSignal', () => {
  it('returns checkpoint for interactive mode at checkpoint step', () => {
    const session = makeBuildSession({ currentStep: 0 }); // step 0 IS a checkpoint
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('checkpoint');
    expect(signal).toHaveProperty('step', 0);
  });

  it('returns continue for interactive mode at non-checkpoint step', () => {
    const session = makeBuildSession({ currentStep: 1 }); // step 1 is NOT a checkpoint
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('continue');
    expect(signal).toHaveProperty('step', 1);
  });

  it('returns continue for autonomous mode even at checkpoint step', () => {
    const session = makeBuildSession({ mode: 'autonomous', currentStep: 0 });
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('continue');
  });

  it('returns poll for deploy step (step 6)', () => {
    const session = makeBuildSession({ currentStep: 6 });
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('poll');
    expect(signal).toHaveProperty('pollUrl', '/api/painted-door/idea-1');
  });

  it('returns complete when last step is complete', () => {
    const session = makeBuildSession({ currentStep: 7 });
    session.steps[7].status = 'complete';
    session.artifacts.siteUrl = 'https://example.vercel.app';
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('complete');
    if (signal.action === 'complete') {
      expect(signal.result.siteUrl).toBe('https://example.vercel.app');
    }
  });

  it('does not return complete when last step is NOT complete', () => {
    const session = makeBuildSession({ currentStep: 7 });
    // step 7 status is still 'pending'
    const signal = determineStreamEndSignal(session);
    expect(signal.action).not.toBe('complete');
  });
});

describe('step advancement via tool calls', () => {
  beforeEach(() => vi.clearAllMocks());

  async function setupForToolTest(currentStep: number) {
    const { getIdeaFromDb } = await import('@/lib/db');
    (getIdeaFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'idea-1', name: 'Test', description: 'Test', targetUser: 'devs', problemSolved: 'testing',
    });

    const { getBuildSession, saveBuildSession, getConversationHistory, saveConversationHistory } = await import('@/lib/painted-door-db');
    const steps = WEBSITE_BUILD_STEPS.map((s) => ({ name: s.name, status: 'pending' as const }));
    for (let i = 0; i < currentStep; i++) steps[i].status = 'complete';
    if (steps[currentStep]) steps[currentStep].status = 'active';

    const session = {
      ideaId: 'idea-1',
      mode: 'interactive' as const,
      currentStep,
      steps,
      artifacts: {},
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    };
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue(session);
    (getConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (saveConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    return { session, saveBuildSession: saveBuildSession as ReturnType<typeof vi.fn> };
  }

  it('advances session when design_brand tool is called', async () => {
    const { saveBuildSession } = await setupForToolTest(0);

    // Mock tool that returns design_brand
    const { createWebsiteTools } = await import('@/lib/agent-tools/website');
    (createWebsiteTools as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        name: 'design_brand',
        description: 'mock',
        input_schema: { type: 'object', properties: {}, required: [] },
        execute: vi.fn().mockResolvedValue({ success: true }),
      },
    ]);

    // First round: tool call; Second round: text only
    let callCount = 0;
    mockMessagesStream.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        const events = (async function* () {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Designing brand...' } };
        })();
        return {
          [Symbol.asyncIterator]: () => events,
          finalMessage: () => Promise.resolve({
            content: [
              { type: 'text', text: 'Designing brand...' },
              { type: 'tool_use', id: 'tool-1', name: 'design_brand', input: {} },
            ],
          }),
        };
      }
      const events = (async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Done.' } };
      })();
      return {
        [Symbol.asyncIterator]: () => events,
        finalMessage: () => Promise.resolve({
          content: [{ type: 'text', text: 'Done.' }],
        }),
      };
    });

    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'user', content: 'Start' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    await readStream(response);

    // Session should have been saved with currentStep = 1 (design_brand advances past step 0)
    const savedCalls = saveBuildSession.mock.calls;
    const lastSaved = savedCalls[savedCalls.length - 1][1];
    expect(lastSaved.currentStep).toBe(1);
    expect(lastSaved.steps[0].status).toBe('complete');
    expect(lastSaved.steps[1].status).toBe('complete');
    expect(lastSaved.steps[2].status).toBe('active');
  });
});

describe('advanceSessionStep', () => {
  it('advances step when tool maps to higher step', () => {
    const session = makeBuildSession({ currentStep: 0 });
    advanceSessionStep(session, ['design_brand']);
    expect(session.currentStep).toBe(1);
    expect(session.steps[0].status).toBe('complete');
    expect(session.steps[1].status).toBe('complete');
    expect(session.steps[2].status).toBe('active');
  });

  it('skips intermediate steps when tool maps to much higher step', () => {
    const session = makeBuildSession({ currentStep: 0 });
    advanceSessionStep(session, ['assemble_site_files']);
    expect(session.currentStep).toBe(3);
    for (let i = 0; i <= 3; i++) {
      expect(session.steps[i].status).toBe('complete');
    }
    expect(session.steps[4].status).toBe('active');
  });

  it('does not move backward', () => {
    const session = makeBuildSession({ currentStep: 3 });
    advanceSessionStep(session, ['get_idea_context']); // step 0
    expect(session.currentStep).toBe(3); // unchanged
  });

  it('ignores unknown tools', () => {
    const session = makeBuildSession({ currentStep: 0 });
    advanceSessionStep(session, ['update_file', 'some_unknown_tool']);
    expect(session.currentStep).toBe(0); // unchanged
  });

  it('uses highest step when multiple tools called in one round', () => {
    const session = makeBuildSession({ currentStep: 0 });
    advanceSessionStep(session, ['get_idea_context', 'design_brand']);
    expect(session.currentStep).toBe(1); // design_brand is higher
  });

  it('consult_advisor only advances when currentStep >= 4', () => {
    const session = makeBuildSession({ currentStep: 2 });
    advanceSessionStep(session, ['consult_advisor']);
    expect(session.currentStep).toBe(2); // unchanged — too early

    const session2 = makeBuildSession({ currentStep: 4 });
    advanceSessionStep(session2, ['consult_advisor']);
    expect(session2.currentStep).toBe(5); // advances past Pressure Test
  });

  it('marks last step active when advancing to second-to-last', () => {
    const session = makeBuildSession({ currentStep: 5 });
    advanceSessionStep(session, ['push_files']);
    expect(session.currentStep).toBe(6);
    expect(session.steps[7].status).toBe('active');
  });

  it('does not set active beyond steps array bounds', () => {
    const session = makeBuildSession({ currentStep: 6 });
    advanceSessionStep(session, ['finalize_site']);
    expect(session.currentStep).toBe(7);
    expect(session.steps[7].status).toBe('complete');
    // No step 8 to mark active — should not throw
  });
});
