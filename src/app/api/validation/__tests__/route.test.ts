import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  isRedisConfigured: vi.fn(),
  getCanvasState: vi.fn(),
  getAllAssumptions: vi.fn(),
  saveCanvasState: vi.fn(),
  saveAssumption: vi.fn(),
}));

vi.mock('@/lib/validation-canvas', () => ({
  generateAssumptions: vi.fn(),
  buildPivotData: vi.fn(),
  applyPivot: vi.fn(),
  generatePivotSuggestions: vi.fn(),
}));

import {
  isRedisConfigured,
  getCanvasState,
  getAllAssumptions,
  saveCanvasState,
} from '@/lib/db';
import { generateAssumptions, buildPivotData, applyPivot } from '@/lib/validation-canvas';

// Import route handlers — adjust paths based on actual file structure
import { GET } from '@/app/api/validation/[ideaId]/route';
import { POST as PivotPOST } from '@/app/api/validation/[ideaId]/pivot/route';
import { POST as KillPOST } from '@/app/api/validation/[ideaId]/kill/route';

describe('GET /api/validation/[ideaId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isRedisConfigured).mockReturnValue(true);
  });

  it('returns 500 when Redis is not configured', async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(false);
    const req = new NextRequest('http://localhost/api/validation/idea-1');
    const res = await GET(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(500);
  });

  it('returns canvas data when it exists', async () => {
    vi.mocked(getCanvasState).mockResolvedValue({ status: 'active' });
    vi.mocked(getAllAssumptions).mockResolvedValue({
      demand: {
        type: 'demand', status: 'validated', statement: 'Test',
        evidence: [], threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
        linkedStage: 'analysis',
      },
    });
    vi.mocked(buildPivotData).mockResolvedValue({ pivotSuggestions: {}, pivotHistory: {} });

    const req = new NextRequest('http://localhost/api/validation/idea-1');
    const res = await GET(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.canvas.status).toBe('active');
    expect(data.assumptions.demand).toBeDefined();
  });

  it('auto-generates canvas when none exists and generates=true', async () => {
    vi.mocked(getCanvasState).mockResolvedValue(null);
    vi.mocked(generateAssumptions).mockResolvedValue({
      canvas: { status: 'active' },
      assumptions: {} as Record<string, unknown>,
      pivotSuggestions: {},
      pivotHistory: {},
    } as unknown as import('@/types').ValidationCanvasData);

    const req = new NextRequest('http://localhost/api/validation/idea-1?generate=true');
    const res = await GET(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(200);
    expect(generateAssumptions).toHaveBeenCalledWith('idea-1');
  });

  it('returns 404 when no canvas exists and generate is not requested', async () => {
    vi.mocked(getCanvasState).mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/validation/idea-1');
    const res = await GET(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(404);
  });

  it('returns 500 when Redis get fails', async () => {
    vi.mocked(getCanvasState).mockRejectedValue(new Error('Connection lost'));

    const req = new NextRequest('http://localhost/api/validation/idea-1');
    const res = await GET(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(500);
  });
});

describe('POST /api/validation/[ideaId]/pivot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isRedisConfigured).mockReturnValue(true);
  });

  it('applies a pivot successfully', async () => {
    vi.mocked(applyPivot).mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost/api/validation/idea-1/pivot', {
      method: 'POST',
      body: JSON.stringify({ type: 'demand', suggestionIndex: 0 }),
    });
    const res = await PivotPOST(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(200);
    expect(applyPivot).toHaveBeenCalledWith('idea-1', 'demand', 0);
  });

  it('returns 400 when type is missing', async () => {
    const req = new NextRequest('http://localhost/api/validation/idea-1/pivot', {
      method: 'POST',
      body: JSON.stringify({ suggestionIndex: 0 }),
    });
    const res = await PivotPOST(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 500 when applyPivot throws', async () => {
    vi.mocked(applyPivot).mockRejectedValue(new Error('Invalid index'));

    const req = new NextRequest('http://localhost/api/validation/idea-1/pivot', {
      method: 'POST',
      body: JSON.stringify({ type: 'demand', suggestionIndex: 99 }),
    });
    const res = await PivotPOST(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(500);
  });

  it('returns 400 when JSON body is malformed', async () => {
    const req = new NextRequest('http://localhost/api/validation/idea-1/pivot', {
      method: 'POST',
      body: 'not json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await PivotPOST(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/validation/[ideaId]/kill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isRedisConfigured).mockReturnValue(true);
  });

  it('kills the project', async () => {
    vi.mocked(saveCanvasState).mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost/api/validation/idea-1/kill', {
      method: 'POST',
      body: JSON.stringify({ reason: 'No demand found' }),
    });
    const res = await KillPOST(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(200);
    expect(saveCanvasState).toHaveBeenCalledWith('idea-1', expect.objectContaining({
      status: 'killed',
      killedReason: 'No demand found',
    }));
  });

  it('returns 400 when reason is missing', async () => {
    const req = new NextRequest('http://localhost/api/validation/idea-1/kill', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await KillPOST(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 500 when Redis save fails', async () => {
    vi.mocked(saveCanvasState).mockRejectedValue(new Error('Connection lost'));

    const req = new NextRequest('http://localhost/api/validation/idea-1/kill', {
      method: 'POST',
      body: JSON.stringify({ reason: 'No demand' }),
    });
    const res = await KillPOST(req, { params: Promise.resolve({ ideaId: 'idea-1' }) });
    expect(res.status).toBe(500);
  });
});
