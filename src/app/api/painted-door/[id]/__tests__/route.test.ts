import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  isRedisConfigured: vi.fn().mockReturnValue(true),
}));

const mockGetPaintedDoorProgress = vi.fn();
const mockGetPaintedDoorSite = vi.fn();
const mockGetBuildSession = vi.fn();
const mockDeletePaintedDoorProgress = vi.fn();
const mockDeletePaintedDoorSite = vi.fn();

vi.mock('@/lib/painted-door-db', () => ({
  getPaintedDoorProgress: (...args: unknown[]) => mockGetPaintedDoorProgress(...args),
  getPaintedDoorSite: (...args: unknown[]) => mockGetPaintedDoorSite(...args),
  getBuildSession: (...args: unknown[]) => mockGetBuildSession(...args),
  deletePaintedDoorProgress: (...args: unknown[]) => mockDeletePaintedDoorProgress(...args),
  deletePaintedDoorSite: (...args: unknown[]) => mockDeletePaintedDoorSite(...args),
}));

import { GET } from '../route';

function makeGetRequest(id: string) {
  return new Request(`http://localhost/api/painted-door/${id}`, { method: 'GET' });
}

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET /api/painted-door/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns buildSession data when a session exists and no progress/site', async () => {
    mockGetPaintedDoorProgress.mockResolvedValue(null);
    mockGetPaintedDoorSite.mockResolvedValue(null);
    mockGetBuildSession.mockResolvedValue({
      mode: 'interactive',
      currentStep: 2,
      steps: [
        { name: 'Extract Ingredients', status: 'complete' },
        { name: 'Design Brand Identity', status: 'complete' },
        { name: 'Write Hero', status: 'active' },
      ],
    });

    const response = await GET(makeGetRequest('idea-1'), makeParams('idea-1'));
    const body = await response.json();

    expect(body.buildSession).toBeDefined();
    expect(body.buildSession.mode).toBe('interactive');
    expect(body.buildSession.currentStep).toBe(2);
    expect(body.buildSession.steps).toHaveLength(3);
  });

  it('returns normal progress data when no session exists', async () => {
    mockGetPaintedDoorProgress.mockResolvedValue({
      ideaId: 'idea-1',
      status: 'running',
      currentStep: 'Designing brand identity',
      steps: [],
    });
    mockGetBuildSession.mockResolvedValue(null);

    const response = await GET(makeGetRequest('idea-1'), makeParams('idea-1'));
    const body = await response.json();

    expect(body.status).toBe('running');
    expect(body.currentStep).toBe('Designing brand identity');
    expect(body.buildSession).toBeUndefined();
  });

  it('returns complete status with buildSession when site is live and session exists', async () => {
    mockGetPaintedDoorProgress.mockResolvedValue(null);
    mockGetPaintedDoorSite.mockResolvedValue({
      id: 'site-1',
      siteUrl: 'https://test.vercel.app',
      status: 'live',
    });
    mockGetBuildSession.mockResolvedValue({
      mode: 'autonomous',
      currentStep: 7,
      steps: [
        { name: 'Extract Ingredients', status: 'complete' },
        { name: 'Verify', status: 'complete' },
      ],
    });

    const response = await GET(makeGetRequest('idea-1'), makeParams('idea-1'));
    const body = await response.json();

    expect(body.status).toBe('complete');
    expect(body.result.siteUrl).toBe('https://test.vercel.app');
    expect(body.buildSession).toBeDefined();
    expect(body.buildSession.mode).toBe('autonomous');
  });

  it('returns not_started when nothing exists', async () => {
    mockGetPaintedDoorProgress.mockResolvedValue(null);
    mockGetPaintedDoorSite.mockResolvedValue(null);
    mockGetBuildSession.mockResolvedValue(null);

    const response = await GET(makeGetRequest('idea-1'), makeParams('idea-1'));
    const body = await response.json();

    expect(body.status).toBe('not_started');
    expect(body.buildSession).toBeUndefined();
  });

  it('handles Redis error on getBuildSession gracefully', async () => {
    mockGetPaintedDoorProgress.mockResolvedValue(null);
    mockGetPaintedDoorSite.mockResolvedValue(null);
    mockGetBuildSession.mockRejectedValue(new Error('Redis connection refused'));

    const response = await GET(makeGetRequest('idea-1'), makeParams('idea-1'));
    // The GET handler wraps in try/catch — should return 500
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it('includes buildSession when both legacy progress and session exist', async () => {
    mockGetPaintedDoorProgress.mockResolvedValue({
      ideaId: 'idea-1',
      status: 'running',
      currentStep: 'Building site',
      steps: [],
    });
    mockGetBuildSession.mockResolvedValue({
      mode: 'interactive',
      currentStep: 6,
      steps: [{ name: 'Build & Deploy', status: 'active' }],
    });

    const response = await GET(makeGetRequest('idea-1'), makeParams('idea-1'));
    const body = await response.json();

    expect(body.status).toBe('running');
    expect(body.buildSession).toBeDefined();
    expect(body.buildSession.currentStep).toBe(6);
  });
});

describe('GET /api/painted-door/[id] - Redis not configured', () => {
  it('returns 500 when Redis is not configured', async () => {
    const { isRedisConfigured } = await import('@/lib/db');
    (isRedisConfigured as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const response = await GET(makeGetRequest('idea-1'), makeParams('idea-1'));
    expect(response.status).toBe(500);

    // Restore
    (isRedisConfigured as ReturnType<typeof vi.fn>).mockReturnValue(true);
  });
});
