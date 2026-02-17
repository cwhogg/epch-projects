import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured, getFoundationDoc } from '@/lib/db';
import { getAnthropic } from '@/lib/anthropic';
import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';
import { DOC_ADVISOR_MAP } from '@/lib/agent-tools/foundation';
import { CLAUDE_MODEL } from '@/lib/config';
import type { FoundationDocType } from '@/types';

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> },
) {
  const { ideaId } = await params;

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  let body: {
    docType?: FoundationDocType;
    messages?: { role: 'user' | 'assistant'; content: string }[];
    currentContent?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.docType || !body.messages || typeof body.currentContent !== 'string') {
    return NextResponse.json({ error: 'Missing docType, messages, or currentContent' }, { status: 400 });
  }

  try {
    const doc = await getFoundationDoc(ideaId, body.docType);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const advisorId = DOC_ADVISOR_MAP[body.docType];
    const advisorPrompt = getAdvisorSystemPrompt(advisorId);

    const systemPrompt = `${advisorPrompt}

---

You are helping the user refine their ${body.docType} document through conversation.

CURRENT DOCUMENT:
${body.currentContent}

RULES:
- When the user asks you to change the document, make ONLY the requested changes. Do not rewrite, rephrase, or "improve" sections they didn't ask about.
- After making changes, include the full updated document between <updated_document> tags.
- If the user asks a question without requesting changes, respond conversationally without tags.
- Keep your conversational response brief — focus on what you changed and why.`;

    const stream = getAnthropic().messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: body.messages,
    });

    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            for await (const event of stream) {
              if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                controller.enqueue(new TextEncoder().encode(event.delta.text));
              }
            }
            controller.close();
          } catch (error) {
            console.error('Stream error:', error);
            controller.error(error);
          }
        },
      }),
      {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        },
      },
    );
  } catch (error) {
    console.error('Error in foundation chat:', error);
    return NextResponse.json({ error: 'Failed to start conversation' }, { status: 500 });
  }
}
