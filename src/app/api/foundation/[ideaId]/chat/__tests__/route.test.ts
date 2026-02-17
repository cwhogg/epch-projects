import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  isRedisConfigured: vi.fn(),
  getFoundationDoc: vi.fn(),
}));

vi.mock('@/lib/anthropic', () => ({
  getAnthropic: vi.fn(),
}));

vi.mock('@/lib/advisors/prompt-loader', () => ({
  getAdvisorSystemPrompt: vi.fn(),
}));

vi.mock('@/lib/agent-tools/foundation', () => ({
  DOC_ADVISOR_MAP: {
    'strategy': 'seth-godin',
    'positioning': 'april-dunford',
    'brand-voice': 'copywriter',
    'design-principles': 'richard-rumelt',
    'seo-strategy': 'seo-expert',
    'social-media-strategy': 'april-dunford',
  },
}));

vi.mock('@/lib/content-context', () => ({
  buildContentContext: vi.fn(),
}));

import { POST } from '@/app/api/foundation/[ideaId]/chat/route';
import { isRedisConfigured, getFoundationDoc } from '@/lib/db';
import { getAnthropic } from '@/lib/anthropic';
import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';
import { buildContentContext } from '@/lib/content-context';

const mockAnalysisContext = {
  ideaName: 'TestApp',
  ideaDescription: 'A test app for developers',
  targetUser: 'indie developers',
  problemSolved: 'testing workflow',
  scores: {},
  summary: 'Test summary',
  risks: [],
  topKeywords: [
    { keyword: 'dev tools', intentType: 'informational', estimatedVolume: '1000', estimatedCompetitiveness: 'medium', contentGapHypothesis: '', relevanceToMillionARR: '' },
  ],
  serpValidated: [],
  contentStrategy: { topOpportunities: [], recommendedAngle: '' },
  difficultyAssessment: { dominantPlayers: [], roomForNewEntrant: false, reasoning: '' },
  competitors: 'Competitor A, Competitor B',
  expertiseProfile: '',
};

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/foundation/idea-123/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const params = Promise.resolve({ ideaId: 'idea-123' });

function createMockStream(texts: string[]) {
  let index = 0;
  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (index < texts.length) {
            return {
              value: { type: 'content_block_delta', delta: { type: 'text_delta', text: texts[index++] } },
              done: false,
            };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}

async function readStream(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  return text;
}

describe('Foundation Chat API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    // Default: analysis context available (most tests need this)
    vi.mocked(buildContentContext).mockResolvedValue(mockAnalysisContext);
  });

  it('streams advisor response for valid request', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getFoundationDoc).mockResolvedValue({
      id: 'strategy', ideaId: 'idea-123', type: 'strategy',
      content: 'Original', advisorId: 'seth-godin',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
    });
    vi.mocked(getAdvisorSystemPrompt).mockReturnValue('You are Seth Godin...');

    const mockStream = createMockStream(['Hello', ' there']);
    vi.mocked(getAnthropic).mockReturnValue({
      messages: { stream: vi.fn().mockReturnValue(mockStream) },
    } as unknown as ReturnType<typeof getAnthropic>);

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Make it more bold' }],
      currentContent: 'Original content',
    }), { params });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');

    const text = await readStream(res);
    expect(text).toBe('Hello there');
  });

  it('calls Anthropic with correct system prompt structure', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getFoundationDoc).mockResolvedValue({
      id: 'strategy', ideaId: 'idea-123', type: 'strategy',
      content: 'Original', advisorId: 'seth-godin',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
    });
    vi.mocked(getAdvisorSystemPrompt).mockReturnValue('You are Seth Godin...');

    const mockStreamFn = vi.fn().mockReturnValue(createMockStream(['OK']));
    vi.mocked(getAnthropic).mockReturnValue({
      messages: { stream: mockStreamFn },
    } as unknown as ReturnType<typeof getAnthropic>);

    await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'My doc content',
    }), { params });

    expect(mockStreamFn).toHaveBeenCalledWith(expect.objectContaining({
      system: expect.stringContaining('You are Seth Godin'),
    }));
    expect(mockStreamFn).toHaveBeenCalledWith(expect.objectContaining({
      system: expect.stringContaining('My doc content'),
    }));
    expect(mockStreamFn).toHaveBeenCalledWith(expect.objectContaining({
      system: expect.stringContaining('<updated_document>'),
    }));
    expect(getAdvisorSystemPrompt).toHaveBeenCalledWith('seth-godin');
  });

  it('returns 400 when docType is missing', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);

    const res = await POST(makeRequest({
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Content',
    }), { params });

    expect(res.status).toBe(400);
  });

  it('returns 400 when messages is missing', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);

    const res = await POST(makeRequest({
      docType: 'strategy',
      currentContent: 'Content',
    }), { params });

    expect(res.status).toBe(400);
  });

  it('returns 400 when currentContent is missing', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
    }), { params });

    expect(res.status).toBe(400);
  });

  it('returns 404 when foundation doc does not exist', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getFoundationDoc).mockResolvedValue(null);

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Content',
    }), { params });

    expect(res.status).toBe(404);
  });

  it('returns 500 when Redis is not configured', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(false);

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Content',
    }), { params });

    expect(res.status).toBe(500);
  });

  it('returns 500 when ANTHROPIC_API_KEY is missing', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getFoundationDoc).mockResolvedValue({
      id: 'strategy', ideaId: 'idea-123', type: 'strategy',
      content: 'Original', advisorId: 'seth-godin',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
    });
    delete process.env.ANTHROPIC_API_KEY;

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Content',
    }), { params });

    expect(res.status).toBe(500);
  });

  it('returns 500 when getFoundationDoc throws', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getFoundationDoc).mockRejectedValue(new Error('Redis error'));

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Content',
    }), { params });

    expect(res.status).toBe(500);
  });

  it('returns 500 when advisor prompt cannot be loaded', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getFoundationDoc).mockResolvedValue({
      id: 'strategy', ideaId: 'idea-123', type: 'strategy',
      content: 'Original', advisorId: 'seth-godin',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
    });
    vi.mocked(getAdvisorSystemPrompt).mockImplementation(() => {
      throw new Error('Unknown advisor: invalid-id');
    });

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Content',
    }), { params });

    expect(res.status).toBe(500);
  });

  it('includes strategy doc with timestamps when editing positioning', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);

    const strategyDoc = {
      id: 'strategy', ideaId: 'idea-123', type: 'strategy' as const,
      content: 'Our smallest viable audience is indie founders...',
      advisorId: 'seth-godin',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: '2026-02-15T10:00:00.000Z', version: 2,
    };
    const positioningDoc = {
      id: 'positioning', ideaId: 'idea-123', type: 'positioning' as const,
      content: 'Current positioning', advisorId: 'april-dunford',
      generatedAt: '2026-01-05T00:00:00.000Z', editedAt: null, version: 1,
    };

    vi.mocked(getFoundationDoc).mockImplementation(async (_id, type) => {
      if (type === 'positioning') return positioningDoc;
      if (type === 'strategy') return strategyDoc;
      return null;
    });
    vi.mocked(getAdvisorSystemPrompt).mockReturnValue('You are April Dunford...');

    const mockStreamFn = vi.fn().mockReturnValue(createMockStream(['OK']));
    vi.mocked(getAnthropic).mockReturnValue({
      messages: { stream: mockStreamFn },
    } as unknown as ReturnType<typeof getAnthropic>);

    await POST(makeRequest({
      docType: 'positioning',
      messages: [{ role: 'user', content: 'Rewrite based on updated strategy' }],
      currentContent: 'Current positioning',
    }), { params });

    const systemPrompt = mockStreamFn.mock.calls[0][0].system;
    expect(systemPrompt).toContain('RELATED FOUNDATION DOCUMENTS');
    expect(systemPrompt).toContain('STRATEGY');
    expect(systemPrompt).toContain('Our smallest viable audience is indie founders');
    // Strategy shows its editedAt timestamp (newer)
    expect(systemPrompt).toContain('last updated: 2026-02-15T10:00:00.000Z');
    // Current doc shows its generatedAt timestamp (older, since editedAt is null)
    expect(systemPrompt).toContain('last updated: 2026-01-05T00:00:00.000Z');
  });

  it('includes strategy AND positioning when editing downstream docs like seo-strategy', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);

    const strategyDoc = {
      id: 'strategy', ideaId: 'idea-123', type: 'strategy' as const,
      content: 'Strategy: target indie founders',
      advisorId: 'seth-godin',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
    };
    const positioningDoc = {
      id: 'positioning', ideaId: 'idea-123', type: 'positioning' as const,
      content: 'Positioning: the fastest dev tool',
      advisorId: 'april-dunford',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
    };
    const seoDoc = {
      id: 'seo-strategy', ideaId: 'idea-123', type: 'seo-strategy' as const,
      content: 'SEO strategy content', advisorId: 'seo-expert',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
    };

    vi.mocked(getFoundationDoc).mockImplementation(async (_id, type) => {
      if (type === 'seo-strategy') return seoDoc;
      if (type === 'strategy') return strategyDoc;
      if (type === 'positioning') return positioningDoc;
      return null;
    });
    vi.mocked(getAdvisorSystemPrompt).mockReturnValue('You are an SEO expert...');

    const mockStreamFn = vi.fn().mockReturnValue(createMockStream(['OK']));
    vi.mocked(getAnthropic).mockReturnValue({
      messages: { stream: mockStreamFn },
    } as unknown as ReturnType<typeof getAnthropic>);

    await POST(makeRequest({
      docType: 'seo-strategy',
      messages: [{ role: 'user', content: 'Update based on new positioning' }],
      currentContent: 'SEO strategy content',
    }), { params });

    const systemPrompt = mockStreamFn.mock.calls[0][0].system;
    expect(systemPrompt).toContain('STRATEGY');
    expect(systemPrompt).toContain('Strategy: target indie founders');
    expect(systemPrompt).toContain('POSITIONING');
    expect(systemPrompt).toContain('Positioning: the fastest dev tool');
  });

  it('includes analysis results in system prompt', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getFoundationDoc).mockResolvedValue({
      id: 'strategy', ideaId: 'idea-123', type: 'strategy',
      content: 'Original', advisorId: 'seth-godin',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
    });
    vi.mocked(getAdvisorSystemPrompt).mockReturnValue('You are Seth Godin...');

    const mockStreamFn = vi.fn().mockReturnValue(createMockStream(['OK']));
    vi.mocked(getAnthropic).mockReturnValue({
      messages: { stream: mockStreamFn },
    } as unknown as ReturnType<typeof getAnthropic>);

    await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Strategy content',
    }), { params });

    const systemPrompt = mockStreamFn.mock.calls[0][0].system;
    expect(systemPrompt).toContain('ANALYSIS RESULTS');
    expect(systemPrompt).toContain('TestApp');
    expect(systemPrompt).toContain('indie developers');
    expect(systemPrompt).toContain('Competitor A, Competitor B');
    expect(systemPrompt).toContain('dev tools');
  });

  it('does not include foundation docs section when editing strategy (no context deps)', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getFoundationDoc).mockResolvedValue({
      id: 'strategy', ideaId: 'idea-123', type: 'strategy',
      content: 'Original', advisorId: 'seth-godin',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
    });
    vi.mocked(getAdvisorSystemPrompt).mockReturnValue('You are Seth Godin...');

    const mockStreamFn = vi.fn().mockReturnValue(createMockStream(['OK']));
    vi.mocked(getAnthropic).mockReturnValue({
      messages: { stream: mockStreamFn },
    } as unknown as ReturnType<typeof getAnthropic>);

    await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Strategy content',
    }), { params });

    const systemPrompt = mockStreamFn.mock.calls[0][0].system;
    expect(systemPrompt).not.toContain('RELATED FOUNDATION DOCUMENTS');
  });

  it('gracefully handles missing context doc', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);

    // positioning doc exists, but strategy (context dep) does not
    vi.mocked(getFoundationDoc).mockImplementation(async (_id, type) => {
      if (type === 'positioning') return {
        id: 'positioning', ideaId: 'idea-123', type: 'positioning' as const,
        content: 'Positioning content', advisorId: 'april-dunford',
        generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
      };
      return null;
    });
    vi.mocked(getAdvisorSystemPrompt).mockReturnValue('You are April Dunford...');

    const mockStreamFn = vi.fn().mockReturnValue(createMockStream(['OK']));
    vi.mocked(getAnthropic).mockReturnValue({
      messages: { stream: mockStreamFn },
    } as unknown as ReturnType<typeof getAnthropic>);

    const res = await POST(makeRequest({
      docType: 'positioning',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Positioning content',
    }), { params });

    // Should still work, just without the context doc
    expect(res.status).toBe(200);
    const systemPrompt = mockStreamFn.mock.calls[0][0].system;
    expect(systemPrompt).not.toContain('RELATED FOUNDATION DOCUMENTS');
  });

  it('works when analysis context is unavailable', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(buildContentContext).mockResolvedValue(null);
    vi.mocked(getFoundationDoc).mockResolvedValue({
      id: 'strategy', ideaId: 'idea-123', type: 'strategy',
      content: 'Original', advisorId: 'seth-godin',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
    });
    vi.mocked(getAdvisorSystemPrompt).mockReturnValue('You are Seth Godin...');

    const mockStreamFn = vi.fn().mockReturnValue(createMockStream(['OK']));
    vi.mocked(getAnthropic).mockReturnValue({
      messages: { stream: mockStreamFn },
    } as unknown as ReturnType<typeof getAnthropic>);

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Strategy content',
    }), { params });

    expect(res.status).toBe(200);
    const systemPrompt = mockStreamFn.mock.calls[0][0].system;
    expect(systemPrompt).not.toContain('ANALYSIS RESULTS');
  });

  it('returns 500 when stream creation fails', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(getFoundationDoc).mockResolvedValue({
      id: 'strategy', ideaId: 'idea-123', type: 'strategy',
      content: 'Original', advisorId: 'seth-godin',
      generatedAt: '2026-01-01T00:00:00.000Z', editedAt: null, version: 1,
    });
    vi.mocked(getAdvisorSystemPrompt).mockReturnValue('You are Seth Godin...');
    vi.mocked(getAnthropic).mockReturnValue({
      messages: { stream: vi.fn().mockImplementation(() => { throw new Error('API error'); }) },
    } as unknown as ReturnType<typeof getAnthropic>);

    const res = await POST(makeRequest({
      docType: 'strategy',
      messages: [{ role: 'user', content: 'Test' }],
      currentContent: 'Content',
    }), { params });

    expect(res.status).toBe(500);
  });
});
