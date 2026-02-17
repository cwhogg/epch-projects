import { describe, it, expect } from 'vitest';
import { StreamParser } from '@/lib/parse-stream';

describe('StreamParser', () => {
  describe('processChunk', () => {
    it('returns all text as chat when no tags present', () => {
      const parser = new StreamParser();
      const result = parser.processChunk('Hello, I think your strategy looks great.');

      expect(result.chatText).toBe('Hello, I think your strategy looks great.');
      expect(result.documentContent).toBeNull();
    });

    it('extracts document content from complete tags in single chunk', () => {
      const parser = new StreamParser();
      const input = 'Here are my changes:<updated_document>New content here</updated_document>Let me know.';
      const result = parser.processChunk(input);

      expect(result.chatText).toBe('Here are my changes:Let me know.');
      expect(result.documentContent).toBe('New content here');
    });

    it('handles tags split across multiple chunks', () => {
      const parser = new StreamParser();

      const r1 = parser.processChunk('I updated it. <updated_');
      expect(r1.chatText).toBe('I updated it. ');
      expect(r1.documentContent).toBeNull();

      const r2 = parser.processChunk('document>The new');
      expect(r2.chatText).toBe('');
      expect(r2.documentContent).toBeNull();

      const r3 = parser.processChunk(' content</updated_document> Done.');
      expect(r3.chatText).toBe(' Done.');
      expect(r3.documentContent).toBe('The new content');
    });

    it('handles closing tag split across chunks', () => {
      const parser = new StreamParser();

      parser.processChunk('<updated_document>Content here');
      const r2 = parser.processChunk('</updated_');
      expect(r2.documentContent).toBeNull();

      const r3 = parser.processChunk('document>After.');
      expect(r3.documentContent).toBe('Content here');
      expect(r3.chatText).toBe('After.');
    });

    it('uses last document block when multiple blocks present', () => {
      const parser = new StreamParser();
      const input = '<updated_document>First</updated_document>Middle<updated_document>Second</updated_document>End';
      const result = parser.processChunk(input);

      // Both blocks yield documentContent, but the caller should use the last one
      // The parser returns documentContent for each closing tag it encounters
      expect(result.chatText).toBe('MiddleEnd');
      expect(result.documentContent).toBe('Second');
    });

    it('handles empty document between tags', () => {
      const parser = new StreamParser();
      const result = parser.processChunk('Text<updated_document></updated_document>More');

      expect(result.chatText).toBe('TextMore');
      expect(result.documentContent).toBe('');
    });

    it('flushes partial non-matching tag to chat text', () => {
      const parser = new StreamParser();
      const result = parser.processChunk('Check <ul>list</ul> here');

      expect(result.chatText).toBe('Check <ul>list</ul> here');
      expect(result.documentContent).toBeNull();
    });

    it('handles document content with HTML-like content inside', () => {
      const parser = new StreamParser();
      const result = parser.processChunk('<updated_document># Strategy\n\n- Point <strong>one</strong></updated_document>');

      expect(result.documentContent).toBe('# Strategy\n\n- Point <strong>one</strong>');
      expect(result.chatText).toBe('');
    });

    it('handles character-by-character streaming', () => {
      const parser = new StreamParser();
      const fullText = 'Hi<updated_document>Doc</updated_document>End';
      let chatText = '';
      let lastDocContent: string | null = null;

      for (const char of fullText) {
        const r = parser.processChunk(char);
        chatText += r.chatText;
        if (r.documentContent !== null) lastDocContent = r.documentContent;
      }

      expect(chatText).toBe('HiEnd');
      expect(lastDocContent).toBe('Doc');
    });
  });

  describe('finalize', () => {
    it('returns no error when stream completed normally', () => {
      const parser = new StreamParser();
      parser.processChunk('Just chat text.');
      const result = parser.finalize();

      expect(result.error).toBeUndefined();
    });

    it('returns error when stream ends inside document content', () => {
      const parser = new StreamParser();
      parser.processChunk('<updated_document>Partial content');
      const result = parser.finalize();

      expect(result.error).toBe('Response interrupted — document unchanged');
    });

    it('returns error when stream ends during closing tag', () => {
      const parser = new StreamParser();
      parser.processChunk('<updated_document>Content</updated_');
      const result = parser.finalize();

      expect(result.error).toBe('Response interrupted — document unchanged');
    });

    it('returns no error when stream ends during a non-matching open tag', () => {
      const parser = new StreamParser();
      parser.processChunk('Text <updated_');
      const result = parser.finalize();

      // Partial open tag at end of stream is just chat text, not an error
      expect(result.error).toBeUndefined();
    });
  });
});
