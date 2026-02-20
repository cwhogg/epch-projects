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
const mockGetFoundationDoc = vi.fn();
vi.mock('../../db', () => ({
  getIdeaFromDb: (...args: unknown[]) => mockGetIdeaFromDb(...args),
  getContentCalendar: vi.fn().mockResolvedValue(null),
  saveContentCalendar: vi.fn(),
  getAllFoundationDocs: (...args: unknown[]) => mockGetAllFoundationDocs(...args),
  getFoundationDoc: (...args: unknown[]) => mockGetFoundationDoc(...args),
}));

const mockBuildContentContext = vi.fn();
vi.mock('../../content-agent', () => ({
  buildContentContext: (...args: unknown[]) => mockBuildContentContext(...args),
}));

vi.mock('../../painted-door-templates', () => ({
  assembleFromSpec: vi.fn().mockReturnValue({ 'app/page.tsx': 'export default function Home(){}' }),
}));

const mockGetBuildSession = vi.fn();
const mockSaveBuildSession = vi.fn();
vi.mock('../../painted-door-db', () => ({
  savePaintedDoorSite: vi.fn(),
  savePaintedDoorProgress: vi.fn(),
  getPaintedDoorSite: vi.fn().mockResolvedValue(null),
  saveDynamicPublishTarget: vi.fn(),
  getBuildSession: (...args: unknown[]) => mockGetBuildSession(...args),
  saveBuildSession: (...args: unknown[]) => mockSaveBuildSession(...args),
}));

vi.mock('../../github-api', () => ({
  createGitHubRepo: vi.fn(),
  pushFilesToGitHub: vi.fn(),
  createVercelProject: vi.fn(),
  triggerDeployViaGitPush: vi.fn(),
}));

vi.stubGlobal('fetch', vi.fn());

import { createWebsiteTools } from '../website';
import { assembleFromSpec } from '../../painted-door-templates';

// --- Helpers ---

const VALID_BRAND = {
  siteName: 'TestBrand',
  tagline: 'Test all the things',
  siteUrl: '',
  colors: {
    primary: '#2563EB', primaryLight: '#3B82F6', background: '#FFFFFF',
    backgroundElevated: '#F9FAFB', text: '#111827', textSecondary: '#4B5563',
    textMuted: '#9CA3AF', accent: '#10B981', border: '#E5E7EB',
  },
  fonts: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' },
  theme: 'light' as const,
};

function makeSession(
  sections: { type: string; copy: Record<string, unknown> }[] = [],
  brand?: typeof VALID_BRAND,
) {
  return {
    ideaId: 'idea-1',
    mode: 'chat',
    currentStep: 1,
    currentSubstep: 0,
    steps: [],
    artifacts: {
      pageSpec: {
        sections,
        metaTitle: '',
        metaDescription: '',
        ogDescription: '',
      },
      ...(brand !== undefined ? { brand } : {}),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

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
    topKeywords: [
      { keyword: 'test', intentType: 'info', estimatedVolume: 'high', estimatedCompetitiveness: 'low', contentGapHypothesis: '' },
      { keyword: 'testing tools', intentType: 'commercial', estimatedVolume: 'medium', estimatedCompetitiveness: 'medium', contentGapHypothesis: '' },
    ],
    serpValidated: [],
    contentStrategy: { recommendedAngle: 'test', topOpportunities: ['op1'] },
  });
}

const VALID_DESIGN_TOKENS = JSON.stringify({
  siteName: 'TestBrand',
  tagline: 'Test all the things',
  colors: {
    primary: '#2563EB',
    primaryLight: '#3B82F6',
    background: '#FFFFFF',
    backgroundElevated: '#F9FAFB',
    text: '#111827',
    textSecondary: '#4B5563',
    textMuted: '#9CA3AF',
    accent: '#10B981',
    border: '#E5E7EB',
  },
  fonts: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' },
  theme: 'light',
});

function makeDesignDoc(tokensJson: string): string {
  return `# Design Principles\n\nSome prose.\n\n\`\`\`json:design-tokens\n${tokensJson}\n\`\`\`\n\nMore prose.`;
}

async function getTools() {
  const tools = await createWebsiteTools('idea-1');
  const getCtx = tools.find((t) => t.name === 'get_idea_context')!;
  await getCtx.execute({});
  return tools;
}

function findTool(tools: Awaited<ReturnType<typeof createWebsiteTools>>, name: string) {
  return tools.find((t) => t.name === name)!;
}

// --- Tests ---

describe('lock_section_copy tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupIdea();
    // Default: empty session
    mockGetBuildSession.mockResolvedValue(makeSession());
    mockSaveBuildSession.mockResolvedValue(undefined);
  });

  it('locks valid hero copy and echoes it back', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_section_copy');
    const result = await lock.execute({
      type: 'hero',
      copy: { headline: 'Ship faster today', subheadline: 'Build pages quickly.', ctaText: 'Get started now' },
    });
    expect(result.success).toBe(true);
    expect(result.lockedSection).toBe('hero');
    expect(result.copy.headline).toBe('Ship faster today');
    expect(mockSaveBuildSession).toHaveBeenCalled();
  });

  it('returns error for validation failure', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_section_copy');
    const result = await lock.execute({
      type: 'hero',
      copy: { headline: 'This is a really long headline that far exceeds the limit', subheadline: 'Sub', ctaText: 'Go' },
    });
    expect(result.error).toBeDefined();
    expect(result.error).toContain('headline');
  });

  it('returns error when section already locked without overwrite', async () => {
    mockGetBuildSession.mockResolvedValue(
      makeSession([{ type: 'hero', copy: { headline: 'Old', subheadline: 'S', ctaText: 'Go now' } }]),
    );
    const tools = await getTools();
    const lock = findTool(tools, 'lock_section_copy');
    const result = await lock.execute({
      type: 'hero',
      copy: { headline: 'Ship faster today', subheadline: 'Build pages quickly.', ctaText: 'Get started now' },
    });
    expect(result.error).toContain('already locked');
  });

  it('replaces section when overwrite is true', async () => {
    mockGetBuildSession.mockResolvedValue(
      makeSession([{ type: 'hero', copy: { headline: 'Old', subheadline: 'S', ctaText: 'Go now' } }]),
    );
    const tools = await getTools();
    const lock = findTool(tools, 'lock_section_copy');
    const result = await lock.execute({
      type: 'hero',
      copy: { headline: 'Ship faster today', subheadline: 'Build pages quickly.', ctaText: 'Get started now' },
      overwrite: true,
    });
    expect(result.success).toBe(true);
    expect(result.lockedSection).toBe('hero');
  });

  it('surfaces Redis save failure', async () => {
    mockSaveBuildSession.mockRejectedValue(new Error('Redis connection lost'));
    const tools = await getTools();
    const lock = findTool(tools, 'lock_section_copy');
    const result = await lock.execute({
      type: 'hero',
      copy: { headline: 'Ship faster today', subheadline: 'Build pages quickly.', ctaText: 'Get started now' },
    });
    expect(result.error).toContain('Redis connection lost');
  });

  it('locks valid features copy with 3 items', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_section_copy');
    const result = await lock.execute({
      type: 'features',
      copy: {
        sectionHeadline: 'What you get',
        features: [
          { title: 'Fast', description: 'Build in minutes' },
          { title: 'Smart', description: 'AI-powered copy' },
          { title: 'Simple', description: 'No code needed' },
        ],
      },
    });
    expect(result.success).toBe(true);
    expect(result.lockedSection).toBe('features');
  });
});

describe('lock_page_meta tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupIdea();
    mockGetBuildSession.mockResolvedValue(makeSession());
    mockSaveBuildSession.mockResolvedValue(undefined);
  });

  it('locks valid page meta', async () => {
    const tools = await getTools();
    const lockMeta = findTool(tools, 'lock_page_meta');
    const result = await lockMeta.execute({
      metaTitle: 'TestBrand — Fast Landing Pages',
      metaDescription: 'Build landing pages in minutes with AI-powered copy.',
      ogDescription: 'AI-powered landing page builder.',
    });
    expect(result.success).toBe(true);
    expect(result.metaTitle).toBe('TestBrand — Fast Landing Pages');
    expect(mockSaveBuildSession).toHaveBeenCalled();
  });

  it('returns validation error for missing field', async () => {
    const tools = await getTools();
    const lockMeta = findTool(tools, 'lock_page_meta');
    const result = await lockMeta.execute({
      metaDescription: 'Desc',
      ogDescription: 'OG',
    });
    expect(result.error).toContain('metaTitle');
  });

  it('surfaces Redis save failure', async () => {
    mockSaveBuildSession.mockRejectedValue(new Error('Redis write failed'));
    const tools = await getTools();
    const lockMeta = findTool(tools, 'lock_page_meta');
    const result = await lockMeta.execute({
      metaTitle: 'Title',
      metaDescription: 'Desc',
      ogDescription: 'OG',
    });
    expect(result.error).toContain('Redis write failed');
  });
});

describe('assemble_site_files tool (PageSpec path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupIdea();
    mockSaveBuildSession.mockResolvedValue(undefined);
  });

  it('assembles files when PageSpec is complete and brand is locked', async () => {
    const fullSession = makeSession([
      { type: 'hero', copy: { headline: 'H', subheadline: 'S', ctaText: 'Go now' } },
      { type: 'problem', copy: { headline: 'H', body: 'B' } },
      { type: 'features', copy: { sectionHeadline: 'F', features: [{ title: 'T', description: 'D' }, { title: 'T2', description: 'D2' }, { title: 'T3', description: 'D3' }] } },
      { type: 'how-it-works', copy: { sectionHeadline: 'H', steps: [{ label: 'L', description: 'D' }, { label: 'L2', description: 'D2' }, { label: 'L3', description: 'D3' }] } },
      { type: 'audience', copy: { sectionHeadline: 'A', body: 'B' } },
      { type: 'objections', copy: { sectionHeadline: 'O', objections: [{ question: 'Q', answer: 'A' }] } },
      { type: 'final-cta', copy: { headline: 'H', body: 'B', ctaText: 'Go now' } },
      { type: 'faq', copy: { sectionHeadline: 'F', faqs: [{ question: 'Q', answer: 'A' }] } },
    ], VALID_BRAND);
    fullSession.artifacts.pageSpec!.metaTitle = 'Test Title';
    fullSession.artifacts.pageSpec!.metaDescription = 'Test description';
    fullSession.artifacts.pageSpec!.ogDescription = 'Test OG';
    mockGetBuildSession.mockResolvedValue(fullSession);

    const tools = await getTools();
    const assemble = findTool(tools, 'assemble_site_files');
    const result = await assemble.execute({});
    expect(result.success).toBe(true);
    expect(result.totalFileCount).toBeGreaterThan(0);
    expect(assembleFromSpec).toHaveBeenCalled();
  });

  it('returns error when sections are missing', async () => {
    mockGetBuildSession.mockResolvedValue(
      makeSession([{ type: 'hero', copy: { headline: 'H', subheadline: 'S', ctaText: 'Go now' } }], VALID_BRAND),
    );

    const tools = await getTools();
    const assemble = findTool(tools, 'assemble_site_files');
    const result = await assemble.execute({});
    expect(result.error).toContain('missing');
  });

  it('returns error when brand is not locked', async () => {
    const fullSession = makeSession([
      { type: 'hero', copy: { headline: 'H', subheadline: 'S', ctaText: 'Go now' } },
      { type: 'problem', copy: { headline: 'H', body: 'B' } },
      { type: 'features', copy: { sectionHeadline: 'F', features: [{ title: 'T', description: 'D' }, { title: 'T2', description: 'D2' }, { title: 'T3', description: 'D3' }] } },
      { type: 'how-it-works', copy: { sectionHeadline: 'H', steps: [{ label: 'L', description: 'D' }, { label: 'L2', description: 'D2' }, { label: 'L3', description: 'D3' }] } },
      { type: 'audience', copy: { sectionHeadline: 'A', body: 'B' } },
      { type: 'objections', copy: { sectionHeadline: 'O', objections: [{ question: 'Q', answer: 'A' }] } },
      { type: 'final-cta', copy: { headline: 'H', body: 'B', ctaText: 'Go now' } },
      { type: 'faq', copy: { sectionHeadline: 'F', faqs: [{ question: 'Q', answer: 'A' }] } },
    ]); // No brand
    mockGetBuildSession.mockResolvedValue(fullSession);

    const tools = await getTools();
    const assemble = findTool(tools, 'assemble_site_files');
    const result = await assemble.execute({});
    expect(result.error).toContain('lock_brand');
  });

  it('surfaces Redis read failure for build session', async () => {
    mockGetBuildSession.mockRejectedValue(new Error('Redis timeout'));

    const tools = await getTools();
    const assemble = findTool(tools, 'assemble_site_files');
    const result = await assemble.execute({});
    expect(result.error).toContain('Redis timeout');
  });
});

describe('evaluate_brand tool (PageSpec-based)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupIdea();
  });

  it('checks keyword in hero headline from PageSpec', async () => {
    const session = makeSession([
      { type: 'hero', copy: { headline: 'Test your ideas fast', subheadline: 'Testing tools for startups.', ctaText: 'Start testing' } },
      { type: 'features', copy: { sectionHeadline: 'Features', features: [{ title: 'T1', description: 'D1' }, { title: 'T2', description: 'D2' }, { title: 'T3', description: 'D3' }] } },
      { type: 'faq', copy: { sectionHeadline: 'FAQ', faqs: [{ question: 'Q?', answer: 'A.' }] } },
    ]);
    session.artifacts.pageSpec!.metaDescription = 'A great test platform for developers that helps them build faster apps and ship more often.';
    mockGetBuildSession.mockResolvedValue(session);

    mockGetFoundationDoc.mockResolvedValue({
      type: 'design-principles',
      content: makeDesignDoc(VALID_DESIGN_TOKENS),
      generatedAt: '2026-02-19',
      editedAt: null,
    });

    const tools = await getTools();
    const getCtx = findTool(tools, 'get_idea_context');
    await getCtx.execute({});
    const evaluate = findTool(tools, 'evaluate_brand');
    const result = await evaluate.execute({});
    expect(result.headlineHasKeyword).toBe(true);
  });

  it('reports missing keyword in hero headline', async () => {
    const session = makeSession([
      { type: 'hero', copy: { headline: 'Build things fast', subheadline: 'No testing keywords here.', ctaText: 'Get started now' } },
      { type: 'features', copy: { sectionHeadline: 'Features', features: [{ title: 'T1', description: 'D1' }, { title: 'T2', description: 'D2' }, { title: 'T3', description: 'D3' }] } },
      { type: 'faq', copy: { sectionHeadline: 'FAQ', faqs: [{ question: 'Q?', answer: 'A.' }] } },
    ]);
    session.artifacts.pageSpec!.metaDescription = 'A great platform for building.';
    mockGetBuildSession.mockResolvedValue(session);

    mockGetFoundationDoc.mockResolvedValue({
      type: 'design-principles',
      content: makeDesignDoc(VALID_DESIGN_TOKENS),
      generatedAt: '2026-02-19',
      editedAt: null,
    });

    const tools = await getTools();
    const getCtx = findTool(tools, 'get_idea_context');
    await getCtx.execute({});
    const evaluate = findTool(tools, 'evaluate_brand');
    const result = await evaluate.execute({});
    expect(result.headlineHasKeyword).toBe(false);
  });

  it('checks feature count from PageSpec', async () => {
    const session = makeSession([
      { type: 'hero', copy: { headline: 'Test platform here', subheadline: 'Sub.', ctaText: 'Go test now' } },
      { type: 'features', copy: { sectionHeadline: 'Features', features: [{ title: 'T1', description: 'D1' }, { title: 'T2', description: 'D2' }, { title: 'T3', description: 'D3' }] } },
      { type: 'faq', copy: { sectionHeadline: 'FAQ', faqs: [{ question: 'Q?', answer: 'A.' }] } },
    ]);
    session.artifacts.pageSpec!.metaDescription = 'A great test description for testing.';
    mockGetBuildSession.mockResolvedValue(session);

    mockGetFoundationDoc.mockResolvedValue({
      type: 'design-principles',
      content: makeDesignDoc(VALID_DESIGN_TOKENS),
      generatedAt: '2026-02-19',
      editedAt: null,
    });

    const tools = await getTools();
    const getCtx = findTool(tools, 'get_idea_context');
    await getCtx.execute({});
    const evaluate = findTool(tools, 'evaluate_brand');
    const result = await evaluate.execute({});
    expect(result.featureCount).toBe(3);
  });

  it('checks FAQ count from PageSpec', async () => {
    const session = makeSession([
      { type: 'hero', copy: { headline: 'Test stuff here', subheadline: 'Sub.', ctaText: 'Go test now' } },
      { type: 'features', copy: { sectionHeadline: 'Features', features: [{ title: 'T1', description: 'D1' }, { title: 'T2', description: 'D2' }, { title: 'T3', description: 'D3' }] } },
      { type: 'faq', copy: { sectionHeadline: 'FAQ', faqs: [{ question: 'Q1?', answer: 'A1.' }, { question: 'Q2?', answer: 'A2.' }, { question: 'Q3?', answer: 'A3.' }] } },
    ]);
    session.artifacts.pageSpec!.metaDescription = 'A test site.';
    mockGetBuildSession.mockResolvedValue(session);

    mockGetFoundationDoc.mockResolvedValue({
      type: 'design-principles',
      content: makeDesignDoc(VALID_DESIGN_TOKENS),
      generatedAt: '2026-02-19',
      editedAt: null,
    });

    const tools = await getTools();
    const getCtx = findTool(tools, 'get_idea_context');
    await getCtx.execute({});
    const evaluate = findTool(tools, 'evaluate_brand');
    const result = await evaluate.execute({});
    expect(result.faqCount).toBe(3);
  });
});

describe('design_brand tool removed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupIdea();
    mockGetBuildSession.mockResolvedValue(makeSession());
  });

  it('design_brand tool no longer exists', async () => {
    const tools = await createWebsiteTools('idea-1');
    const designBrand = tools.find((t) => t.name === 'design_brand');
    expect(designBrand).toBeUndefined();
  });

  it('lock_section_copy tool exists', async () => {
    const tools = await createWebsiteTools('idea-1');
    const lock = tools.find((t) => t.name === 'lock_section_copy');
    expect(lock).toBeDefined();
  });

  it('lock_page_meta tool exists', async () => {
    const tools = await createWebsiteTools('idea-1');
    const lockMeta = tools.find((t) => t.name === 'lock_page_meta');
    expect(lockMeta).toBeDefined();
  });
});
