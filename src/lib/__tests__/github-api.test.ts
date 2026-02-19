import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
vi.stubEnv('VERCEL_TOKEN', 'test-token');
vi.stubEnv('GITHUB_TOKEN', 'test-github-token');

import { createVercelProject } from '../github-api';

describe('createVercelProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns projectId on successful creation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'prj_new123' }),
    });

    const result = await createVercelProject('owner', 'my-repo', 'pd-my-repo');
    expect(result.projectId).toBe('prj_new123');
  });

  it('handles 409 conflict by looking up existing project', async () => {
    // First call: creation returns 409
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: () => Promise.resolve('{"error":{"code":"conflict","message":"Project already exists"}}'),
    });
    // Second call: lookup returns existing project
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'prj_existing456' }),
    });

    const result = await createVercelProject('owner', 'my-repo', 'pd-my-repo');
    expect(result.projectId).toBe('prj_existing456');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toContain('/v9/projects/my-repo');
  });

  it('throws on non-409 errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    await expect(createVercelProject('owner', 'my-repo', 'pd-my-repo'))
      .rejects.toThrow('Vercel project creation failed: 500');
  });

  it('throws when 409 lookup also fails', async () => {
    // Creation returns 409
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: () => Promise.resolve('{"error":{"code":"conflict"}}'),
    });
    // Lookup fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(createVercelProject('owner', 'my-repo', 'pd-my-repo'))
      .rejects.toThrow('Vercel project creation failed: 409');
  });
});
