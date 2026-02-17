const OPEN_TAG = '<updated_document>';
const CLOSE_TAG = '</updated_document>';

type ParserState = 'text' | 'maybe-open' | 'content' | 'maybe-close';

export class StreamParser {
  private state: ParserState = 'text';
  private tagBuffer = '';
  private documentBuffer = '';

  processChunk(chunk: string): { chatText: string; documentContent: string | null } {
    let chatText = '';
    let documentContent: string | null = null;

    for (const char of chunk) {
      switch (this.state) {
        case 'text':
          if (char === '<') {
            this.state = 'maybe-open';
            this.tagBuffer = '<';
          } else {
            chatText += char;
          }
          break;

        case 'maybe-open':
          this.tagBuffer += char;
          if (OPEN_TAG.startsWith(this.tagBuffer)) {
            if (this.tagBuffer === OPEN_TAG) {
              this.state = 'content';
              this.documentBuffer = '';
              this.tagBuffer = '';
            }
          } else {
            chatText += this.tagBuffer;
            this.tagBuffer = '';
            this.state = 'text';
          }
          break;

        case 'content':
          if (char === '<') {
            this.state = 'maybe-close';
            this.tagBuffer = '<';
          } else {
            this.documentBuffer += char;
          }
          break;

        case 'maybe-close':
          this.tagBuffer += char;
          if (CLOSE_TAG.startsWith(this.tagBuffer)) {
            if (this.tagBuffer === CLOSE_TAG) {
              documentContent = this.documentBuffer;
              this.documentBuffer = '';
              this.tagBuffer = '';
              this.state = 'text';
            }
          } else {
            this.documentBuffer += this.tagBuffer;
            this.tagBuffer = '';
            this.state = 'content';
          }
          break;
      }
    }

    return { chatText, documentContent };
  }

  finalize(): { error?: string } {
    if (this.state === 'content' || this.state === 'maybe-close') {
      return { error: 'Response interrupted — document unchanged' };
    }
    return {};
  }
}
