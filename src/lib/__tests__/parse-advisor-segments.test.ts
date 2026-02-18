import { describe, it, expect } from 'vitest';
import { parseStreamSegments, type StreamSegment } from '../parse-advisor-segments';

describe('parseStreamSegments', () => {
  it('returns single julian segment when no markers present', () => {
    const segments = parseStreamSegments('Just some regular text from Julian.');
    expect(segments).toEqual([
      { type: 'julian', content: 'Just some regular text from Julian.' },
    ]);
  });

  it('splits text with one advisor consultation', () => {
    const text = [
      'Let me consult Shirin.',
      '<<<ADVISOR_START>>>:{"advisorId":"shirin-oreizy","advisorName":"Shirin Oreizy"}',
      'Reduce cognitive load on the CTA.',
      '<<<ADVISOR_END>>>',
      'Based on her advice, I\'ll simplify.',
    ].join('\n');

    const segments = parseStreamSegments(text);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ type: 'julian', content: 'Let me consult Shirin.' });
    expect(segments[1]).toEqual({
      type: 'advisor',
      content: 'Reduce cognitive load on the CTA.',
      advisorId: 'shirin-oreizy',
      advisorName: 'Shirin Oreizy',
    });
    expect(segments[2]).toEqual({ type: 'julian', content: "Based on her advice, I'll simplify." });
  });

  it('handles multiple advisor consultations', () => {
    const text = [
      'Consulting two advisors.',
      '<<<ADVISOR_START>>>:{"advisorId":"shirin-oreizy","advisorName":"Shirin Oreizy"}',
      'Shirin feedback.',
      '<<<ADVISOR_END>>>',
      'Now asking Oli.',
      '<<<ADVISOR_START>>>:{"advisorId":"oli-gardner","advisorName":"Oli Gardner"}',
      'Oli feedback.',
      '<<<ADVISOR_END>>>',
      'Final thoughts.',
    ].join('\n');

    const segments = parseStreamSegments(text);
    expect(segments).toHaveLength(5);
    expect(segments[0].type).toBe('julian');
    expect(segments[1]).toMatchObject({ type: 'advisor', advisorId: 'shirin-oreizy' });
    expect(segments[2].type).toBe('julian');
    expect(segments[3]).toMatchObject({ type: 'advisor', advisorId: 'oli-gardner' });
    expect(segments[4].type).toBe('julian');
  });

  it('filters out empty segments', () => {
    const text = [
      '<<<ADVISOR_START>>>:{"advisorId":"shirin-oreizy","advisorName":"Shirin Oreizy"}',
      'Advisor text only.',
      '<<<ADVISOR_END>>>',
    ].join('\n');

    const segments = parseStreamSegments(text);
    // Leading empty julian segment should be filtered
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('advisor');
  });

  it('handles malformed JSON in marker gracefully', () => {
    const text = 'Before\n<<<ADVISOR_START>>>:not-json\nSome text\n<<<ADVISOR_END>>>\nAfter';
    const segments = parseStreamSegments(text);
    // Should return the whole text as a single julian segment (graceful fallback)
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('julian');
  });

  it('handles incomplete markers (missing END) gracefully', () => {
    const text = 'Before\n<<<ADVISOR_START>>>:{"advisorId":"x","advisorName":"X"}\nText without end';
    const segments = parseStreamSegments(text);
    // Should return the whole text as a single julian segment
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('julian');
  });
});
