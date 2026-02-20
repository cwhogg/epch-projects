import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks (same pattern as website-lock-tools.test.ts) ---

const mockRedis = { set: vi.fn(), get: vi.fn(), del: vi.fn() };

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
const mockGetFoundationDoc = vi.fn();
vi.mock('../../db', () => ({
  getIdeaFromDb: (...args: unknown[]) => mockGetIdeaFromDb(...args),
  getContentCalendar: vi.fn().mockResolvedValue(null),
  saveContentCalendar: vi.fn(),
  getAllFoundationDocs: vi.fn().mockResolvedValue({}),
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

// --- Helpers ---

function makeSession(brand?: Record<string, unknown>) {
  return {
    ideaId: 'idea-1',
    mode: 'chat',
    currentStep: 0,
    currentSubstep: 0,
    steps: [],
    artifacts: {
      pageSpec: { sections: [], metaTitle: '', metaDescription: '', ogDescription: '' },
      ...(brand !== undefined ? { brand } : {}),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function setupIdea() {
  mockGetIdeaFromDb.mockResolvedValue({
    id: 'idea-1', name: 'Test Idea', description: 'desc',
    targetUser: 'devs', problemSolved: 'bugs',
  });
  mockBuildContentContext.mockResolvedValue({
    ideaName: 'Test', ideaDescription: 'desc', targetUser: 'devs',
    problemSolved: 'bugs', summary: 'summary', competitors: 'none',
    topKeywords: [{ keyword: 'test', intentType: 'info', estimatedVolume: 'high', estimatedCompetitiveness: 'low', contentGapHypothesis: '' }],
    serpValidated: [], contentStrategy: { recommendedAngle: 'test', topOpportunities: ['op1'] },
  });
}

const VALID_BRAND_INPUT = {
  siteName: 'TestBrand',
  tagline: 'Test all the things',
  theme: 'light',
  colors: {
    primary: '#2563EB', primaryLight: '#3B82F6', background: '#FFFFFF',
    backgroundElevated: '#F9FAFB', text: '#111827', textSecondary: '#4B5563',
    textMuted: '#9CA3AF', accent: '#10B981', border: '#E5E7EB',
  },
  fonts: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' },
};

async function getTools() {
  const tools = await createWebsiteTools('idea-1');
  return tools;
}

function findTool(tools: Awaited<ReturnType<typeof createWebsiteTools>>, name: string) {
  return tools.find((t) => t.name === name)!;
}

// --- Tests ---

describe('lock_brand tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupIdea();
    mockGetBuildSession.mockResolvedValue(makeSession());
    mockSaveBuildSession.mockResolvedValue(undefined);
  });

  it('locks valid brand and returns success with fields', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute(VALID_BRAND_INPUT);
    expect(result.success).toBe(true);
    expect(result.siteName).toBe('TestBrand');
    expect(result.theme).toBe('light');
    expect(mockSaveBuildSession).toHaveBeenCalled();
    // Verify brand was stored in session artifacts
    const savedSession = mockSaveBuildSession.mock.calls[0][1];
    expect(savedSession.artifacts.brand).toBeDefined();
    expect(savedSession.artifacts.brand.siteName).toBe('TestBrand');
    expect(savedSession.artifacts.brand.siteUrl).toBe('');
  });

  it('returns error for invalid hex color', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute({
      ...VALID_BRAND_INPUT,
      colors: { ...VALID_BRAND_INPUT.colors, primary: 'not-hex' },
    });
    expect(result.error).toContain('primary');
  });

  it('returns error for 3-digit hex shorthand', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute({
      ...VALID_BRAND_INPUT,
      colors: { ...VALID_BRAND_INPUT.colors, background: '#FFF' },
    });
    expect(result.error).toContain('background');
  });

  it('returns error for invalid theme value', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute({ ...VALID_BRAND_INPUT, theme: 'neon' });
    expect(result.error).toContain('theme');
  });

  it('returns error for empty font field', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute({
      ...VALID_BRAND_INPUT,
      fonts: { heading: '', body: 'Inter', mono: 'JetBrains Mono' },
    });
    expect(result.error).toContain('heading');
  });

  it('returns error for missing siteName', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const { siteName: _, ...withoutSiteName } = VALID_BRAND_INPUT;
    const result = await lock.execute(withoutSiteName);
    expect(result.error).toContain('siteName');
  });

  it('returns error for missing colors object', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const { colors: _, ...withoutColors } = VALID_BRAND_INPUT;
    const result = await lock.execute(withoutColors);
    expect(result.error).toContain('colors');
  });

  it('returns warning for low WCAG contrast but still saves brand', async () => {
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute({
      ...VALID_BRAND_INPUT,
      colors: { ...VALID_BRAND_INPUT.colors, text: '#CCCCCC', background: '#FFFFFF' },
    });
    expect(result.success).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('contrast');
    // Brand should still be saved
    expect(mockSaveBuildSession).toHaveBeenCalled();
  });

  it('rejects overwrite when brand already locked and overwrite not set', async () => {
    mockGetBuildSession.mockResolvedValue(makeSession(VALID_BRAND_INPUT as unknown as Record<string, unknown>));
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute(VALID_BRAND_INPUT);
    expect(result.error).toContain('already locked');
  });

  it('allows overwrite when overwrite is true', async () => {
    mockGetBuildSession.mockResolvedValue(makeSession(VALID_BRAND_INPUT as unknown as Record<string, unknown>));
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute({ ...VALID_BRAND_INPUT, overwrite: true });
    expect(result.success).toBe(true);
  });

  it('returns error when no build session exists', async () => {
    mockGetBuildSession.mockResolvedValue(null);
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute(VALID_BRAND_INPUT);
    expect(result.error).toContain('build session');
  });

  it('surfaces Redis save failure', async () => {
    mockSaveBuildSession.mockRejectedValue(new Error('Redis connection lost'));
    const tools = await getTools();
    const lock = findTool(tools, 'lock_brand');
    const result = await lock.execute(VALID_BRAND_INPUT);
    expect(result.error).toContain('Redis connection lost');
  });
});
