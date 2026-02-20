import type { ToolDefinition, FoundationDocType, FoundationDocument } from '@/types';
import {
  getFoundationDoc,
  getAllFoundationDocs,
  saveFoundationDoc,
} from '@/lib/db';
import { buildContentContext } from '@/lib/content-agent';
import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';
import { getAnthropic } from '@/lib/anthropic';
import { CLAUDE_MODEL } from '@/lib/config';
import { DOC_DEPENDENCIES } from '@/lib/foundation-deps';
import { getFrameworkPrompt } from '@/lib/frameworks/framework-loader';

// Advisor assignments per doc type
export const DOC_ADVISOR_MAP: Record<FoundationDocType, string> = {
  'strategy': 'seth-godin',
  'positioning': 'april-dunford',
  'brand-voice': 'copywriter',
  'design-principles': 'oli-gardner',
  'seo-strategy': 'seo-expert',
  'social-media-strategy': 'april-dunford',
  'visual-identity': 'copywriter',
};

function buildGenerationPrompt(
  docType: FoundationDocType,
  ideaContext: string,
  upstreamDocs: Record<string, string>,
): string {
  let prompt = `Generate a ${docType.replace(/-/g, ' ')} document for this product.\n\n`;
  prompt += `PRODUCT CONTEXT:\n${ideaContext}\n\n`;

  if (Object.keys(upstreamDocs).length > 0) {
    prompt += 'EXISTING FOUNDATION DOCUMENTS:\n';
    for (const [type, content] of Object.entries(upstreamDocs)) {
      prompt += `\n## ${type.replace(/-/g, ' ').toUpperCase()}\n${content}\n`;
    }
    prompt += '\n';
  }

  switch (docType) {
    case 'strategy':
      prompt += `Write a concise strategy document (aim for ~1 page) answering three questions:

1. WHO IS OUR SMALLEST VIABLE AUDIENCE?
The specific group of people we seek to serve. Not a demographic — a psychographic. People who believe what we believe, defined narrowly enough that we can be remarkable to them. If the answer is "everyone" or a broad category, it's not narrow enough.

2. WHAT MAKES US REMARKABLE TO THEM?
The specific thing we do that they'd miss if we disappeared. Not a feature list — the core promise. The Purple Cow. This should feel risky and specific. If it could apply to any competitor, it's not remarkable.

3. WHAT'S OUR PERMISSION TO REACH THEM?
How we earn the right to show up in their world. For this system, primarily SEO content that answers questions they're already asking — showing up with value before asking for anything.

If the user has not provided differentiation, tradeoffs, or anti-target information, mark those sections with: [ASSUMPTION: The LLM inferred this strategic choice — review and confirm]`;
      break;

    case 'positioning':
      prompt += `Write a positioning statement covering:
1. COMPETITIVE ALTERNATIVES — What would customers use if this didn't exist?
2. UNIQUE ATTRIBUTES — What does this offer that alternatives don't?
3. VALUE — What does the unique capability enable for customers?
4. TARGET CUSTOMER — Who cares most about this value?
5. MARKET CATEGORY — Where does this compete?
6. WHY NOW — What changed that makes this timely?

Ground every claim in the strategy document. Don't invent new positioning — derive it.`;
      break;

    case 'brand-voice':
      prompt += `Define a brand voice document with:
1. VOICE SUMMARY — 2-3 sentences describing the voice character
2. TONE ATTRIBUTES — 3-5 attributes with brief explanations
3. EXAMPLE SENTENCES — One example per context type:
   - Headline
   - CTA (call to action)
   - Paragraph opening
   - Technical explanation
   - Error message
4. COUNTER-EXAMPLES — 3-5 examples of what the voice does NOT sound like
5. SELF-CHECK — Verify each example is stylistically distinct and serves its context`;
      break;

    case 'design-principles': {
      const frameworkPrompt = getFrameworkPrompt('design-principles');
      if (frameworkPrompt) {
        prompt += frameworkPrompt;
      } else {
        prompt += 'Generate a design principles document with a json:design-tokens block.';
      }
      break;
    }

    case 'seo-strategy':
      prompt += `Write an SEO strategy document covering:
1. PRIMARY KEYWORD CLUSTERS — Group target keywords by intent and topic
2. CONTENT ARCHITECTURE — Pillar pages, supporting content, topic clusters
3. ON-PAGE STRATEGY — Heading hierarchy, keyword placement, meta description approach
4. LINK STRATEGY — Internal linking structure, link-worthy content types
5. SERP FEATURE TARGETS — Featured snippets, PAA, knowledge panels worth pursuing`;
      break;

    case 'social-media-strategy':
      prompt += `Write a social media strategy document covering:
1. PLATFORM SELECTION — Which platforms and why (based on target audience)
2. CONTENT PILLARS — 3-5 recurring content themes
3. POSTING CADENCE — Frequency and timing recommendations
4. VOICE ADAPTATION — How the brand voice adapts per platform
5. ENGAGEMENT APPROACH — Community interaction style`;
      break;
  }

  return prompt;
}

export function createFoundationTools(
  ideaId: string,
  onDocProgress?: (docType: FoundationDocType, status: 'running' | 'complete' | 'error') => void,
): ToolDefinition[] {
  return [
    {
      name: 'load_foundation_docs',
      description:
        'Load one or more foundation documents from Redis. If docTypes is omitted, loads all existing docs.',
      input_schema: {
        type: 'object',
        properties: {
          docTypes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['strategy', 'positioning', 'brand-voice', 'design-principles', 'seo-strategy', 'social-media-strategy'],
            },
            description: 'Specific doc types to load. Omit to load all.',
          },
        },
      },
      execute: async (input) => {
        const docTypes = input.docTypes as FoundationDocType[] | undefined;

        if (!docTypes || docTypes.length === 0) {
          const allDocs = await getAllFoundationDocs(ideaId);
          return {
            docs: allDocs,
            missing: [],
          };
        }

        const docs: Record<string, FoundationDocument> = {};
        const missing: string[] = [];

        for (const docType of docTypes) {
          const doc = await getFoundationDoc(ideaId, docType);
          if (doc) {
            docs[docType] = doc;
          } else {
            missing.push(docType);
          }
        }

        return { docs, missing };
      },
    },

    {
      name: 'generate_foundation_doc',
      description:
        'Generate a foundation document using the assigned advisor. Requires upstream docs to exist (e.g., positioning requires strategy). Saves to Redis and returns the generated content.',
      input_schema: {
        type: 'object',
        properties: {
          docType: {
            type: 'string',
            enum: ['strategy', 'positioning', 'brand-voice', 'design-principles', 'seo-strategy', 'social-media-strategy'],
            description: 'The type of foundation document to generate.',
          },
          strategicInputs: {
            type: 'object',
            properties: {
              differentiation: { type: 'string' },
              deliberateTradeoffs: { type: 'string' },
              antiTarget: { type: 'string' },
            },
            description: 'Optional strategic inputs from the user (only used for strategy doc).',
          },
        },
        required: ['docType'],
      },
      execute: async (input) => {
        const docType = input.docType as FoundationDocType;
        const strategicInputs = input.strategicInputs as { differentiation?: string; deliberateTradeoffs?: string; antiTarget?: string } | undefined;

        // Check upstream dependencies BEFORE signaling 'running'
        const upstreamTypes = DOC_DEPENDENCIES[docType];
        const upstreamDocs: Record<string, string> = {};

        for (const upType of upstreamTypes) {
          const doc = await getFoundationDoc(ideaId, upType);
          if (!doc) {
            return { error: `Cannot generate ${docType}: upstream document "${upType}" does not exist. Generate it first.` };
          }
          upstreamDocs[upType] = doc.content;
        }

        // Validation passed — NOW signal 'running'
        onDocProgress?.(docType, 'running');

        try {
          // Build idea context
          const ctx = await buildContentContext(ideaId);
          if (!ctx) {
            return { error: 'No analysis found for this idea. Run analysis first.' };
          }

          let ideaContext = `Name: ${ctx.ideaName}\nDescription: ${ctx.ideaDescription}\nTarget User: ${ctx.targetUser}\nProblem: ${ctx.problemSolved}`;
          if (ctx.competitors) {
            ideaContext += `\n\nCompetitors:\n${ctx.competitors}`;
          }
          if (ctx.topKeywords.length > 0) {
            ideaContext += `\n\nTop Keywords:\n${ctx.topKeywords.slice(0, 10).map(k => `- ${k.keyword} (${k.intentType}, competition: ${k.estimatedCompetitiveness})`).join('\n')}`;
          }

          // Add strategic inputs for strategy doc
          if (docType === 'strategy' && strategicInputs) {
            if (strategicInputs.differentiation) {
              ideaContext += `\n\nDIFFERENTIATION (from user): ${strategicInputs.differentiation}`;
            }
            if (strategicInputs.deliberateTradeoffs) {
              ideaContext += `\nDELIBERATE TRADEOFFS (from user): ${strategicInputs.deliberateTradeoffs}`;
            }
            if (strategicInputs.antiTarget) {
              ideaContext += `\nNOT TARGETING (from user): ${strategicInputs.antiTarget}`;
            }
          }

          // Build prompt and call Claude
          const userPrompt = buildGenerationPrompt(docType, ideaContext, upstreamDocs);
          const advisorId = DOC_ADVISOR_MAP[docType];
          const systemPrompt = getAdvisorSystemPrompt(advisorId);

          const response = await getAnthropic().messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          });

          const content = response.content[0].type === 'text' ? response.content[0].text : '';

          if (!content.trim()) {
            onDocProgress?.(docType, 'error');
            return { error: `Generation returned empty content for ${docType}. Please retry.` };
          }

          // Check for existing doc to determine version
          const existing = await getFoundationDoc(ideaId, docType);
          const version = existing ? existing.version + 1 : 1;

          const doc: FoundationDocument = {
            id: docType,
            ideaId,
            type: docType,
            content,
            advisorId,
            generatedAt: new Date().toISOString(),
            editedAt: null,
            version,
          };

          await saveFoundationDoc(ideaId, doc);
          onDocProgress?.(docType, 'complete');

          return {
            success: true,
            docType,
            advisorId,
            version,
            contentLength: content.length,
            content,
          };
        } catch (err) {
          onDocProgress?.(docType, 'error');
          throw err;
        }
      },
    },
  ];
}
