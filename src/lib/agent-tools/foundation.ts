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
import { designPrinciplesSeed } from '@/lib/advisors/design-seed';

// Advisor assignments per doc type
const DOC_ADVISOR_MAP: Record<FoundationDocType, string> = {
  'strategy': 'richard-rumelt',
  'positioning': 'april-dunford',
  'brand-voice': 'copywriter',
  'design-principles': 'richard-rumelt',
  'seo-strategy': 'seo-expert',
  'social-media-strategy': 'april-dunford',
};

// Upstream dependency: which doc types must exist before generating this one
const DOC_UPSTREAM: Record<FoundationDocType, FoundationDocType[]> = {
  'strategy': [],
  'positioning': ['strategy'],
  'brand-voice': ['positioning'],
  'design-principles': ['positioning', 'strategy'],
  'seo-strategy': ['positioning'],
  'social-media-strategy': ['positioning', 'brand-voice'],
};

function buildGenerationPrompt(
  docType: FoundationDocType,
  ideaContext: string,
  upstreamDocs: Record<string, string>,
  designSeed?: string,
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

  if (docType === 'design-principles' && designSeed) {
    prompt += `DESIGN SEED (adapt for this specific product):\n${designSeed}\n\n`;
  }

  switch (docType) {
    case 'strategy':
      prompt += `Write a strategy document with three sections:
1. THE CHALLENGE — What's the core problem or opportunity? Be specific.
2. THE GUIDING POLICY — What's the fundamental approach? What tradeoffs are we making?
3. COHERENT ACTIONS — What specific steps follow from the policy?

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

    case 'design-principles':
      prompt += `Adapt the design seed for this specific product. Keep the general design system but customize:
1. Color palette that reflects the brand positioning
2. Typography choices that match the brand voice
3. Spacing and layout principles appropriate for the product's audience
4. Any product-specific UI patterns`;
      break;

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

export function createFoundationTools(ideaId: string): ToolDefinition[] {
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

        // Check upstream dependencies
        const upstreamTypes = DOC_UPSTREAM[docType];
        const upstreamDocs: Record<string, string> = {};

        for (const upType of upstreamTypes) {
          const doc = await getFoundationDoc(ideaId, upType);
          if (!doc) {
            return { error: `Cannot generate ${docType}: upstream document "${upType}" does not exist. Generate it first.` };
          }
          upstreamDocs[upType] = doc.content;
        }

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

        // Load design seed for design-principles
        let designSeed: string | undefined;
        if (docType === 'design-principles') {
          designSeed = designPrinciplesSeed;
        }

        // Build prompt and call Claude
        const userPrompt = buildGenerationPrompt(docType, ideaContext, upstreamDocs, designSeed);
        const advisorId = DOC_ADVISOR_MAP[docType];
        const systemPrompt = getAdvisorSystemPrompt(advisorId);

        const response = await getAnthropic().messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        const content = response.content[0].type === 'text' ? response.content[0].text : '';

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

        return {
          success: true,
          docType,
          advisorId,
          version,
          contentLength: content.length,
          content,
        };
      },
    },

    {
      name: 'load_design_seed',
      description:
        'Load the existing design principles file as seed input for design principles generation.',
      input_schema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        return { content: designPrinciplesSeed };
      },
    },
  ];
}
