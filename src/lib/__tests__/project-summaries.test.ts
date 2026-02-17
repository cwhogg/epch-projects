import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AssumptionType, Assumption } from '@/types';

// Test the assumption status mapping logic that will be used in getProjectSummaries
describe('buildAssumptionStatuses', () => {
  // Import after mocks are set up
  let buildAssumptionStatuses: typeof import('../project-summaries')['buildAssumptionStatuses'];

  beforeEach(async () => {
    const mod = await import('../project-summaries');
    buildAssumptionStatuses = mod.buildAssumptionStatuses;
  });

  it('returns null when raw assumptions object is empty', () => {
    expect(buildAssumptionStatuses({})).toBeNull();
  });

  it('maps partial assumptions to statuses with untested defaults', () => {
    const raw: Partial<Record<AssumptionType, Assumption>> = {
      demand: {
        type: 'demand',
        status: 'validated',
        statement: 'test',
        evidence: [],
        threshold: { validated: '', invalidated: '', windowDays: 30 },
        linkedStage: 'analysis',
      },
    };

    const result = buildAssumptionStatuses(raw);
    expect(result).toEqual({
      demand: 'validated',
      reachability: 'untested',
      engagement: 'untested',
      wtp: 'untested',
      differentiation: 'untested',
    });
  });

  it('maps all 5 assumption statuses when fully populated', () => {
    const makeAssumption = (type: AssumptionType, status: Assumption['status']): Assumption => ({
      type,
      status,
      statement: 'test',
      evidence: [],
      threshold: { validated: '', invalidated: '', windowDays: 30 },
      linkedStage: 'analysis',
    });

    const raw: Partial<Record<AssumptionType, Assumption>> = {
      demand: makeAssumption('demand', 'validated'),
      reachability: makeAssumption('reachability', 'testing'),
      engagement: makeAssumption('engagement', 'invalidated'),
      wtp: makeAssumption('wtp', 'pivoted'),
      differentiation: makeAssumption('differentiation', 'untested'),
    };

    const result = buildAssumptionStatuses(raw);
    expect(result).toEqual({
      demand: 'validated',
      reachability: 'testing',
      engagement: 'invalidated',
      wtp: 'pivoted',
      differentiation: 'untested',
    });
  });
});
