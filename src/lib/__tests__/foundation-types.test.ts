import { describe, it, expect } from 'vitest';
import type {
  FoundationDocType,
  FoundationDocument,
  FoundationProgress,
} from '@/types';

describe('Foundation types', () => {
  it('FoundationDocument satisfies the shape contract', () => {
    const doc: FoundationDocument = {
      id: 'strategy',
      ideaId: 'idea-123',
      type: 'strategy',
      content: 'Strategy content here',
      advisorId: 'richard-rumelt',
      generatedAt: '2026-02-09T00:00:00.000Z',
      editedAt: null,
      version: 1,
    };
    expect(doc.type).toBe('strategy');
    expect(doc.editedAt).toBeNull();
  });

  it('FoundationDocType covers all 6 document types', () => {
    const types: FoundationDocType[] = [
      'strategy',
      'positioning',
      'brand-voice',
      'design-principles',
      'seo-strategy',
      'social-media-strategy',
    ];
    expect(types).toHaveLength(6);
  });

  it('FoundationProgress tracks per-doc status', () => {
    const progress: FoundationProgress = {
      ideaId: 'idea-123',
      status: 'running',
      currentStep: 'Generating strategy...',
      docs: {
        strategy: 'complete',
        positioning: 'running',
        'brand-voice': 'pending',
        'design-principles': 'pending',
        'seo-strategy': 'pending',
        'social-media-strategy': 'pending',
      },
      error: undefined,
    };
    expect(progress.docs.strategy).toBe('complete');
    expect(progress.docs.positioning).toBe('running');
  });
});
