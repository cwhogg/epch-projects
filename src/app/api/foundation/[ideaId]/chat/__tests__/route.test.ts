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

import { POST } from '@/app/api/foundation/[ideaId]/chat/route';
import { isRedisConfigured, getFoundationDoc } from '@/lib/db';
import { getAnthropic } from '@/lib/anthropic';
import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';

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
