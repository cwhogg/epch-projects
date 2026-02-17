import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ValidationCanvas from '@/components/ValidationCanvas';
import type { Assumption, AssumptionType, CanvasState } from '@/types';

// Mock PivotActions since it's a client component
vi.mock('@/components/PivotActions', () => ({
  default: ({ type }: { type: string }) => <div data-testid={`pivot-actions-${type}`}>PivotActions</div>,
}));

const mockAssumption = (type: AssumptionType, status: string, statement: string): Assumption => ({
  type,
  status: status as Assumption['status'],
  statement,
  evidence: status === 'validated' ? ['1,200 monthly searches'] : [],
  threshold: { validated: 'x', invalidated: 'y', windowDays: 0 },
  linkedStage: 'analysis',
});

describe('ValidationCanvas', () => {
  const defaultCanvas: CanvasState = { status: 'active' };
  const defaultAssumptions = {
    demand: mockAssumption('demand', 'validated', 'High search volume confirmed'),
    reachability: mockAssumption('reachability', 'testing', 'Content ranking in progress'),
    engagement: mockAssumption('engagement', 'untested', 'Signup rate TBD'),
    wtp: mockAssumption('wtp', 'untested', 'Pricing page visits TBD'),
    differentiation: mockAssumption('differentiation', 'untested', 'Market gap TBD'),
  };

  it('renders all five assumption cards', () => {
    render(
      <ValidationCanvas
        ideaId="idea-1"
        canvas={defaultCanvas}
        assumptions={defaultAssumptions}
        pivotSuggestions={{}}
        pivotHistory={{}}
      />
    );

    expect(screen.getByText('Demand')).toBeDefined();
    expect(screen.getByText('Reachability')).toBeDefined();
    expect(screen.getByText('Engagement')).toBeDefined();
    expect(screen.getByText('WTP')).toBeDefined();
    expect(screen.getByText('Differentiation')).toBeDefined();
  });

  it('displays status badges for each assumption', () => {
    render(
      <ValidationCanvas
        ideaId="idea-1"
        canvas={defaultCanvas}
        assumptions={defaultAssumptions}
        pivotSuggestions={{}}
        pivotHistory={{}}
      />
    );

    expect(screen.getByText('validated')).toBeDefined();
    expect(screen.getByText('testing')).toBeDefined();
    expect(screen.getAllByText('untested')).toHaveLength(3);
  });

  it('shows pivot actions for invalidated assumptions', () => {
    const assumptions = {
      ...defaultAssumptions,
      demand: mockAssumption('demand', 'invalidated', 'Low search volume'),
    };

    render(
      <ValidationCanvas
        ideaId="idea-1"
        canvas={defaultCanvas}
        assumptions={assumptions}
        pivotSuggestions={{ demand: [{ statement: 'Pivot A', evidence: [], impact: 'low', experiment: 'test' }] }}
        pivotHistory={{}}
      />
    );

    expect(screen.getByTestId('pivot-actions-demand')).toBeDefined();
  });

  it('shows "Reset" badge for downstream assumptions when upstream is invalidated', () => {
    const assumptions = {
      ...defaultAssumptions,
      demand: mockAssumption('demand', 'invalidated', 'No demand found'),
    };

    render(
      <ValidationCanvas
        ideaId="idea-1"
        canvas={defaultCanvas}
        assumptions={assumptions}
        pivotSuggestions={{}}
        pivotHistory={{}}
      />
    );

    // Downstream of demand should show "Reset"
    const resetBadges = screen.getAllByText('Reset');
    expect(resetBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('grays out killed canvas and shows reason', () => {
    const killedCanvas: CanvasState = {
      status: 'killed',
      killedAt: Date.now(),
      killedReason: 'No market demand',
    };

    const { container } = render(
      <ValidationCanvas
        ideaId="idea-1"
        canvas={killedCanvas}
        assumptions={defaultAssumptions}
        pivotSuggestions={{}}
        pivotHistory={{}}
      />
    );

    expect(screen.getByText(/No market demand/)).toBeDefined();
    // Check opacity class is applied
    expect(container.firstElementChild?.classList.contains('opacity-50')).toBe(true);
  });

  it('shows pivot history count when history exists', () => {
    render(
      <ValidationCanvas
        ideaId="idea-1"
        canvas={defaultCanvas}
        assumptions={defaultAssumptions}
        pivotSuggestions={{}}
        pivotHistory={{
          demand: [{
            fromStatement: 'old', toStatement: 'new', reason: 'test',
            suggestedBy: 'system', approvedBy: 'curator', timestamp: 1, alternatives: [],
          }],
        }}
      />
    );

    expect(screen.getByText('1 pivot recorded')).toBeDefined();
  });

  it('renders section divider between canvas and project details', () => {
    render(
      <ValidationCanvas
        ideaId="idea-1"
        canvas={defaultCanvas}
        assumptions={defaultAssumptions}
        pivotSuggestions={{}}
        pivotHistory={{}}
      />
    );

    expect(screen.getByText('Project Details')).toBeDefined();
  });
});
