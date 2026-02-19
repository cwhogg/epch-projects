import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';
import { getAnthropic } from '@/lib/anthropic';
import { CLAUDE_MODEL } from '@/lib/config';
import { getAllFoundationDocs } from '@/lib/db';
import type { ToolDefinition } from '@/types';

export function createConsultAdvisorTool(ideaId: string): ToolDefinition {
  return {
    name: 'consult_advisor',
    description:
      'Consult a specialist advisor for their expert opinion on a specific question. ' +
      'Use this when a decision falls outside your core expertise. ' +
      'The advisor receives the question along with relevant foundation documents.',
    input_schema: {
      type: 'object',
      properties: {
        advisorId: {
          type: 'string',
          description: 'The advisor ID to consult (e.g. "oli-gardner", "shirin-oreizy", "joanna-wiebe")',
        },
        question: {
          type: 'string',
          description: 'The specific question to ask the advisor',
        },
        context: {
          type: 'string',
          description: 'Optional build context to include (e.g. current hero copy, brand identity)',
        },
      },
      required: ['advisorId', 'question'],
    },
    execute: async (input) => {
      const advisorId = input.advisorId as string;
      const question = input.question as string;
      const context = input.context as string | undefined;

      const advisorPrompt = getAdvisorSystemPrompt(advisorId);

      const foundationDocsRecord = await getAllFoundationDocs(ideaId);
      const foundationContext = Object.values(foundationDocsRecord)
        .filter((doc): doc is NonNullable<typeof doc> => doc !== null && doc !== undefined)
        .map((doc) => `## ${doc.type} (updated ${doc.editedAt || doc.generatedAt})\n${doc.content}`)
        .join('\n\n---\n\n');

      let userMessage = `Question: ${question}`;
      if (context) {
        userMessage += `\n\nBuild context:\n${context}`;
      }
      if (foundationContext) {
        userMessage += `\n\nFoundation documents for reference:\n${foundationContext}`;
      }

      const response = await getAnthropic().messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: advisorPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as { type: 'text'; text: string }).text)
        .join('\n');

      return text || '(No response from advisor)';
    },
  };
}
