import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import {
  saveBuildSession,
  getBuildSession,
  deleteBuildSession,
  saveConversationHistory,
  getConversationHistory,
  deleteConversationHistory,
} from '../painted-door-db';

describe('Build Session Storage', () => {
  beforeEach(() => vi.clearAllMocks());

  const session = {
    ideaId: 'idea-1',
    mode: 'interactive' as const,
    currentStep: 0,
    steps: [{ name: 'Extract Ingredients', status: 'pending' as const }],
    artifacts: {},
    createdAt: '2026-02-17T00:00:00Z',
    updatedAt: '2026-02-17T00:00:00Z',
  };

  it('saves build session with 4-hour TTL', async () => {
    await saveBuildSession('idea-1', session);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'build_session:idea-1',
      JSON.stringify(session),
      { ex: 14400 },
    );
  });

  it('retrieves build session', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(session));
    const result = await getBuildSession('idea-1');
    expect(result).toEqual(session);
  });

  it('returns null for missing session', async () => {
    mockRedis.get.mockResolvedValue(null);
    const result = await getBuildSession('missing');
    expect(result).toBeNull();
  });

  it('deletes build session', async () => {
    await deleteBuildSession('idea-1');
    expect(mockRedis.del).toHaveBeenCalledWith('build_session:idea-1');
  });

  it('handles Redis error on save', async () => {
    mockRedis.set.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(saveBuildSession('idea-1', session)).rejects.toThrow('Connection lost');
  });

  it('handles Redis error on get', async () => {
    mockRedis.get.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(getBuildSession('idea-1')).rejects.toThrow('Connection lost');
  });
});

describe('Conversation History Storage', () => {
  beforeEach(() => vi.clearAllMocks());

  const messages = [
    { role: 'assistant' as const, content: 'Hello', timestamp: '2026-02-17T00:00:00Z' },
    { role: 'user' as const, content: 'Hi', timestamp: '2026-02-17T00:01:00Z' },
  ];

  it('saves conversation history with 4-hour TTL', async () => {
    await saveConversationHistory('idea-1', messages);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'chat_history:idea-1',
      JSON.stringify(messages),
      { ex: 14400 },
    );
  });

  it('retrieves conversation history', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(messages));
    const result = await getConversationHistory('idea-1');
    expect(result).toEqual(messages);
  });

  it('returns empty array for missing history', async () => {
    mockRedis.get.mockResolvedValue(null);
    const result = await getConversationHistory('missing');
    expect(result).toEqual([]);
  });

  it('deletes conversation history', async () => {
    await deleteConversationHistory('idea-1');
    expect(mockRedis.del).toHaveBeenCalledWith('chat_history:idea-1');
  });

  it('handles Redis error on save', async () => {
    mockRedis.set.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(saveConversationHistory('idea-1', messages)).rejects.toThrow('Connection lost');
  });

  it('handles Redis error on get', async () => {
    mockRedis.get.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(getConversationHistory('idea-1')).rejects.toThrow('Connection lost');
  });
});
