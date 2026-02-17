import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  isRedisConfigured: vi.fn(),
  getAssumption: vi.fn(),
  saveAssumption: vi.fn(),
}));

vi.mock('@/lib/validation-canvas', () => ({
  generatePivotSuggestions: vi.fn(),
}));

import { isRedisConfigured, getAssumption, saveAssumption } from '@/lib/db';
import { generatePivotSuggestions } from '@/lib/validation-canvas';
import { POST } from '@/app/api/validation/[ideaId]/status/route';
import type { Assumption } from '@/types';

const mockAssumption: Assumption = {
  type: 'demand',
  status: 'untested',
  statement: 'Test statement',
  evidence: [],
  threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
  linkedStage: 'analysis',
};

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/validation/idea-1/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ ideaId: 'idea-1' }) };

describe('POST /api/validation/[ideaId]/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isRedisConfigured).mockReturnValue(true);
  });

  it('returns 500 when Redis is not configured', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(false);
    const res = await POST(makeRequest({ type: 'demand', status: 'validated' }), context);
    expect(res.status).toBe(500);
  });

  it('validates an assumption successfully', async () => {
    vi.mocked(getAssumption).mockResolvedValue(mockAssumption);
    vi.mocked(saveAssumption).mockResolvedValue(undefined);

    const res = await POST(makeRequest({ type: 'demand', status: 'validated' }), context);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.assumption.status).toBe('validated');
    expect(data.assumption.validatedAt).toBeDefined();

    expect(saveAssumption).toHaveBeenCalledWith('idea-1', expect.objectContaining({
      status: 'validated',
    }));
  });

  it('invalidates and triggers pivot suggestion generation', async () => {
    vi.mocked(getAssumption).mockResolvedValue(mockAssumption);
    vi.mocked(saveAssumption).mockResolvedValue(undefined);
    vi.mocked(generatePivotSuggestions).mockResolvedValue([]);

    const res = await POST(makeRequest({ type: 'demand', status: 'invalidated' }), context);
    expect(res.status).toBe(200);

    expect(saveAssumption).toHaveBeenCalledWith('idea-1', expect.objectContaining({
      status: 'invalidated',
      invalidatedAt: expect.any(Number),
    }));
    expect(generatePivotSuggestions).toHaveBeenCalledWith('idea-1', 'demand');
  });

  it('does not trigger pivot generation when validating', async () => {
    vi.mocked(getAssumption).mockResolvedValue(mockAssumption);
    vi.mocked(saveAssumption).mockResolvedValue(undefined);

    await POST(makeRequest({ type: 'demand', status: 'validated' }), context);
    expect(generatePivotSuggestions).not.toHaveBeenCalled();
  });

  it('clears timestamps when resetting to untested', async () => {
    const validated = { ...mockAssumption, status: 'validated' as const, validatedAt: 123 };
    vi.mocked(getAssumption).mockResolvedValue(validated);
    vi.mocked(saveAssumption).mockResolvedValue(undefined);

    const res = await POST(makeRequest({ type: 'demand', status: 'untested' }), context);
    expect(res.status).toBe(200);

    expect(saveAssumption).toHaveBeenCalledWith('idea-1', expect.objectContaining({
      status: 'untested',
      validatedAt: undefined,
      invalidatedAt: undefined,
    }));
  });

  it('returns 400 for invalid assumption type', async () => {
    const res = await POST(makeRequest({ type: 'bogus', status: 'validated' }), context);
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing type', async () => {
    const res = await POST(makeRequest({ status: 'validated' }), context);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid status', async () => {
    const res = await POST(makeRequest({ type: 'demand', status: 'bogus' }), context);
    expect(res.status).toBe(400);
  });

  it('returns 400 for malformed JSON', async () => {
    const req = new NextRequest('http://localhost/api/validation/idea-1/status', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, context);
    expect(res.status).toBe(400);
  });

  it('returns 404 when assumption does not exist', async () => {
    vi.mocked(getAssumption).mockResolvedValue(null);

    const res = await POST(makeRequest({ type: 'demand', status: 'validated' }), context);
    expect(res.status).toBe(404);
  });

  it('returns 500 when saveAssumption fails', async () => {
    vi.mocked(getAssumption).mockResolvedValue(mockAssumption);
    vi.mocked(saveAssumption).mockRejectedValue(new Error('Connection lost'));

    const res = await POST(makeRequest({ type: 'demand', status: 'validated' }), context);
    expect(res.status).toBe(500);
  });

  it('still returns 200 when pivot generation fails after invalidation', async () => {
    vi.mocked(getAssumption).mockResolvedValue(mockAssumption);
    vi.mocked(saveAssumption).mockResolvedValue(undefined);
    vi.mocked(generatePivotSuggestions).mockRejectedValue(new Error('LLM timeout'));

    const res = await POST(makeRequest({ type: 'demand', status: 'invalidated' }), context);
    expect(res.status).toBe(200);
  });
});
