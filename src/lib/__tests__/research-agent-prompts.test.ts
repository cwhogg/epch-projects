import { describe, it, expect } from 'vitest';
import { buildFoundationContext, createPrompt } from '../research-agent-prompts';
import { FoundationDocument } from '@/types';

function makeDoc(overrides: Partial<FoundationDocument> & Pick<FoundationDocument, 'type'>): FoundationDocument {
  return {
    id: overrides.type,
    ideaId: 'idea-1',
    content: 'Test content',
    advisorId: 'test-advisor',
    generatedAt: '2026-02-12T00:00:00.000Z',
    editedAt: null,
    version: 1,
    ...overrides,
  };
}

describe('buildFoundationContext', () => {
  it('returns empty string when passed empty array', () => {
    expect(buildFoundationContext([])).toBe('');
  });

  it('formats strategy-only doc with header, version, date, and trailing instruction', () => {
    const result = buildFoundationContext([
      makeDoc({ type: 'strategy', content: 'Our strategy is X.', version: 1 }),
    ]);

    expect(result).toContain('STRATEGIC CONTEXT');
    expect(result).toContain('## Strategy (v1, generated Feb 12)');
    expect(result).toContain('Our strategy is X.');
    expect(result).toContain('Use this strategic context to focus your research');
  });

  it('formats both strategy + positioning in order', () => {
    const result = buildFoundationContext([
      makeDoc({ type: 'positioning', content: 'Positioning info.', version: 2 }),
      makeDoc({ type: 'strategy', content: 'Strategy info.', version: 3 }),
    ]);

    const strategyIndex = result.indexOf('## Strategy');
    const positioningIndex = result.indexOf('## Positioning');
    expect(strategyIndex).toBeGreaterThan(-1);
    expect(positioningIndex).toBeGreaterThan(-1);
    expect(strategyIndex).toBeLessThan(positioningIndex);
  });

  it('formats positioning-only doc', () => {
    const result = buildFoundationContext([
      makeDoc({ type: 'positioning', content: 'We position as Y.', version: 1 }),
    ]);

    expect(result).toContain('STRATEGIC CONTEXT');
    expect(result).toContain('## Positioning (v1, generated Feb 12)');
    expect(result).toContain('We position as Y.');
  });

  it('truncates content exceeding 4,000 chars', () => {
    const result = buildFoundationContext([
      makeDoc({ type: 'strategy', content: 'x'.repeat(5000) }),
    ]);

    expect(result).toContain('x'.repeat(4000));
    expect(result).not.toContain('x'.repeat(4001));
  });

  it('ignores non-strategy/positioning docs', () => {
    const result = buildFoundationContext([
      makeDoc({ type: 'brand-voice', content: 'Voice stuff.' }),
    ]);

    expect(result).toBe('');
  });

  it('uses editedAt date when present, falls back to generatedAt', () => {
    const resultEdited = buildFoundationContext([
      makeDoc({ type: 'strategy', editedAt: '2026-02-15T00:00:00.000Z' }),
    ]);
    expect(resultEdited).toContain('updated Feb 15');

    const resultGenerated = buildFoundationContext([
      makeDoc({ type: 'strategy', editedAt: null }),
    ]);
    expect(resultGenerated).toContain('generated Feb 12');
  });
});

describe('createPrompt', () => {
  const idea = {
    id: 'idea-1',
    name: 'TestProduct',
    description: 'A test product description',
    targetUser: 'developers',
    problemSolved: 'testing',
    createdAt: '2026-01-01',
    status: 'pending' as const,
  };

  it('returns prompt containing idea name and description', () => {
    const result = createPrompt(idea, 'competitors');
    expect(result).toContain('TestProduct');
    expect(result).toContain('A test product description');
  });

  it('includes additionalContext when provided', () => {
    const result = createPrompt(idea, 'competitors', 'Focus on healthcare');
    expect(result).toContain('Additional Analysis Context:');
    expect(result).toContain('Focus on healthcare');
  });

  it('truncates documentContent to 4,000 chars', () => {
    const ideaWithDoc = { ...idea, documentContent: 'y'.repeat(5000) };
    const result = createPrompt(ideaWithDoc, 'competitors');
    expect(result).toContain('y'.repeat(4000));
    expect(result).not.toContain('y'.repeat(4001));
  });
});
