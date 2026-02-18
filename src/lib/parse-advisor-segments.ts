export type StreamSegment =
  | { type: 'julian'; content: string }
  | { type: 'advisor'; content: string; advisorId: string; advisorName: string };

const ADVISOR_START = '<<<ADVISOR_START>>>';
const ADVISOR_END = '<<<ADVISOR_END>>>';

export function parseStreamSegments(text: string): StreamSegment[] {
  // Quick check: if no markers, return as single julian segment
  if (!text.includes(ADVISOR_START)) {
    return text.trim() ? [{ type: 'julian', content: text.trim() }] : [];
  }

  const segments: StreamSegment[] = [];

  try {
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
        // Malformed — return whole text as julian
        return text.trim() ? [{ type: 'julian', content: text.trim() }] : [];
      }

      const jsonLine = afterStart.slice(1).split('\n')[0];
      let advisorId: string;
      let advisorName: string;
      try {
        const parsed = JSON.parse(jsonLine);
        advisorId = parsed.advisorId;
        advisorName = parsed.advisorName;
      } catch {
        // Malformed JSON — return whole text as julian
        return text.trim() ? [{ type: 'julian', content: text.trim() }] : [];
      }

      // Find the end marker
      const endIdx = afterStart.indexOf(ADVISOR_END);
      if (endIdx === -1) {
        // Missing end marker — return whole text as julian
        return text.trim() ? [{ type: 'julian', content: text.trim() }] : [];
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
  } catch {
    // Any unexpected error — return whole text as julian
    return text.trim() ? [{ type: 'julian', content: text.trim() }] : [];
  }

  return segments;
}
