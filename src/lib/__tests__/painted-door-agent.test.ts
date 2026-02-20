import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PaintedDoorSite, ContentContext } from '@/types';

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
vi.mock('../anthropic', () => ({
  getAnthropic: () => ({ messages: { create: mockCreate } }),
}));

vi.mock('../config', () => ({ CLAUDE_MODEL: 'test-model' }));

const mockGetIdeaFromDb = vi.fn();
vi.mock('../db', () => ({
  getIdeaFromDb: (...args: unknown[]) => mockGetIdeaFromDb(...args),
  getContentCalendar: vi.fn().mockResolvedValue(null),
  saveContentCalendar: vi.fn(),
}));

const mockBuildContentContext = vi.fn();
vi.mock('../content-agent', () => ({
  buildContentContext: (...args: unknown[]) => mockBuildContentContext(...args),
}));

vi.mock('../painted-door-prompts', () => ({
  buildBrandIdentityPrompt: () => 'brand prompt',
}));

vi.mock('../painted-door-templates', () => ({
  assembleAllFiles: () => ({ 'app/page.tsx': 'export default function Home(){}' }),
}));

const mockSaveSite = vi.fn();
const mockSaveProgress = vi.fn();
const mockGetSite = vi.fn();
const mockSavePublishTarget = vi.fn();
vi.mock('../painted-door-db', () => ({
  savePaintedDoorSite: (...args: unknown[]) => mockSaveSite(...args),
  savePaintedDoorProgress: (...args: unknown[]) => mockSaveProgress(...args),
  getPaintedDoorSite: (...args: unknown[]) => mockGetSite(...args),
  saveDynamicPublishTarget: (...args: unknown[]) => mockSavePublishTarget(...args),
}));

const mockCreateGitHubRepo = vi.fn();
const mockPushFiles = vi.fn();
const mockCreateVercelProject = vi.fn();
const mockTriggerDeploy = vi.fn();
vi.mock('../github-api', () => ({
  createGitHubRepo: (...args: unknown[]) => mockCreateGitHubRepo(...args),
  pushFilesToGitHub: (...args: unknown[]) => mockPushFiles(...args),
  createVercelProject: (...args: unknown[]) => mockCreateVercelProject(...args),
  triggerDeployViaGitPush: (...args: unknown[]) => mockTriggerDeploy(...args),
}));

// Mock fetch for waitForDeployment and verify
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Set env vars
vi.stubEnv('VERCEL_TOKEN', 'test-token');

import { runPaintedDoorAgent } from '../painted-door-agent';

// --- Helpers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeBrand(overrides?: Record<string, any>): any {
  return {
    siteName: 'Test Site',
    tagline: 'A tagline',
    siteUrl: '',
    colors: {
      primary: '#000', primaryLight: '#333', background: '#111',
      backgroundElevated: '#222', text: '#fff', textSecondary: '#ccc',
      textMuted: '#999', accent: '#0ff', border: '#444',
    },
    fonts: { heading: 'Inter', body: 'Inter', mono: 'Fira Code' },
    theme: 'dark' as const,
    landingPage: {
      heroHeadline: 'Welcome', heroSubheadline: 'Sub', ctaText: 'Go',
      valueProps: [{ title: 'Fast', description: 'Very fast' }],
      faqs: [{ question: 'Q?', answer: 'A.' }],
    },
    ...overrides,
  };
}

function setupHappyPath(existingSite?: PaintedDoorSite | null) {
  mockGetIdeaFromDb.mockResolvedValue({ id: 'idea-1', name: 'Test Idea', description: 'desc' });
  mockBuildContentContext.mockResolvedValue({
    ideaName: 'Test', ideaDescription: 'desc', targetUser: 'devs',
    problemSolved: 'bugs', summary: 'summary', competitors: 'none', url: 'https://test.vercel.app',
  } satisfies ContentContext);
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(makeBrand()) }],
    stop_reason: 'end_turn',
  });
  mockGetSite.mockResolvedValue(existingSite ?? null);
  mockCreateGitHubRepo.mockResolvedValue({ owner: 'user', name: 'test-idea', url: 'https://github.com/user/test-idea' });
  mockPushFiles.mockResolvedValue('abc1234def');
  mockCreateVercelProject.mockResolvedValue({ projectId: 'prj_123' });
  mockTriggerDeploy.mockResolvedValue(undefined);
  // waitForDeployment polls, then verify HEAD
  mockFetch.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('api.vercel.com/v6/deployments')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ deployments: [{ state: 'READY', url: 'test.vercel.app' }] }),
      });
    }
    if (typeof url === 'string' && url.includes('api.vercel.com/v9/projects')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ name: 'test-idea' }),
      });
    }
    // HEAD verify
    return Promise.resolve({ ok: true });
  });
}

// --- Tests ---

describe('runPaintedDoorAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails when LLM response is truncated (max_tokens)', async () => {
    mockGetIdeaFromDb.mockResolvedValue({ id: 'idea-1', name: 'Test', description: 'desc' });
    mockBuildContentContext.mockResolvedValue({
      ideaName: 'Test', ideaDescription: 'desc', targetUser: 'devs',
      problemSolved: 'bugs', summary: 'summary', competitors: 'none',
    });
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"siteName":"Trunc' }],
      stop_reason: 'max_tokens',
    });
    mockGetSite.mockResolvedValue(null);

    await runPaintedDoorAgent('idea-1');

    // Should have saved error status
    const errorCall = mockSaveProgress.mock.calls.find(
      (c: unknown[]) => (c[1] as { status: string }).status === 'error',
    );
    expect(errorCall).toBeTruthy();
    expect((errorCall![1] as { error: string }).error).toContain('truncated');
  });

  it('fails when brand is missing landingPage', async () => {
    mockGetIdeaFromDb.mockResolvedValue({ id: 'idea-1', name: 'Test', description: 'desc' });
    mockBuildContentContext.mockResolvedValue({
      ideaName: 'Test', ideaDescription: 'desc', targetUser: 'devs',
      problemSolved: 'bugs', summary: 'summary', competitors: 'none',
    });
    const brandWithout = makeBrand({ landingPage: undefined });
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(brandWithout) }],
      stop_reason: 'end_turn',
    });
    mockGetSite.mockResolvedValue(null);

    await runPaintedDoorAgent('idea-1');

    const errorCall = mockSaveProgress.mock.calls.find(
      (c: unknown[]) => (c[1] as { status: string }).status === 'error',
    );
    expect(errorCall).toBeTruthy();
    expect((errorCall![1] as { error: string }).error).toContain('missing landingPage');
  });

  it('reuses existing repo and Vercel project on rebuild', async () => {
    const existingSite: PaintedDoorSite = {
      id: 'pd-test-idea',
      ideaId: 'idea-1',
      ideaName: 'Test Idea',
      brand: makeBrand(),
      repoOwner: 'user',
      repoName: 'existing-repo',
      repoUrl: 'https://github.com/user/existing-repo',
      siteUrl: 'https://existing-repo.vercel.app',
      vercelProjectId: 'prj_existing',
      status: 'live',
      createdAt: '2026-01-01T00:00:00Z',
      signupCount: 5,
    };
    setupHappyPath(existingSite);

    await runPaintedDoorAgent('idea-1');

    // Should NOT create a new GitHub repo
    expect(mockCreateGitHubRepo).not.toHaveBeenCalled();
    // Should NOT create a new Vercel project
    expect(mockCreateVercelProject).not.toHaveBeenCalled();
    // Should push files to existing repo
    expect(mockPushFiles).toHaveBeenCalledWith('user', 'existing-repo', expect.anything(), 'Rebuild: updated site');
    // Should preserve signup count
    const siteCall = mockSaveSite.mock.calls[0];
    expect((siteCall[0] as PaintedDoorSite).signupCount).toBe(5);
  });

  it('creates new repo and Vercel project on first build', async () => {
    setupHappyPath(null);

    await runPaintedDoorAgent('idea-1');

    expect(mockCreateGitHubRepo).toHaveBeenCalled();
    expect(mockCreateVercelProject).toHaveBeenCalled();
    expect(mockPushFiles).toHaveBeenCalledWith('user', 'test-idea', expect.anything(), 'Initial commit: painted door test site');
  });
});
