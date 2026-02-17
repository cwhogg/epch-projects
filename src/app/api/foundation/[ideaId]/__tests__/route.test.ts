import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  isRedisConfigured: vi.fn(),
  getAllFoundationDocs: vi.fn(),
  getFoundationProgress: vi.fn(),
  getFoundationDoc: vi.fn(),
  saveFoundationDoc: vi.fn(),
}));

vi.mock('@/lib/foundation-agent', () => ({
  runFoundationGeneration: vi.fn(),
}));

// Mock next/server after() — runs the async callback synchronously in tests
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    after: (fn: () => Promise<void> | void) => fn(),
  };
});

import { GET, POST, PATCH } from '@/app/api/foundation/[ideaId]/route';
import { isRedisConfigured, getAllFoundationDocs, getFoundationProgress, getFoundationDoc, saveFoundationDoc } from '@/lib/db';
import { runFoundationGeneration } from '@/lib/foundation-agent';

function makeRequest(method: string, body?: Record<string, unknown>): NextRequest {
  const url = 'http://localhost:3000/api/foundation/idea-123';
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(url, init);
}

const params = Promise.resolve({ ideaId: 'idea-123' });

describe('Foundation API route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  describe('GET', () => {
    it('returns docs and progress', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationProgress).mockResolvedValue(null);
      vi.mocked(getAllFoundationDocs).mockResolvedValue({});

      const res = await GET(makeRequest('GET'), { params });
      const body = await res.json();

      expect(body.progress).toEqual({ status: 'not_started' });
      expect(body.docs).toEqual({});
    });

    it('returns 500 when Redis is not configured', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(false);

      const res = await GET(makeRequest('GET'), { params });
      expect(res.status).toBe(500);
    });

    it('returns 500 when Redis throws', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationProgress).mockRejectedValue(new Error('Connection lost'));

      const res = await GET(makeRequest('GET'), { params });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    });
  });

  describe('POST', () => {
    it('starts generation and returns 200', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationProgress).mockResolvedValue(null);
      vi.mocked(runFoundationGeneration).mockResolvedValue();

      const res = await POST(makeRequest('POST'), { params });
      const body = await res.json();

      expect(body.message).toContain('started');
      expect(runFoundationGeneration).toHaveBeenCalledWith('idea-123', undefined, undefined);
    });

    it('passes docType when provided in body', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationProgress).mockResolvedValue(null);
      vi.mocked(runFoundationGeneration).mockResolvedValue();

      const res = await POST(makeRequest('POST', { docType: 'strategy' }), { params });
      const body = await res.json();

      expect(body.message).toContain('started');
      expect(runFoundationGeneration).toHaveBeenCalledWith('idea-123', undefined, 'strategy');
    });

    it('returns early if already running', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationProgress).mockResolvedValue({
        ideaId: 'idea-123',
        status: 'running',
        currentStep: 'Generating...',
        docs: {
          strategy: 'running',
          positioning: 'pending',
          'brand-voice': 'pending',
          'design-principles': 'pending',
          'seo-strategy': 'pending',
          'social-media-strategy': 'pending',
        },
        updatedAt: new Date().toISOString(),
      });

      const res = await POST(makeRequest('POST'), { params });
      const body = await res.json();

      expect(body.message).toContain('Already running');
      expect(runFoundationGeneration).not.toHaveBeenCalled();
    });

    it('allows restart when running status is stale', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      vi.mocked(getFoundationProgress).mockResolvedValue({
        ideaId: 'idea-123',
        status: 'running',
        currentStep: 'Generating...',
        docs: {
          strategy: 'complete',
          positioning: 'pending',
          'brand-voice': 'pending',
          'design-principles': 'pending',
          'seo-strategy': 'pending',
          'social-media-strategy': 'pending',
        },
        updatedAt: staleTime,
      });
      vi.mocked(runFoundationGeneration).mockResolvedValue();

      const res = await POST(makeRequest('POST'), { params });
      const body = await res.json();

      expect(body.message).toContain('started');
      expect(runFoundationGeneration).toHaveBeenCalled();
    });

    it('allows restart when running status has no updatedAt', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationProgress).mockResolvedValue({
        ideaId: 'idea-123',
        status: 'running',
        currentStep: 'Generating...',
        docs: {
          strategy: 'complete',
          positioning: 'pending',
          'brand-voice': 'pending',
          'design-principles': 'pending',
          'seo-strategy': 'pending',
          'social-media-strategy': 'pending',
        },
      });
      vi.mocked(runFoundationGeneration).mockResolvedValue();

      const res = await POST(makeRequest('POST'), { params });
      const body = await res.json();

      expect(body.message).toContain('started');
      expect(runFoundationGeneration).toHaveBeenCalled();
    });

    it('returns 500 when Redis is not configured', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(false);

      const res = await POST(makeRequest('POST'), { params });
      expect(res.status).toBe(500);
    });

    it('returns 500 when ANTHROPIC_API_KEY is missing', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      delete process.env.ANTHROPIC_API_KEY;

      const res = await POST(makeRequest('POST'), { params });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain('ANTHROPIC_API_KEY');
    });
  });

  describe('PATCH', () => {
    it('saves updated content and returns updated doc', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationDoc).mockResolvedValue({
        id: 'strategy',
        ideaId: 'idea-123',
        type: 'strategy',
        content: 'Original content',
        advisorId: 'seth-godin',
        generatedAt: '2026-01-01T00:00:00.000Z',
        editedAt: null,
        version: 1,
      });
      vi.mocked(saveFoundationDoc).mockResolvedValue();

      const res = await PATCH(
        makeRequest('PATCH', { docType: 'strategy', content: 'Updated content' }),
        { params },
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.content).toBe('Updated content');
      expect(body.version).toBe(2);
      expect(body.editedAt).toBeTruthy();
      expect(saveFoundationDoc).toHaveBeenCalledWith('idea-123', expect.objectContaining({
        content: 'Updated content',
        version: 2,
      }));
    });

    it('returns 404 when document does not exist', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationDoc).mockResolvedValue(null);

      const res = await PATCH(
        makeRequest('PATCH', { docType: 'strategy', content: 'Updated' }),
        { params },
      );

      expect(res.status).toBe(404);
    });

    it('returns 400 when docType is missing', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);

      const res = await PATCH(
        makeRequest('PATCH', { content: 'Updated' }),
        { params },
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when content is missing', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);

      const res = await PATCH(
        makeRequest('PATCH', { docType: 'strategy' }),
        { params },
      );

      expect(res.status).toBe(400);
    });

    it('returns 500 when Redis is not configured', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(false);

      const res = await PATCH(
        makeRequest('PATCH', { docType: 'strategy', content: 'Updated' }),
        { params },
      );

      expect(res.status).toBe(500);
    });

    it('returns 500 when saveFoundationDoc throws', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationDoc).mockResolvedValue({
        id: 'strategy',
        ideaId: 'idea-123',
        type: 'strategy',
        content: 'Original',
        advisorId: 'seth-godin',
        generatedAt: '2026-01-01T00:00:00.000Z',
        editedAt: null,
        version: 1,
      });
      vi.mocked(saveFoundationDoc).mockRejectedValue(new Error('Connection lost'));

      const res = await PATCH(
        makeRequest('PATCH', { docType: 'strategy', content: 'Updated' }),
        { params },
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    });

    it('returns 500 when getFoundationDoc throws', async () => {
      vi.mocked(isRedisConfigured).mockReturnValue(true);
      vi.mocked(getFoundationDoc).mockRejectedValue(new Error('Redis timeout'));

      const res = await PATCH(
        makeRequest('PATCH', { docType: 'strategy', content: 'Updated' }),
        { params },
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    });
  });
});
