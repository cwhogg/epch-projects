import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findNextPiecePerTarget } from '../publish-pipeline';

// Mock the db module
vi.mock('../db', () => ({
  getAllContentCalendars: vi.fn(),
  getContentPieces: vi.fn(),
  isPiecePublished: vi.fn(),
  markPiecePublished: vi.fn(),
  addPublishLogEntry: vi.fn(),
  saveContentPiece: vi.fn(),
}));

import {
  getAllContentCalendars,
  getContentPieces,
  isPiecePublished,
} from '../db';

const mockGetAllCalendars = vi.mocked(getAllContentCalendars);
const mockGetContentPieces = vi.mocked(getContentPieces);
const mockIsPiecePublished = vi.mocked(isPiecePublished);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('findNextPiecePerTarget', () => {
  it('returns empty map when no calendars exist', async () => {
    mockGetAllCalendars.mockResolvedValue([]);
    const result = await findNextPiecePerTarget();
    expect(result.size).toBe(0);
  });

  it('skips inactive calendars', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        active: false,
        targetId: 'site-1',
        pieces: [{ id: 'p1', title: 'Test', slug: 'test', type: 'blog-post', status: 'complete', priority: 1 }],
      } as any,
    ]);
    const result = await findNextPiecePerTarget();
    expect(result.size).toBe(0);
  });

  it('skips already-published pieces', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        targetId: 'site-1',
        pieces: [{ id: 'p1', title: 'Test', slug: 'test', type: 'blog-post', status: 'complete', priority: 1 }],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockResolvedValue(true);
    const result = await findNextPiecePerTarget();
    expect(result.size).toBe(0);
  });

  it('skips pieces with status generating', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        targetId: 'site-1',
        pieces: [{ id: 'p1', title: 'Test', slug: 'test', type: 'blog-post', status: 'generating', priority: 1 }],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockResolvedValue(false);
    const result = await findNextPiecePerTarget();
    expect(result.size).toBe(0);
  });

  it('skips landing-page type', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        targetId: 'site-1',
        pieces: [{ id: 'p1', title: 'Test', slug: 'test', type: 'landing-page', status: 'complete', priority: 1 }],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockResolvedValue(false);
    const result = await findNextPiecePerTarget();
    expect(result.size).toBe(0);
  });

  it('prioritizes complete pieces over incomplete', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        targetId: 'site-1',
        pieces: [
          { id: 'p1', title: 'Incomplete', slug: 'incomplete', type: 'blog-post', status: 'pending', priority: 1 },
          { id: 'p2', title: 'Complete', slug: 'complete', type: 'blog-post', status: 'complete', priority: 2 },
        ],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockResolvedValue(false);
    const result = await findNextPiecePerTarget();
    expect(result.get('site-1')?.piece.id).toBe('p2');
  });

  it('uses priority as tiebreaker within same status', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        targetId: 'site-1',
        pieces: [
          { id: 'p1', title: 'Low priority', slug: 'low', type: 'blog-post', status: 'complete', priority: 3 },
          { id: 'p2', title: 'High priority', slug: 'high', type: 'blog-post', status: 'complete', priority: 1 },
        ],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockResolvedValue(false);
    const result = await findNextPiecePerTarget();
    expect(result.get('site-1')?.piece.id).toBe('p2');
  });

  it('returns one candidate per target site', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        targetId: 'site-a',
        pieces: [{ id: 'p1', title: 'A', slug: 'a', type: 'blog-post', status: 'complete', priority: 1 }],
      } as any,
      {
        ideaId: 'idea-2',
        targetId: 'site-b',
        pieces: [{ id: 'p2', title: 'B', slug: 'b', type: 'blog-post', status: 'complete', priority: 1 }],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockResolvedValue(false);
    const result = await findNextPiecePerTarget();
    expect(result.size).toBe(2);
    expect(result.has('site-a')).toBe(true);
    expect(result.has('site-b')).toBe(true);
  });

  it('filters calendars by ideaId when provided', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        targetId: 'site-a',
        pieces: [{ id: 'p1', title: 'A', slug: 'a', type: 'blog-post', status: 'complete', priority: 1 }],
      } as any,
      {
        ideaId: 'idea-2',
        targetId: 'site-b',
        pieces: [{ id: 'p2', title: 'B', slug: 'b', type: 'blog-post', status: 'complete', priority: 1 }],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockResolvedValue(false);
    const result = await findNextPiecePerTarget('idea-1');
    expect(result.size).toBe(1);
    expect(result.has('site-a')).toBe(true);
    expect(result.has('site-b')).toBe(false);
  });

  it('defaults targetId to secondlook', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        pieces: [{ id: 'p1', title: 'A', slug: 'a', type: 'blog-post', status: 'complete', priority: 1 }],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockResolvedValue(false);
    const result = await findNextPiecePerTarget();
    expect(result.has('secondlook')).toBe(true);
  });

  // Error path: getAllContentCalendars fails
  it('propagates error when getAllContentCalendars rejects', async () => {
    mockGetAllCalendars.mockRejectedValue(new Error('Redis connection failed'));
    await expect(findNextPiecePerTarget()).rejects.toThrow('Redis connection failed');
  });

  // Error path: isPiecePublished fails
  it('propagates error when isPiecePublished rejects', async () => {
    mockGetAllCalendars.mockResolvedValue([
      {
        ideaId: 'idea-1',
        targetId: 'site-1',
        pieces: [{ id: 'p1', title: 'A', slug: 'a', type: 'blog-post', status: 'complete', priority: 1 }],
      } as any,
    ]);
    mockGetContentPieces.mockResolvedValue([]);
    mockIsPiecePublished.mockRejectedValue(new Error('Redis timeout'));
    await expect(findNextPiecePerTarget()).rejects.toThrow('Redis timeout');
  });
});
