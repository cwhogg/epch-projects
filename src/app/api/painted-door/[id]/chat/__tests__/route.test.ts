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
