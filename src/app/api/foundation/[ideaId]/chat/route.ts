import { NextRequest, NextResponse } from 'next/server';
import { isRedisConfigured, getFoundationDoc } from '@/lib/db';
import { getAnthropic } from '@/lib/anthropic';
import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';
import { DOC_ADVISOR_MAP } from '@/lib/agent-tools/foundation';
import { buildContentContext } from '@/lib/content-context';
import { CLAUDE_MODEL } from '@/lib/config';
import type { FoundationDocType } from '@/types';

// Context docs each document type needs during interactive chat.
// Broader than DOC_UPSTREAM (generation ordering) — every downstream doc
// gets strategy + positioning so advisors can ground edits in the full picture.
const CHAT_CONTEXT_DOCS: Record<FoundationDocType, FoundationDocType[]> = {
  'strategy': [],
  'positioning': ['strategy'],
  'brand-voice': ['strategy', 'positioning'],
  'design-principles': ['strategy', 'positioning'],
  'seo-strategy': ['strategy', 'positioning'],
  'social-media-strategy': ['strategy', 'positioning'],
  'visual-identity': ['strategy', 'positioning'],
};

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

    // Load context documents so the advisor can ground edits in the full picture
    const contextTypes = CHAT_CONTEXT_DOCS[body.docType] ?? [];
    const contextDocs: { type: string; content: string; lastUpdated: string }[] = [];
    for (const ctxType of contextTypes) {
      const ctxDoc = await getFoundationDoc(ideaId, ctxType);
      if (ctxDoc) {
        contextDocs.push({
          type: ctxType,
          content: ctxDoc.content,
          lastUpdated: ctxDoc.editedAt || ctxDoc.generatedAt,
        });
      }
    }

    let contextSection = '';

    // Add analysis results (product info, competitors, keywords)
    const analysisCtx = await buildContentContext(ideaId);
    if (analysisCtx) {
      contextSection += '\nANALYSIS RESULTS:\n';
      contextSection += `Product: ${analysisCtx.ideaName}\n`;
      contextSection += `Description: ${analysisCtx.ideaDescription}\n`;
      contextSection += `Target User: ${analysisCtx.targetUser}\n`;
      contextSection += `Problem: ${analysisCtx.problemSolved}\n`;
      if (analysisCtx.competitors) {
        contextSection += `\nCompetitors:\n${analysisCtx.competitors}\n`;
      }
      if (analysisCtx.topKeywords.length > 0) {
        contextSection += `\nTop Keywords:\n${analysisCtx.topKeywords.slice(0, 10).map(k => `- ${k.keyword} (${k.intentType}, competition: ${k.estimatedCompetitiveness})`).join('\n')}\n`;
      }
    }

    // Add related foundation documents with timestamps
    if (contextDocs.length > 0) {
      contextSection += '\nRELATED FOUNDATION DOCUMENTS:\n';
      for (const { type, content, lastUpdated } of contextDocs) {
        contextSection += `\n## ${type.replace(/-/g, ' ').toUpperCase()} (last updated: ${lastUpdated})\n${content}\n`;
      }
    }

    // Build current document header with timestamp for comparison
    const currentDocLastUpdated = doc.editedAt || doc.generatedAt;
    const currentDocHeader = `CURRENT DOCUMENT (${body.docType.replace(/-/g, ' ')}, last updated: ${currentDocLastUpdated})`;

    const systemPrompt = `${advisorPrompt}

---

You are helping the user refine their ${body.docType} document through conversation.
${contextSection}
${currentDocHeader}:
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
