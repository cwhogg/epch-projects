import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { type ReactNode } from 'react';

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock the sub-components to avoid their complexity
vi.mock('../CollapsedDocCard', () => ({
  default: () => <div data-testid="collapsed-card" />,
}));

vi.mock('../ExpandedDocCard', () => ({
  default: () => <div data-testid="expanded-card" />,
}));

// Mock icons
vi.mock('../FoundationIcons', () => ({
  ArrowLeftIcon: () => <span>←</span>,
  PlayIcon: () => <span>▶</span>,
  WarningIcon: () => <span>⚠</span>,
}));

// Spy on window.history.replaceState
const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

let fetchMock: Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.delete('autoGenerate');

  // Default fetch mock: GET returns not_started, POST succeeds
  fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (opts?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ message: 'Started' }),
      });
    }
    // GET
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        progress: { status: 'not_started' },
        docs: {},
      }),
    });
  });
  global.fetch = fetchMock;
});

async function renderPage() {
  const { default: FoundationPage } = await import('../page');
  let container: HTMLElement;
  await act(async () => {
    const result = render(
      <FoundationPage params={Promise.resolve({ id: 'idea-123' })} />
    );
    container = result.container;
  });
  return container!;
}

describe('Foundation detail page auto-generate', () => {
  it('triggers generation when autoGenerate=true and no docs exist', async () => {
    mockSearchParams.set('autoGenerate', 'true');

    await renderPage();

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        ([, opts]: [string, RequestInit?]) => opts?.method === 'POST'
      );
      expect(postCalls).toHaveLength(1);
      expect(postCalls[0][0]).toBe('/api/foundation/idea-123');
    });

    expect(replaceStateSpy).toHaveBeenCalledWith({}, '', window.location.pathname);
  });

  it('does NOT trigger generation without autoGenerate param', async () => {
    await renderPage();

    // Wait for initial GET to complete
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // Should NOT have made a POST call
    const postCalls = fetchMock.mock.calls.filter(
      ([, opts]: [string, RequestInit?]) => opts?.method === 'POST'
    );
    expect(postCalls).toHaveLength(0);
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it('does NOT trigger generation when already running', async () => {
    mockSearchParams.set('autoGenerate', 'true');

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: 'Started' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          progress: {
            status: 'running',
            currentStep: 'Generating strategy...',
            docs: { strategy: 'running' },
          },
          docs: {},
        }),
      });
    });

    await renderPage();

    // Wait for initial GET
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // Give effects time to fire
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Should NOT have made a POST call
    const postCalls = fetchMock.mock.calls.filter(
      ([, opts]: [string, RequestInit?]) => opts?.method === 'POST'
    );
    expect(postCalls).toHaveLength(0);
  });

  it('handles POST failure gracefully during auto-generate', async () => {
    mockSearchParams.set('autoGenerate', 'true');

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Already running' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          progress: { status: 'not_started' },
          docs: {},
        }),
      });
    });

    await renderPage();

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        ([, opts]: [string, RequestInit?]) => opts?.method === 'POST'
      );
      expect(postCalls).toHaveLength(1);
    });

    expect(replaceStateSpy).toHaveBeenCalled();
  });

  it('handles fetch network error gracefully during auto-generate', async () => {
    mockSearchParams.set('autoGenerate', 'true');

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          progress: { status: 'not_started' },
          docs: {},
        }),
      });
    });

    await renderPage();

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        ([, opts]: [string, RequestInit?]) => opts?.method === 'POST'
      );
      expect(postCalls).toHaveLength(1);
    });
  });
});
