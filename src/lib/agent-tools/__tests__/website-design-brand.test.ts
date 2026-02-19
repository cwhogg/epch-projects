import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---

const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
};

vi.mock('@/lib/redis', () => ({
  getRedis: () => mockRedis,
  isRedisConfigured: () => true,
  parseValue: <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T,
}));

const mockCreate = vi.fn();
vi.mock('../../anthropic', () => ({
  getAnthropic: () => ({ messages: { create: mockCreate } }),
}));

vi.mock('../../config', () => ({ CLAUDE_MODEL: 'test-model' }));

const mockGetIdeaFromDb = vi.fn();
const mockGetAllFoundationDocs = vi.fn();
vi.mock('../../db', () => ({
  getIdeaFromDb: (...args: unknown[]) => mockGetIdeaFromDb(...args),
  getContentCalendar: vi.fn().mockResolvedValue(null),
  saveContentCalendar: vi.fn(),
  getAllFoundationDocs: (...args: unknown[]) => mockGetAllFoundationDocs(...args),
}));

const mockBuildContentContext = vi.fn();
vi.mock('../../content-agent', () => ({
  buildContentContext: (...args: unknown[]) => mockBuildContentContext(...args),
}));

const mockBuildBrandIdentityPrompt = vi.fn().mockReturnValue('brand prompt');
vi.mock('../../painted-door-prompts', () => ({
  buildBrandIdentityPrompt: (...args: unknown[]) => mockBuildBrandIdentityPrompt(...args),
}));

vi.mock('../../painted-door-templates', () => ({
  assembleAllFiles: () => ({ 'app/page.tsx': 'export default function Home(){}' }),
}));

vi.mock('../../painted-door-db', () => ({
  savePaintedDoorSite: vi.fn(),
  savePaintedDoorProgress: vi.fn(),
  getPaintedDoorSite: vi.fn().mockResolvedValue(null),
  saveDynamicPublishTarget: vi.fn(),
}));

vi.mock('../../github-api', () => ({
  createGitHubRepo: vi.fn(),
  pushFilesToGitHub: vi.fn(),
  createVercelProject: vi.fn(),
  triggerDeployViaGitPush: vi.fn(),
}));

vi.stubGlobal('fetch', vi.fn());

import { createWebsiteTools } from '../website';

// --- Helpers ---

function setupIdea() {
  mockGetIdeaFromDb.mockResolvedValue({
    id: 'idea-1',
    name: 'Test Idea',
    description: 'desc',
    targetUser: 'devs',
    problemSolved: 'bugs',
  });
  mockBuildContentContext.mockResolvedValue({
    ideaName: 'Test',
    ideaDescription: 'desc',
    targetUser: 'devs',
    problemSolved: 'bugs',
    summary: 'summary',
    competitors: 'none',
    topKeywords: [{ keyword: 'test', intentType: 'info', estimatedVolume: 'high', estimatedCompetitiveness: 'low', contentGapHypothesis: '' }],
    serpValidated: [],
    contentStrategy: { recommendedAngle: 'test', topOpportunities: ['op1'] },
  });
  mockCreate.mockResolvedValue({
    content: [{
      type: 'text',
      text: JSON.stringify({
        siteName: 'Test Site',
        tagline: 'A tagline',
        seoDescription: 'A test site for developers',
        targetDemographic: 'testers',
        voice: { tone: 'casual', personality: 'friendly', examples: ['hi'] },
        colors: {
          primary: '#000', primaryLight: '#333', background: '#111',
          backgroundElevated: '#222', textPrimary: '#fff', textSecondary: '#ccc',
          textMuted: '#999', accent: '#0ff', border: '#444',
        },
        typography: { headingFont: 'Inter', bodyFont: 'Inter', monoFont: 'Fira Code' },
        landingPage: {
          heroHeadline: 'Welcome',
          heroSubheadline: 'Sub',
          ctaText: 'Go',
          valueProps: [{ title: 'Fast', description: 'Very fast' }],
          faqs: [{ question: 'Q?', answer: 'A.' }],
        },
      }),
    }],
    stop_reason: 'end_turn',
  });
}

// --- Tests ---

describe('design_brand tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupIdea();
  });

  it('passes Foundation documents to buildBrandIdentityPrompt', async () => {
    mockGetAllFoundationDocs.mockResolvedValue({
      'design-principles': { type: 'design-principles', content: 'Light cream background', generatedAt: '2026-02-17', editedAt: null },
      'brand-voice': { type: 'brand-voice', content: 'Warm and clinical', generatedAt: '2026-02-17', editedAt: null },
    });

    const tools = await createWebsiteTools('idea-1');
    const getCtx = tools.find((t) => t.name === 'get_idea_context')!;
    await getCtx.execute({});

    const designBrand = tools.find((t) => t.name === 'design_brand')!;
    await designBrand.execute({});

    expect(mockGetAllFoundationDocs).toHaveBeenCalledWith('idea-1');
    expect(mockBuildBrandIdentityPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      false,
      expect.arrayContaining([
        { type: 'design-principles', content: 'Light cream background' },
        { type: 'brand-voice', content: 'Warm and clinical' },
      ]),
    );
  });

  it('passes undefined when no Foundation documents exist', async () => {
    mockGetAllFoundationDocs.mockResolvedValue({});

    const tools = await createWebsiteTools('idea-1');
    const getCtx = tools.find((t) => t.name === 'get_idea_context')!;
    await getCtx.execute({});

    const designBrand = tools.find((t) => t.name === 'design_brand')!;
    await designBrand.execute({});

    expect(mockGetAllFoundationDocs).toHaveBeenCalledWith('idea-1');
    expect(mockBuildBrandIdentityPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      false,
      undefined,
    );
  });

  it('filters out null Foundation documents', async () => {
    mockGetAllFoundationDocs.mockResolvedValue({
      strategy: null,
      'design-principles': { type: 'design-principles', content: 'Use forest green', generatedAt: '2026-02-17', editedAt: null },
      positioning: null,
    });

    const tools = await createWebsiteTools('idea-1');
    const getCtx = tools.find((t) => t.name === 'get_idea_context')!;
    await getCtx.execute({});

    const designBrand = tools.find((t) => t.name === 'design_brand')!;
    await designBrand.execute({});

    expect(mockBuildBrandIdentityPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      false,
      [{ type: 'design-principles', content: 'Use forest green' }],
    );
  });
});
