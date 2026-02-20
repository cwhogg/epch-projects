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

const { VALID_DESIGN_TOKENS, VALID_DESIGN_DOC } = vi.hoisted(() => {
  const tokens = JSON.stringify({
    siteName: 'TestBrand', tagline: 'Test all the things',
    colors: { primary: '#2563EB', primaryLight: '#3B82F6', background: '#FFFFFF', backgroundElevated: '#F9FAFB', text: '#111827', textSecondary: '#4B5563', textMuted: '#9CA3AF', accent: '#10B981', border: '#E5E7EB' },
    fonts: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' },
    theme: 'light',
  });
  const doc = `# Design Principles\n\nSome prose.\n\n\`\`\`json:design-tokens\n${tokens}\n\`\`\`\n\nMore prose.`;
  return { VALID_DESIGN_TOKENS: tokens, VALID_DESIGN_DOC: doc };
});

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
  getFoundationDoc: vi.fn().mockResolvedValue({
    type: 'design-principles',
    content: VALID_DESIGN_DOC,
    generatedAt: '2026-02-17',
    editedAt: null,
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
  createWebsiteTools: vi.fn().mockResolvedValue([]),
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

  it('includes mode instruction for interactive with 6 stages', async () => {
    const prompt = await assembleSystemPrompt('idea-1', 'interactive');
    expect(prompt).toContain('6-stage');
    expect(prompt).toContain('pause');
    expect(prompt).toContain('social proof');
    expect(prompt).toContain('em dash');
  });

  it('autonomous prompt scopes LLM to current stage only', async () => {
    const prompt = await assembleSystemPrompt('idea-1', 'autonomous');
    // Must tell LLM to do ONLY the current stage
    expect(prompt).toContain('current stage');
    // Must NOT tell LLM to run through all stages continuously
    expect(prompt).not.toContain('all 6 stages continuously');
    expect(prompt).not.toContain('without stopping');
    // Should still require advisor consultation
    expect(prompt).toContain('consult_advisor');
    expect(prompt).toContain('Narrate');
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
      currentSubstep: 0,
      steps: [{ name: 'Extract & Validate Ingredients', status: 'pending' }],
      artifacts: {},
      advisorCallsThisRound: [],
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

  it('returns 400 for mode_select when design-principles doc is missing', async () => {
    const { getFoundationDoc } = await import('@/lib/db');
    (getFoundationDoc as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'mode_select', mode: 'interactive' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Missing design-principles');
  });

  it('returns 400 for mode_select when design-principles has invalid tokens', async () => {
    const { getFoundationDoc } = await import('@/lib/db');
    (getFoundationDoc as ReturnType<typeof vi.fn>).mockResolvedValue({
      type: 'design-principles',
      content: '# Design Principles\n\nNo tokens block here.',
      generatedAt: '2026-02-17',
      editedAt: null,
    });

    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'mode_select', mode: 'interactive' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('invalid tokens');
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
      currentSubstep: 0,
      steps: [{ name: 'Extract & Validate Ingredients', status: 'active' }],
      artifacts: {},
      advisorCallsThisRound: [],
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
      currentSubstep: 0,
      steps: [{ name: 'Extract & Validate Ingredients', status: 'active' }],
      artifacts: {},
      advisorCallsThisRound: [],
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
      currentStep: 0, // Step 0 = Extract & Validate Ingredients, which IS a checkpoint
      currentSubstep: 0,
      steps: [{ name: 'Extract & Validate Ingredients', status: 'active' }],
      artifacts: {},
      advisorCallsThisRound: [],
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
      currentSubstep: 0,
      steps: [{ name: 'Extract & Validate Ingredients', status: 'active' }],
      artifacts: {},
      advisorCallsThisRound: [],
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
      currentSubstep: 0,
      steps: [{ name: 'Extract & Validate Ingredients', status: 'active' }],
      artifacts: {},
      advisorCallsThisRound: [],
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
    const { getIdeaFromDb, getFoundationDoc } = await import('@/lib/db');
    (getIdeaFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'idea-1', name: 'Test', description: 'Test', targetUser: 'devs', problemSolved: 'testing',
    });
    (getFoundationDoc as ReturnType<typeof vi.fn>).mockResolvedValue({
      type: 'design-principles',
      content: VALID_DESIGN_DOC,
      generatedAt: '2026-02-17',
      editedAt: null,
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
      currentSubstep: 0,
      steps: [{ name: 'Extract & Validate Ingredients', status: 'pending' }],
      artifacts: {},
      advisorCallsThisRound: [],
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
      currentSubstep: 0,
      steps: [{ name: 'Extract & Validate Ingredients', status: 'active' }],
      artifacts: {},
      advisorCallsThisRound: [],
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
      currentStep: 1, // Write Hero step
      currentSubstep: 0,
      steps: [
        { name: 'Extract & Validate Ingredients', status: 'complete' },
        { name: 'Write Hero', status: 'pending' },
      ],
      artifacts: { ingredients: 'extracted ingredients' },
      advisorCallsThisRound: [],
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });

    (getConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue([
      { role: 'user', content: 'Start', timestamp: '2026-02-17T00:00:00Z' },
      { role: 'assistant', content: 'Ingredients done.', timestamp: '2026-02-17T00:01:00Z' },
    ]);

    mockStreamResponse('Moving to hero section...');

    const response = await POST(
      makeRequest({ type: 'continue', step: 1 }),
      paramsPromise,
    );
    const text = await readStream(response);

    expect(text).toContain('hero');

    // The continue message was added to history
    const saveCalls = (saveConversationHistory as ReturnType<typeof vi.fn>).mock.calls;
    const lastSavedHistory = saveCalls[saveCalls.length - 1][1];
    const continueMsg = lastSavedHistory.find(
      (m: { content: string }) => m.content.includes('Continue.')
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
      currentSubstep: 0,
      steps: [{ name: 'Extract & Validate Ingredients', status: 'active' }],
      artifacts: {},
      advisorCallsThisRound: [],
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
      currentSubstep: 0,
      steps: [{ name: 'Extract & Validate Ingredients', status: 'active' }],
      artifacts: {},
      advisorCallsThisRound: [],
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
      currentSubstep: 0,
      steps: [{ name: 'Extract & Validate Ingredients', status: 'active' }],
      artifacts: {},
      advisorCallsThisRound: [],
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });
    (getConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    // Anthropic throws immediately
    const events = (async function* () {
      throw new Error('Service unavailable');
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

  it('continue message includes step name for LLM context', async () => {
    // Setup mocks for step 1 (Write Hero)
    await setupDefaultMocks();
    const { getBuildSession, getConversationHistory, saveConversationHistory } = await import('@/lib/painted-door-db');
    const steps = WEBSITE_BUILD_STEPS.map((s) => ({ name: s.name, status: 'pending' as const }));
    steps[0].status = 'complete';
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ideaId: 'idea-1',
      mode: 'autonomous',
      currentStep: 0,
      currentSubstep: 0,
      steps,
      artifacts: {},
      advisorCallsThisRound: [],
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });
    (getConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (saveConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    mockStreamResponse('Hero content here.');

    const request = makeRequest({ type: 'continue', step: 1 });
    const response = await POST(request, paramsPromise);
    await readStream(response);

    // The history save should contain a user message with the step name
    const saveCalls = (saveConversationHistory as ReturnType<typeof vi.fn>).mock.calls;
    const savedHistory = saveCalls[saveCalls.length - 1][1];
    const continueMsg = savedHistory.find((m: { role: string }) => m.role === 'user');
    expect(continueMsg.content).toContain('Write Hero');
  });
});

import { advanceSessionStep, advanceSectionBasedStep, determineStreamEndSignal, trackAdvisorCall, checkAdvisorRequirements, advanceSubstep } from '../route';
import { WEBSITE_BUILD_STEPS } from '@/types';

function makeBuildSession(overrides: Partial<BuildSession> = {}): BuildSession {
  return {
    ideaId: 'idea-1',
    mode: 'interactive',
    currentStep: 0,
    currentSubstep: 0,
    steps: WEBSITE_BUILD_STEPS.map((s) => ({ name: s.name, status: 'pending' as const })),
    artifacts: {},
    advisorCallsThisRound: [],
    createdAt: '2026-02-17T00:00:00Z',
    updatedAt: '2026-02-17T00:00:00Z',
    ...overrides,
  };
}

describe('determineStreamEndSignal', () => {
  it('returns checkpoint for interactive mode at checkpoint step', () => {
    const session = makeBuildSession({ currentStep: 0 });
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('checkpoint');
    expect(signal).toHaveProperty('step', 0);
  });

  it('returns continue for autonomous mode even at checkpoint step', () => {
    const session = makeBuildSession({ mode: 'autonomous', currentStep: 0 });
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('continue');
  });

  it('returns poll for Build & Deploy step (step 4)', () => {
    const session = makeBuildSession({ currentStep: 4 });
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('poll');
    expect(signal).toHaveProperty('pollUrl', '/api/painted-door/idea-1');
  });

  it('returns complete when last step is complete', () => {
    const session = makeBuildSession({ currentStep: 5 });
    session.steps[5].status = 'complete';
    session.artifacts.siteUrl = 'https://example.vercel.app';
    session.artifacts.repoUrl = 'https://github.com/user/repo';
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('complete');
    if (signal.action === 'complete') {
      expect(signal.result.siteUrl).toBe('https://example.vercel.app');
      expect(signal.result.repoUrl).toBe('https://github.com/user/repo');
    }
  });

  it('does not return complete when last step is NOT complete', () => {
    const session = makeBuildSession({ currentStep: 5 });
    const signal = determineStreamEndSignal(session);
    expect(signal.action).not.toBe('complete');
  });

  it('returns checkpoint with substep info for step 2', () => {
    const session = makeBuildSession({ currentStep: 2, currentSubstep: 2 });
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('checkpoint');
    if (signal.action === 'checkpoint') {
      expect(signal.substep).toBe(2);
      expect(signal.prompt).toContain('3c');
      expect(signal.prompt).toContain('How It Works');
    }
  });

  it('returns continue for autonomous mode at checkpoint step', () => {
    const session = makeBuildSession({ mode: 'autonomous', currentStep: 3 });
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('continue');
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
      currentSubstep: 0,
      steps,
      artifacts: {},
      advisorCallsThisRound: [] as string[],
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    };
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue(session);
    (getConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (saveConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    return { session, saveBuildSession: saveBuildSession as ReturnType<typeof vi.fn> };
  }

  it('advances session when assemble_site_files tool is called', async () => {
    const { saveBuildSession } = await setupForToolTest(3);

    // Mock tool that returns assemble_site_files
    const { createWebsiteTools } = await import('@/lib/agent-tools/website');
    (createWebsiteTools as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        name: 'assemble_site_files',
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
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Assembling site...' } };
        })();
        return {
          [Symbol.asyncIterator]: () => events,
          finalMessage: () => Promise.resolve({
            content: [
              { type: 'text', text: 'Assembling site...' },
              { type: 'tool_use', id: 'tool-1', name: 'assemble_site_files', input: {} },
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
      body: JSON.stringify({ type: 'user', content: 'Start building' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    await readStream(response);

    // Session should have been saved with currentStep = 4 (assemble_site_files -> Build & Deploy)
    const savedCalls = saveBuildSession.mock.calls;
    const lastSaved = savedCalls[savedCalls.length - 1][1];
    expect(lastSaved.currentStep).toBe(4);
    for (let i = 0; i <= 4; i++) {
      expect(lastSaved.steps[i].status).toBe('complete');
    }
    expect(lastSaved.steps[5].status).toBe('active');
  });
});

describe('advanceSessionStep', () => {
  it('advances step when tool maps to higher step', () => {
    const session = makeBuildSession({ currentStep: 0 });
    advanceSessionStep(session, ['assemble_site_files']);
    expect(session.currentStep).toBe(4); // Build & Deploy
  });

  it('does not move backward', () => {
    const session = makeBuildSession({ currentStep: 3 });
    advanceSessionStep(session, ['get_idea_context']); // step 0
    expect(session.currentStep).toBe(3); // unchanged
  });

  it('ignores unknown tools', () => {
    const session = makeBuildSession({ currentStep: 0 });
    advanceSessionStep(session, ['unknown_tool']);
    expect(session.currentStep).toBe(0);
  });

  it('does not advance on consult_advisor (tracked separately)', () => {
    const session = makeBuildSession({ currentStep: 1 });
    advanceSessionStep(session, ['consult_advisor']);
    expect(session.currentStep).toBe(1); // unchanged
  });

  it('marks intermediate steps complete when jumping', () => {
    const session = makeBuildSession({ currentStep: 0 });
    advanceSessionStep(session, ['create_repo']);
    expect(session.currentStep).toBe(4);
    for (let i = 0; i <= 4; i++) {
      expect(session.steps[i].status).toBe('complete');
    }
    expect(session.steps[5].status).toBe('active');
  });

  it('does not set active beyond steps array bounds', () => {
    const session = makeBuildSession({ currentStep: 4 });
    advanceSessionStep(session, ['finalize_site']);
    expect(session.currentStep).toBe(5);
    expect(session.steps[5].status).toBe('complete');
  });
});

describe('advisor marker injection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('injects advisor markers for consult_advisor tool calls', async () => {
    const { getIdeaFromDb } = await import('@/lib/db');
    (getIdeaFromDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'idea-1', name: 'Test', description: 'Test', targetUser: 'devs', problemSolved: 'testing',
    });

    const { getBuildSession, getConversationHistory, saveConversationHistory } = await import('@/lib/painted-door-db');
    const steps = WEBSITE_BUILD_STEPS.map((s) => ({ name: s.name, status: 'pending' as const }));
    steps[0].status = 'complete';
    (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ideaId: 'idea-1',
      mode: 'autonomous',
      currentStep: 1, // Write Hero - a copy-producing stage that uses advisors
      currentSubstep: 0,
      steps,
      artifacts: {},
      advisorCallsThisRound: [],
      createdAt: '2026-02-17T00:00:00Z',
      updatedAt: '2026-02-17T00:00:00Z',
    });
    (getConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (saveConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { createConsultAdvisorTool } = await import('@/lib/agent-tools/website-chat');
    (createConsultAdvisorTool as ReturnType<typeof vi.fn>).mockReturnValue({
      name: 'consult_advisor',
      description: 'mock',
      input_schema: { type: 'object', properties: {}, required: [] },
      execute: vi.fn().mockResolvedValue('Shirin says: reduce cognitive load on the CTA.'),
    });

    let callCount = 0;
    mockMessagesStream.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        const events = (async function* () {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Consulting Shirin...' } };
        })();
        return {
          [Symbol.asyncIterator]: () => events,
          finalMessage: () => Promise.resolve({
            content: [
              { type: 'text', text: 'Consulting Shirin...' },
              { type: 'tool_use', id: 'tool-1', name: 'consult_advisor', input: { advisorId: 'shirin-oreizy', question: 'Review CTA' } },
            ],
          }),
        };
      }
      const events = (async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Based on her advice...' } };
      })();
      return {
        [Symbol.asyncIterator]: () => events,
        finalMessage: () => Promise.resolve({
          content: [{ type: 'text', text: 'Based on her advice...' }],
        }),
      };
    });

    const request = new Request('http://localhost/api/painted-door/idea-1/chat', {
      method: 'POST',
      body: JSON.stringify({ type: 'user', content: 'Review the CTA' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'idea-1' }) });
    const text = await readStream(response);

    expect(text).toContain('<<<ADVISOR_START>>>');
    expect(text).toContain('shirin-oreizy');
    expect(text).toContain('Shirin Oreizy');
    expect(text).toContain('reduce cognitive load');
    expect(text).toContain('<<<ADVISOR_END>>>');
  });
});

describe('trackAdvisorCall', () => {
  it('adds advisor ID to tracking list', () => {
    const session = makeBuildSession();
    trackAdvisorCall(session, 'shirin-oreizy');
    expect(session.advisorCallsThisRound).toContain('shirin-oreizy');
  });

  it('does not duplicate advisor IDs', () => {
    const session = makeBuildSession();
    trackAdvisorCall(session, 'copywriter');
    trackAdvisorCall(session, 'copywriter');
    expect(session.advisorCallsThisRound).toHaveLength(1);
  });

  it('initializes tracking array if missing', () => {
    const session = makeBuildSession();
    session.advisorCallsThisRound = undefined;
    trackAdvisorCall(session, 'april-dunford');
    expect(session.advisorCallsThisRound).toEqual(['april-dunford']);
  });
});

describe('checkAdvisorRequirements', () => {
  it('returns null when all required advisors are called', () => {
    const session = makeBuildSession({ currentStep: 0 });
    session.advisorCallsThisRound = ['april-dunford', 'copywriter'];
    expect(checkAdvisorRequirements(session)).toBeNull();
  });

  it('returns message listing missing advisors', () => {
    const session = makeBuildSession({ currentStep: 0 });
    session.advisorCallsThisRound = ['april-dunford']; // missing copywriter
    const result = checkAdvisorRequirements(session);
    expect(result).toContain('copywriter');
  });

  it('returns null for non-copy-producing stages', () => {
    const session = makeBuildSession({ currentStep: 4 }); // Build & Deploy
    expect(checkAdvisorRequirements(session)).toBeNull();
  });

  it('uses substep key for step 2', () => {
    const session = makeBuildSession({ currentStep: 2, currentSubstep: 1 }); // 2b: Features
    session.advisorCallsThisRound = ['copywriter', 'oli-gardner'];
    expect(checkAdvisorRequirements(session)).toBeNull();
  });

  it('detects missing advisors for substep 2d', () => {
    const session = makeBuildSession({ currentStep: 2, currentSubstep: 3 }); // 2d: Target Audience
    session.advisorCallsThisRound = ['shirin-oreizy']; // missing april-dunford
    const result = checkAdvisorRequirements(session);
    expect(result).toContain('april-dunford');
  });
});

describe('advanceSubstep', () => {
  it('increments substep within step 2', () => {
    const session = makeBuildSession({ currentStep: 2, currentSubstep: 0 });
    const completed = advanceSubstep(session);
    expect(completed).toBe(false);
    expect(session.currentSubstep).toBe(1);
  });

  it('resets advisor tracking on substep advance', () => {
    const session = makeBuildSession({ currentStep: 2, currentSubstep: 0 });
    session.advisorCallsThisRound = ['shirin-oreizy', 'copywriter'];
    advanceSubstep(session);
    expect(session.advisorCallsThisRound).toEqual([]);
  });

  it('completes step 2 when all 5 substeps are done', () => {
    const session = makeBuildSession({ currentStep: 2, currentSubstep: 4 });
    session.steps[2].status = 'active';
    const completed = advanceSubstep(session);
    expect(completed).toBe(true);
    expect(session.currentStep).toBe(3);
    expect(session.steps[2].status).toBe('complete');
    expect(session.steps[3].status).toBe('active');
  });

  it('does nothing for non-step-2 stages', () => {
    const session = makeBuildSession({ currentStep: 1 });
    const completed = advanceSubstep(session);
    expect(completed).toBe(false);
  });
});

describe('out-of-order substep handling', () => {
  it('ignores substep continue signals when not at step 2', () => {
    const session = makeBuildSession({ currentStep: 1 });
    const result = advanceSubstep(session);
    expect(result).toBe(false);
    expect(session.currentStep).toBe(1); // unchanged
  });
});

describe('advanceSectionBasedStep', () => {
  it('advances step 1 → 2 when hero is locked', () => {
    const session = makeBuildSession({ currentStep: 1 });
    session.steps[1].status = 'active';
    advanceSectionBasedStep(session, new Set(['hero']), false);
    expect(session.currentStep).toBe(2);
    expect(session.steps[1].status).toBe('complete');
    expect(session.steps[2].status).toBe('active');
    expect(session.currentSubstep).toBe(0);
  });

  it('does not advance step 1 when hero is not locked', () => {
    const session = makeBuildSession({ currentStep: 1 });
    advanceSectionBasedStep(session, new Set(['problem']), false);
    expect(session.currentStep).toBe(1);
  });

  it('advances step 2 substeps based on section locks', () => {
    const session = makeBuildSession({ currentStep: 2, currentSubstep: 0 });
    session.steps[2].status = 'active';

    // Lock problem → substep 0 → 1
    advanceSectionBasedStep(session, new Set(['problem']), false);
    expect(session.currentSubstep).toBe(1);

    // Lock features → substep 1 → 2
    advanceSectionBasedStep(session, new Set(['problem', 'features']), false);
    expect(session.currentSubstep).toBe(2);

    // Lock how-it-works → substep 2 → 3
    advanceSectionBasedStep(session, new Set(['problem', 'features', 'how-it-works']), false);
    expect(session.currentSubstep).toBe(3);

    // Lock audience → substep 3 → 4
    advanceSectionBasedStep(session, new Set(['problem', 'features', 'how-it-works', 'audience']), false);
    expect(session.currentSubstep).toBe(4);
  });

  it('completes step 2 when objections and final-cta are locked at substep 4', () => {
    const session = makeBuildSession({ currentStep: 2, currentSubstep: 4 });
    session.steps[2].status = 'active';
    advanceSectionBasedStep(session, new Set(['objections', 'final-cta']), false);
    expect(session.currentStep).toBe(3);
    expect(session.steps[2].status).toBe('complete');
    expect(session.steps[3].status).toBe('active');
  });

  it('does not complete step 2 at substep 4 without final-cta', () => {
    const session = makeBuildSession({ currentStep: 2, currentSubstep: 4 });
    session.steps[2].status = 'active';
    advanceSectionBasedStep(session, new Set(['objections']), false);
    expect(session.currentStep).toBe(2);
  });

  it('advances step 3 → 4 when meta is locked', () => {
    const session = makeBuildSession({ currentStep: 3 });
    session.steps[3].status = 'active';
    advanceSectionBasedStep(session, new Set(), true);
    expect(session.currentStep).toBe(4);
    expect(session.steps[3].status).toBe('complete');
    expect(session.steps[4].status).toBe('active');
  });

  it('does not advance step 3 when meta is not locked', () => {
    const session = makeBuildSession({ currentStep: 3 });
    advanceSectionBasedStep(session, new Set(), false);
    expect(session.currentStep).toBe(3);
  });

  it('resets advisorCallsThisRound on step advancement', () => {
    const session = makeBuildSession({ currentStep: 1 });
    session.advisorCallsThisRound = ['shirin-oreizy', 'copywriter'];
    advanceSectionBasedStep(session, new Set(['hero']), false);
    expect(session.advisorCallsThisRound).toEqual([]);
  });
});

describe('advisor enforcement edge cases', () => {
  it('enforcement retry counter resets between stages', () => {
    const session = makeBuildSession({ currentStep: 0 });
    session.advisorCallsThisRound = [];
    const check1 = checkAdvisorRequirements(session);
    expect(check1).not.toBeNull(); // missing advisors

    // Simulate advancing to next stage
    session.currentStep = 1;
    session.advisorCallsThisRound = [];
    const check2 = checkAdvisorRequirements(session);
    expect(check2).not.toBeNull(); // missing advisors for new stage
    expect(check2).toContain('shirin-oreizy'); // stage 1 requires shirin
  });

  it('returns null for stages without advisor requirements (step 4, 5)', () => {
    const session4 = makeBuildSession({ currentStep: 4 });
    expect(checkAdvisorRequirements(session4)).toBeNull();

    const session5 = makeBuildSession({ currentStep: 5 });
    expect(checkAdvisorRequirements(session5)).toBeNull();
  });
});
