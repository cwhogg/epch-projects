import { describe, it, expect } from 'vitest';
import { parseStreamSegments, AdvisorStreamParser, type StreamSegment } from '../parse-advisor-segments';

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

describe('AdvisorStreamParser', () => {
  it('emits julian segment for text without markers', () => {
    const segments: StreamSegment[] = [];
    const parser = new AdvisorStreamParser((seg) => segments.push(seg));

    parser.push('Hello from Julian.');
    parser.flush();

    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('julian');
    expect(segments[0].content).toBe('Hello from Julian.');
  });

  it('emits complete advisor segment in single chunk', () => {
    const segments: StreamSegment[] = [];
    const parser = new AdvisorStreamParser((seg) => segments.push(seg));

    parser.push('Before advisor.\n<<<ADVISOR_START>>>:{"advisorId":"shirin-oreizy","advisorName":"Shirin Oreizy"}\nAdvisor response here.\n<<<ADVISOR_END>>>\nAfter advisor.');
    parser.flush();

    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ type: 'julian', content: 'Before advisor.' });
    expect(segments[1]).toEqual({
      type: 'advisor',
      content: 'Advisor response here.',
      advisorId: 'shirin-oreizy',
      advisorName: 'Shirin Oreizy',
    });
    expect(segments[2]).toEqual({ type: 'julian', content: 'After advisor.' });
  });

  it('handles marker split across two chunks', () => {
    const segments: StreamSegment[] = [];
    const parser = new AdvisorStreamParser((seg) => segments.push(seg));

    parser.push('Text before\n<<<ADVISOR_STA');
    parser.push('RT>>>:{"advisorId":"oli-gardner","advisorName":"Oli Gardner"}\nConversion advice.\n<<<ADVISOR_END>>>\n');
    parser.flush();

    expect(segments.some((s) => s.type === 'advisor' && s.advisorId === 'oli-gardner')).toBe(true);
  });

  it('collapses unclosed marker at stream end into julian text', () => {
    const segments: StreamSegment[] = [];
    const parser = new AdvisorStreamParser((seg) => segments.push(seg));

    parser.push('Some text\n<<<ADVISOR_START>>>:{"advisorId":"copywriter","advisorName":"Copywriter"}\nPartial response without end marker');
    parser.flush();

    // Should fall back to single julian segment with the raw text
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('julian');
    expect(segments[0].content).toContain('Partial response without end marker');
  });

  it('handles multiple advisor segments in sequence', () => {
    const segments: StreamSegment[] = [];
    const parser = new AdvisorStreamParser((seg) => segments.push(seg));

    const text = [
      'Julian intro.',
      '\n<<<ADVISOR_START>>>:{"advisorId":"shirin-oreizy","advisorName":"Shirin Oreizy"}',
      '\nShirin says things.',
      '\n<<<ADVISOR_END>>>',
      '\n<<<ADVISOR_START>>>:{"advisorId":"copywriter","advisorName":"Copywriter"}',
      '\nCopywriter says things.',
      '\n<<<ADVISOR_END>>>',
      '\nJulian synthesis.',
    ].join('');

    parser.push(text);
    parser.flush();

    const advisorSegs = segments.filter((s) => s.type === 'advisor');
    expect(advisorSegs).toHaveLength(2);
    expect(advisorSegs[0].advisorId).toBe('shirin-oreizy');
    expect(advisorSegs[1].advisorId).toBe('copywriter');
  });

  it('handles JSON metadata split across chunks', () => {
    const segments: StreamSegment[] = [];
    const parser = new AdvisorStreamParser((seg) => segments.push(seg));

    parser.push('\n<<<ADVISOR_START>>>:{"advisorId":"april');
    parser.push('-dunford","advisorName":"April Dunford"}\nPositioning feedback.\n<<<ADVISOR_END>>>');
    parser.flush();

    expect(segments.some((s) => s.type === 'advisor' && s.advisorId === 'april-dunford')).toBe(true);
  });

  it('emits segments incrementally as complete markers are found', () => {
    const segments: StreamSegment[] = [];
    const parser = new AdvisorStreamParser((seg) => segments.push(seg));

    parser.push('Julian text.\n<<<ADVISOR_START>>>:{"advisorId":"shirin-oreizy","advisorName":"Shirin Oreizy"}\nAdvisor text.\n<<<ADVISOR_END>>>');

    // Before flush, completed segments should already be emitted
    expect(segments.length).toBeGreaterThanOrEqual(2);

    parser.push('\nMore Julian text.');
    parser.flush();

    expect(segments[segments.length - 1].type).toBe('julian');
    expect(segments[segments.length - 1].content).toContain('More Julian text.');
  });
});
