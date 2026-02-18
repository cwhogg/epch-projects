import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  getIdeaFromDb: vi.fn(),
  getProgress: vi.fn(),
  fetchFoundationDocs: vi.fn(),
  isRedisConfigured: vi.fn(),
}));

vi.mock('@/lib/research-agent', () => ({
  runResearchAgentAuto: vi.fn(),
}));

vi.mock('@/lib/research-agent-prompts', () => ({
  buildFoundationContext: vi.fn(),
}));

// Mock next/server after() — runs the async callback synchronously in tests
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    after: (fn: () => Promise<void> | void) => fn(),
  };
});

import { POST, buildEnrichedContext } from '@/app/api/analyze/[id]/route';
import { getIdeaFromDb, fetchFoundationDocs, isRedisConfigured } from '@/lib/db';
import { runResearchAgentAuto } from '@/lib/research-agent';
import { buildFoundationContext } from '@/lib/research-agent-prompts';
import { FoundationDocument } from '@/types';

function makeRequest(body?: Record<string, unknown>): NextRequest {
  const url = 'http://localhost:3000/api/analyze/idea-123';
  const init: RequestInit = { method: 'POST' };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(url, init);
}

const params = Promise.resolve({ id: 'idea-123' });

function makeFoundationDoc(type: 'strategy' | 'positioning'): FoundationDocument {
  return {
    id: type,
    ideaId: 'idea-123',
    type,
    content: `${type} content here`,
    advisorId: 'test-advisor',
    generatedAt: '2026-02-12T00:00:00.000Z',
    editedAt: null,
    version: 1,
  };
}

describe('buildEnrichedContext', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns original additionalContext when no foundation docs exist', async () => {
    vi.mocked(fetchFoundationDocs).mockResolvedValue([]);
    vi.mocked(buildFoundationContext).mockReturnValue('');

    const result = await buildEnrichedContext('idea-123', 'Focus on healthcare');
    expect(result).toBe('Focus on healthcare');
  });

  it('prepends foundation context when strategy doc exists', async () => {
    vi.mocked(fetchFoundationDocs).mockResolvedValue([makeFoundationDoc('strategy')]);
    vi.mocked(buildFoundationContext).mockReturnValue('STRATEGIC CONTEXT...');

    const result = await buildEnrichedContext('idea-123', 'Focus on healthcare');
    expect(result).toContain('STRATEGIC CONTEXT...');
    expect(result).toContain('Focus on healthcare');
    expect(result!.indexOf('STRATEGIC CONTEXT...')).toBeLessThan(result!.indexOf('Focus on healthcare'));
  });

  it('prepends both strategy + positioning when both exist', async () => {
    vi.mocked(fetchFoundationDocs).mockResolvedValue([
      makeFoundationDoc('strategy'),
      makeFoundationDoc('positioning'),
    ]);
    vi.mocked(buildFoundationContext).mockReturnValue('STRATEGIC CONTEXT with both');

    const result = await buildEnrichedContext('idea-123', 'my context');
    expect(result).toContain('STRATEGIC CONTEXT with both');
    expect(buildFoundationContext).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: 'strategy' }),
        expect.objectContaining({ type: 'positioning' }),
      ])
    );
  });

  it('returns foundation context alone when additionalContext is undefined', async () => {
    vi.mocked(fetchFoundationDocs).mockResolvedValue([makeFoundationDoc('strategy')]);
    vi.mocked(buildFoundationContext).mockReturnValue('STRATEGIC CONTEXT...');

    const result = await buildEnrichedContext('idea-123');
    expect(result).toBe('STRATEGIC CONTEXT...');
  });

  it('returns original additionalContext when fetchFoundationDocs returns empty on error', async () => {
    vi.mocked(fetchFoundationDocs).mockResolvedValue([]);
    vi.mocked(buildFoundationContext).mockReturnValue('');

    const result = await buildEnrichedContext('idea-123', 'my context');
    expect(result).toBe('my context');
  });

  it('delegates to fetchFoundationDocs with the correct ideaId', async () => {
    vi.mocked(fetchFoundationDocs).mockResolvedValue([]);
    vi.mocked(buildFoundationContext).mockReturnValue('');

    await buildEnrichedContext('idea-123');
    expect(fetchFoundationDocs).toHaveBeenCalledTimes(1);
    expect(fetchFoundationDocs).toHaveBeenCalledWith('idea-123');
  });
});

describe('POST /api/analyze/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('returns 200 with analysis started message', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getIdeaFromDb).mockResolvedValue({
      id: 'idea-123',
      name: 'Test',
      description: 'Test desc',
      targetUser: 'devs',
      problemSolved: 'testing',
      createdAt: '2026-01-01',
      status: 'pending',
    });
    vi.mocked(fetchFoundationDocs).mockResolvedValue([]);
    vi.mocked(buildFoundationContext).mockReturnValue('');
    vi.mocked(runResearchAgentAuto).mockResolvedValue(undefined as never);

    const res = await POST(makeRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toContain('Analysis started');
  });

  it('returns 404 when idea not found', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getIdeaFromDb).mockResolvedValue(null);

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it('returns 500 when Redis not configured', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(false);

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(500);
  });
});
