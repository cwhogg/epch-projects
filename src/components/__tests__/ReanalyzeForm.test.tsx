import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReanalyzeForm from '../ReanalyzeForm';
import { FoundationDocument } from '@/types';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function makeDoc(type: 'strategy' | 'positioning', overrides?: Partial<FoundationDocument>): FoundationDocument {
  return {
    id: type,
    ideaId: 'idea-1',
    type,
    content: `${type} content here that is meaningful`,
    advisorId: 'test-advisor',
    generatedAt: '2026-02-12T00:00:00.000Z',
    editedAt: null,
    version: 1,
    ...overrides,
  };
}

describe('ReanalyzeForm', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it('renders re-analyze button in collapsed state', () => {
    render(<ReanalyzeForm ideaId="idea-1" />);
    expect(screen.getByText('Re-analyze')).toBeDefined();
  });

  it('expands to form on button click', () => {
    render(<ReanalyzeForm ideaId="idea-1" />);
    fireEvent.click(screen.getByText('Re-analyze'));
    expect(screen.getByText('Add Context for Re-analysis')).toBeDefined();
  });

  it('shows no foundation section when no docs provided', () => {
    render(<ReanalyzeForm ideaId="idea-1" />);
    fireEvent.click(screen.getByText('Re-analyze'));
    expect(screen.queryByText('Strategic context will be included:')).toBeNull();
  });

  it('shows foundation doc list when foundationDocs has strategy doc', () => {
    render(<ReanalyzeForm ideaId="idea-1" foundationDocs={[makeDoc('strategy')]} />);
    fireEvent.click(screen.getByText('Re-analyze'));
    expect(screen.getByText('Strategic context will be included:')).toBeDefined();
    expect(screen.getByText('Strategy v1')).toBeDefined();
  });

  it('shows both docs when both strategy + positioning provided', () => {
    render(
      <ReanalyzeForm
        ideaId="idea-1"
        foundationDocs={[makeDoc('strategy'), makeDoc('positioning', { version: 2 })]}
      />
    );
    fireEvent.click(screen.getByText('Re-analyze'));
    expect(screen.getByText('Strategy v1')).toBeDefined();
    expect(screen.getByText('Positioning v2')).toBeDefined();
  });

  it('toggles doc preview on click', () => {
    render(
      <ReanalyzeForm ideaId="idea-1" foundationDocs={[makeDoc('strategy', { content: 'My strategy content preview' })]} />
    );
    fireEvent.click(screen.getByText('Re-analyze'));

    // Initially no preview
    expect(screen.queryByText(/My strategy content preview/)).toBeNull();

    // Click to expand
    fireEvent.click(screen.getByText('Strategy v1'));
    expect(screen.getByText(/My strategy content preview/)).toBeDefined();

    // Click to collapse
    fireEvent.click(screen.getByText('Strategy v1'));
    expect(screen.queryByText(/My strategy content preview/)).toBeNull();
  });

  it('disables submit with empty textarea and no foundation docs', () => {
    render(<ReanalyzeForm ideaId="idea-1" />);
    fireEvent.click(screen.getByText('Re-analyze'));
    const buttons = screen.getAllByRole('button');
    const submitBtn = buttons.find(b => b.textContent === 'Re-analyze');
    expect(submitBtn).toBeDefined();
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables submit with empty textarea when foundation docs present', () => {
    render(<ReanalyzeForm ideaId="idea-1" foundationDocs={[makeDoc('strategy')]} />);
    fireEvent.click(screen.getByText('Re-analyze'));
    // After expanding, find the submit button (the second Re-analyze button)
    const buttons = screen.getAllByRole('button');
    const submitBtn = buttons.find(b => b.textContent === 'Re-analyze' && b !== buttons[0]);
    expect(submitBtn).toBeDefined();
    expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('enables submit with text and no foundation docs', () => {
    render(<ReanalyzeForm ideaId="idea-1" />);
    fireEvent.click(screen.getByText('Re-analyze'));
    const textarea = screen.getByPlaceholderText('Add new information or focus areas...');
    fireEvent.change(textarea, { target: { value: 'some context' } });
    const buttons = screen.getAllByRole('button');
    const submitBtn = buttons.find(b => b.textContent === 'Re-analyze');
    expect(submitBtn).toBeDefined();
    expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls fetch and navigates on successful submit', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ message: 'ok' }), { status: 200 }));

    render(<ReanalyzeForm ideaId="idea-1" foundationDocs={[makeDoc('strategy')]} />);
    fireEvent.click(screen.getByText('Re-analyze'));
    // Submit without typing — enabled because foundation docs present
    const buttons = screen.getAllByRole('button');
    const submitBtn = buttons.find(b => b.textContent === 'Re-analyze' && b !== buttons[0])!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/analyze/idea-1', expect.objectContaining({ method: 'POST' }));
      expect(mockPush).toHaveBeenCalledWith('/ideas/idea-1/analyze');
    });
  });

  it('handles fetch failure without crashing', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

    render(<ReanalyzeForm ideaId="idea-1" />);
    fireEvent.click(screen.getByText('Re-analyze'));
    const textarea = screen.getByPlaceholderText('Add new information or focus areas...');
    fireEvent.change(textarea, { target: { value: 'context' } });
    const buttons = screen.getAllByRole('button');
    const submitBtn = buttons.find(b => b.textContent === 'Re-analyze')!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      // Should not crash, form should still be visible
      expect(screen.getByText('Add Context for Re-analysis')).toBeDefined();
    });
  });
});
