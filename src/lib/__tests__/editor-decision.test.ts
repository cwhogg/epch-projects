import { describe, it, expect } from 'vitest';
import { applyEditorRubric } from '@/lib/editor-decision';
import type { AdvisorCritique, RoundSummary } from '@/types';

function makeCritique(overrides: Partial<AdvisorCritique> = {}): AdvisorCritique {
  return {
    advisorId: 'test',
    name: 'Test',
    score: 7,
    pass: true,
    issues: [],
    ...overrides,
  };
}

describe('applyEditorRubric', () => {
  it('returns revise when any high-severity issue exists', () => {
    const critiques = [
      makeCritique({
        score: 8,
        issues: [
          { severity: 'high', description: 'Major issue', suggestion: 'Fix it' },
        ],
      }),
      makeCritique({ score: 9 }),
    ];

    const result = applyEditorRubric(critiques, 4);

    expect(result.decision).toBe('revise');
  });

  it('returns approve when no high-severity and avg >= threshold', () => {
    const critiques = [
      makeCritique({ score: 7 }),
      makeCritique({ score: 8 }),
    ];

    const result = applyEditorRubric(critiques, 4);

    expect(result.decision).toBe('approve');
  });

  it('returns revise when no high-severity but avg < threshold', () => {
    const critiques = [
      makeCritique({ score: 2 }),
      makeCritique({ score: 3 }),
    ];

    const result = applyEditorRubric(critiques, 4);

    expect(result.decision).toBe('revise');
  });

  it('returns approve when scores are decreasing (oscillation guard)', () => {
    const critiques = [makeCritique({ score: 5 })];

    const result = applyEditorRubric(critiques, 4, 6);

    expect(result.decision).toBe('approve');
  });

  it('does not trigger oscillation guard when scores improve', () => {
    const critiques = [makeCritique({ score: 5 })];

    const result = applyEditorRubric(critiques, 6, 4);

    expect(result.decision).toBe('revise');
  });

  it('returns approve for empty critiques array', () => {
    const result = applyEditorRubric([], 4);

    expect(result.decision).toBe('approve');
  });

  it('builds brief from high and medium issues only', () => {
    const critiques = [
      makeCritique({
        advisorId: 'april-dunford',
        name: 'April Dunford',
        score: 5,
        issues: [
          { severity: 'high', description: 'Positioning drift', suggestion: 'Fix headline' },
          { severity: 'low', description: 'Minor wording', suggestion: 'Optional tweak' },
        ],
      }),
    ];

    const result = applyEditorRubric(critiques, 4);

    expect(result.brief).toContain('Positioning drift');
    expect(result.brief).not.toContain('Minor wording');
  });

  it('includes medium issues in brief', () => {
    const critiques = [
      makeCritique({
        score: 5,
        issues: [
          { severity: 'medium', description: 'CTA could be clearer', suggestion: 'Simplify' },
        ],
      }),
    ];

    const result = applyEditorRubric(critiques, 6);

    expect(result.brief).toContain('CTA could be clearer');
  });
});
