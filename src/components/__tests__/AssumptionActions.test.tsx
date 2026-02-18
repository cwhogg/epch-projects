import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AssumptionActions from '../AssumptionActions';

describe('AssumptionActions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it('renders Validate and Invalidate buttons for untested status', () => {
    render(<AssumptionActions ideaId="idea-1" type="value_proposition" status="untested" />);
    expect(screen.getByText('Validate')).toBeDefined();
    expect(screen.getByText('Invalidate')).toBeDefined();
  });

  it('renders Undo button for validated status', () => {
    render(<AssumptionActions ideaId="idea-1" type="value_proposition" status="validated" />);
    expect(screen.getByText('Undo')).toBeDefined();
  });

  it('renders nothing for invalidated status', () => {
    const { container } = render(
      <AssumptionActions ideaId="idea-1" type="value_proposition" status="invalidated" />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows error when API returns non-ok response', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Assumption not found' }), { status: 404 })
    );

    render(<AssumptionActions ideaId="idea-1" type="value_proposition" status="untested" />);
    fireEvent.click(screen.getByText('Validate'));

    await waitFor(() => {
      expect(screen.getByText('Assumption not found')).toBeDefined();
    });
  });

  it('shows fallback error when API returns non-ok without error field', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 500 })
    );

    render(<AssumptionActions ideaId="idea-1" type="value_proposition" status="untested" />);
    fireEvent.click(screen.getByText('Invalidate'));

    await waitFor(() => {
      expect(screen.getByText('Failed to update status')).toBeDefined();
    });
  });

  it('shows network error on fetch rejection', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Failed to fetch'));

    render(<AssumptionActions ideaId="idea-1" type="value_proposition" status="untested" />);
    fireEvent.click(screen.getByText('Validate'));

    await waitFor(() => {
      expect(screen.getByText('Network error — please try again')).toBeDefined();
    });
  });

  it('clears previous error on new attempt', async () => {
    // First call fails
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

    render(<AssumptionActions ideaId="idea-1" type="value_proposition" status="untested" />);
    fireEvent.click(screen.getByText('Validate'));

    await waitFor(() => {
      expect(screen.getByText('Network error — please try again')).toBeDefined();
    });

    // Second call succeeds — error should be cleared during the attempt
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );

    fireEvent.click(screen.getByText('Validate'));

    await waitFor(() => {
      expect(screen.queryByText('Network error — please try again')).toBeNull();
    });
  });
});
