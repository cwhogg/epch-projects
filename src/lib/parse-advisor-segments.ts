export type StreamSegment =
  | { type: 'julian'; content: string }
  | { type: 'advisor'; content: string; advisorId: string; advisorName: string };

const ADVISOR_START = '<<<ADVISOR_START>>>';
const ADVISOR_END = '<<<ADVISOR_END>>>';

/** Return the full text as a single julian segment, or empty if blank. */
function fallbackToJulian(text: string): StreamSegment[] {
  const trimmed = text.trim();
  return trimmed ? [{ type: 'julian', content: trimmed }] : [];
}

export function parseStreamSegments(text: string): StreamSegment[] {
  // Quick check: if no markers, return as single julian segment
  if (!text.includes(ADVISOR_START)) {
    return fallbackToJulian(text);
  }

  const segments: StreamSegment[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const startIdx = remaining.indexOf(ADVISOR_START);
    if (startIdx === -1) {
      // No more markers — rest is julian text
      const trimmed = remaining.trim();
      if (trimmed) segments.push({ type: 'julian', content: trimmed });
      break;
    }

    // Text before the marker is julian
    const before = remaining.slice(0, startIdx).trim();
    if (before) segments.push({ type: 'julian', content: before });

    // Find the JSON payload on the same line as ADVISOR_START
    const afterStart = remaining.slice(startIdx + ADVISOR_START.length);
    const colonIdx = afterStart.indexOf(':');
    if (colonIdx !== 0) {
      return fallbackToJulian(text);
    }

    const jsonLine = afterStart.slice(1).split('\n')[0];
    let advisorId: string;
    let advisorName: string;
    try {
      const parsed = JSON.parse(jsonLine);
      advisorId = parsed.advisorId;
      advisorName = parsed.advisorName;
    } catch {
      return fallbackToJulian(text);
    }

    // Find the end marker
    const endIdx = afterStart.indexOf(ADVISOR_END);
    if (endIdx === -1) {
      return fallbackToJulian(text);
    }

    // Extract advisor content (between first newline after JSON and end marker)
    const contentStart = afterStart.indexOf('\n', 1) + 1;
    const advisorContent = afterStart.slice(contentStart, endIdx).trim();

    segments.push({
      type: 'advisor',
      content: advisorContent,
      advisorId,
      advisorName,
    });

    remaining = afterStart.slice(endIdx + ADVISOR_END.length);
  }

  return segments;
}

export class AdvisorStreamParser {
  private buffer = '';
  private callback: (segment: StreamSegment) => void;

  constructor(callback: (segment: StreamSegment) => void) {
    this.callback = callback;
  }

  push(chunk: string): void {
    this.buffer += chunk;
    this.drainCompleteSegments();
  }

  flush(): void {
    if (!this.buffer) return;

    // If buffer contains an unclosed start marker, collapse to julian text
    const startIdx = this.buffer.indexOf(ADVISOR_START);
    if (startIdx >= 0) {
      const endIdx = this.buffer.indexOf(ADVISOR_END, startIdx);
      if (endIdx < 0) {
        // Unclosed marker — emit everything as julian
        this.emitJulian(this.buffer);
        this.buffer = '';
        return;
      }
    }

    // Drain any remaining complete segments
    this.drainCompleteSegments();

    // Emit any remaining buffer as julian text
    if (this.buffer.trim()) {
      this.emitJulian(this.buffer);
    }
    this.buffer = '';
  }

  /** Peek at in-progress content in the buffer (not yet emitted as a complete segment).
   *  Returns the current streaming segment for real-time rendering. */
  peekInProgress(): StreamSegment | null {
    const buf = this.buffer;
    if (!buf.trim()) return null;

    const startIdx = buf.indexOf(ADVISOR_START);

    if (startIdx < 0) {
      // No advisor markers — all julian text
      return { type: 'julian', content: buf };
    }

    // Julian text before the marker (should have been eagerly emitted,
    // but handle edge case where it wasn't)
    if (startIdx > 0) {
      const before = buf.slice(0, startIdx);
      if (before.trim()) {
        return { type: 'julian', content: before };
      }
    }

    // We're inside an advisor block (START found but no END)
    const afterStart = buf.slice(startIdx + ADVISOR_START.length);
    if (!afterStart.startsWith(':')) return null;

    const firstNewline = afterStart.indexOf('\n', 1);
    if (firstNewline < 0) return null; // JSON line not complete yet

    try {
      const meta = JSON.parse(afterStart.slice(1, firstNewline));
      const content = afterStart.slice(firstNewline + 1);
      return {
        type: 'advisor',
        content,
        advisorId: meta.advisorId,
        advisorName: meta.advisorName,
      };
    } catch {
      return null;
    }
  }

  private drainCompleteSegments(): void {
    while (true) {
      const startIdx = this.buffer.indexOf(ADVISOR_START);
      if (startIdx < 0) break;

      const endIdx = this.buffer.indexOf(ADVISOR_END, startIdx);
      if (endIdx < 0) {
        // Eagerly emit julian text before an unclosed advisor block
        // so it renders as a separate completed bubble during streaming
        const beforeText = this.buffer.slice(0, startIdx).replace(/\n$/, '');
        if (beforeText.trim()) {
          this.emitJulian(beforeText);
          this.buffer = this.buffer.slice(startIdx);
        }
        break; // Wait for end marker
      }

      // Emit julian text before the advisor marker
      const beforeText = this.buffer.slice(0, startIdx).replace(/\n$/, '');
      if (beforeText.trim()) {
        this.emitJulian(beforeText);
      }

      // Parse the advisor segment
      const markerContent = this.buffer.slice(startIdx + ADVISOR_START.length, endIdx);
      const colonIdx = markerContent.indexOf(':');
      if (colonIdx >= 0) {
        const jsonAndContent = markerContent.slice(colonIdx + 1);
        const firstNewline = jsonAndContent.indexOf('\n');
        if (firstNewline >= 0) {
          const jsonStr = jsonAndContent.slice(0, firstNewline);
          const advisorContent = jsonAndContent.slice(firstNewline + 1).replace(/\n$/, '');
          try {
            const meta = JSON.parse(jsonStr);
            this.callback({
              type: 'advisor',
              content: advisorContent,
              advisorId: meta.advisorId,
              advisorName: meta.advisorName,
            });
          } catch {
            // Malformed JSON — emit as julian
            this.emitJulian(this.buffer.slice(startIdx, endIdx + ADVISOR_END.length));
          }
        }
      }

      // Advance past the end marker
      this.buffer = this.buffer.slice(endIdx + ADVISOR_END.length);
      // Strip leading newline after end marker
      if (this.buffer.startsWith('\n')) {
        this.buffer = this.buffer.slice(1);
      }
    }
  }

  private emitJulian(content: string): void {
    if (content.trim()) {
      this.callback({ type: 'julian', content: content.trim() });
    }
  }
}
