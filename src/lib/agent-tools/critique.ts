import type {
  ToolDefinition,
  AdvisorCritique,
  CritiqueIssue,
  CritiqueRound,
  PipelineProgress,
  RoundSummary,
} from '@/types';
import { getRedis } from '@/lib/redis';
import { getAnthropic } from '@/lib/anthropic';
import { CLAUDE_MODEL } from '@/lib/config';
import { getFoundationDoc } from '@/lib/db';
import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';
import { parseLLMJson } from '@/lib/llm-utils';
import { selectCritics, type ContentRecipe } from '@/lib/content-recipes';
import { advisorRegistry, type AdvisorEntry } from '@/lib/advisors/registry';
import { applyEditorRubric } from '@/lib/editor-decision';
import { getFrameworkPrompt } from '@/lib/frameworks/framework-loader';
import pLimit from 'p-limit';

const DRAFT_TTL = 7200; // 2 hours
const ROUND_TTL = 7200;
const PROGRESS_TTL = 7200;

// Tool for structured critique output — passed to each critic call
const submitCritiqueTool = {
  name: 'submit_critique',
  description: 'Submit your structured evaluation of the content.',
  input_schema: {
    type: 'object' as const,
    properties: {
      score: { type: 'number' as const, minimum: 1, maximum: 10 },
      pass: { type: 'boolean' as const },
      issues: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            severity: {
              type: 'string' as const,
              enum: ['high', 'medium', 'low'],
            },
            description: { type: 'string' as const },
            suggestion: { type: 'string' as const },
          },
          required: ['severity', 'description', 'suggestion'],
        },
      },
    },
    required: ['score', 'pass', 'issues'],
  },
};

/**
 * Run a single critic call and extract the structured critique from tool use.
 */
async function runSingleCritic(
  advisor: AdvisorEntry,
  draft: string,
  recipe: ContentRecipe,
  ideaId: string,
): Promise<AdvisorCritique> {
  // Load advisor's context docs
  const contextParts: string[] = [];
  if (advisor.contextDocs) {
    for (const docType of advisor.contextDocs) {
      const doc = await getFoundationDoc(ideaId, docType);
      if (doc) {
        contextParts.push(
          `## ${docType.replace(/-/g, ' ').toUpperCase()}\n${doc.content}`,
        );
      }
    }
  }

  let userPrompt =
    `You are evaluating this content as ${advisor.name}.\n\n` +
    `Your evaluation focus:\n${advisor.evaluationExpertise}\n\n`;

  if (recipe.evaluationEmphasis) {
    userPrompt +=
      `EMPHASIS FOR THIS CONTENT TYPE:\n${recipe.evaluationEmphasis}\n\n`;
  }

  if (contextParts.length > 0) {
    userPrompt += `REFERENCE DOCUMENTS:\n${contextParts.join('\n\n')}\n\n`;
  }

  userPrompt +=
    `CONTENT TO EVALUATE:\n${draft}\n\n` +
    `Use the submit_critique tool to provide your structured evaluation.`;

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: userPrompt }],
    tools: [submitCritiqueTool],
  });

  // Extract tool use from response
  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    return {
      advisorId: advisor.id,
      name: advisor.name,
      score: 0,
      pass: false,
      issues: [],
      error: 'Critic did not use submit_critique tool',
    };
  }

  const input = toolUse.input as {
    score: number;
    pass: boolean;
    issues: CritiqueIssue[];
  };

  return {
    advisorId: advisor.id,
    name: advisor.name,
    score: input.score,
    pass: input.pass,
    issues: input.issues || [],
  };
}

/**
 * Compare two rounds to find fixed items.
 * An issue is "fixed" if it was present in the previous round but absent in the current.
 */
function findFixedItems(
  prevCritiques: AdvisorCritique[],
  currentCritiques: AdvisorCritique[],
): string[] {
  const fixed: string[] = [];
  for (const prevCrit of prevCritiques) {
    const currentCrit = currentCritiques.find(
      (c) => c.advisorId === prevCrit.advisorId,
    );
    if (!currentCrit) continue;

    for (const prevIssue of prevCrit.issues) {
      if (prevIssue.severity === 'low') continue;
      const stillPresent = currentCrit.issues.some(
        (ci) =>
          ci.severity !== 'low' &&
          ci.description.toLowerCase().includes(
            prevIssue.description.toLowerCase().split(' ').slice(0, 3).join(' '),
          ),
      );
      if (!stillPresent) {
        fixed.push(prevIssue.description);
      }
    }
  }
  return fixed;
}

/**
 * Find aspects with no high/medium issues across all critics.
 * A critic with no high/medium issues means their evaluation domain scored well.
 */
function findWellScoredAspects(critiques: AdvisorCritique[]): string[] {
  const aspects: string[] = [];
  for (const critique of critiques) {
    const hasHighMedium = critique.issues.some(
      (i) => i.severity === 'high' || i.severity === 'medium',
    );
    if (!hasHighMedium) {
      aspects.push(`${critique.name}'s evaluation domain`);
    }
  }
  return aspects;
}

export function createCritiqueTools(
  runId: string,
  ideaId: string,
  recipe: ContentRecipe,
): ToolDefinition[] {
  // Mutable state across tool calls
  let selectedCritics: AdvisorEntry[] = [];
  let previousRoundCritiques: AdvisorCritique[] = [];
  let previousAvgScore: number | undefined;
  let accumulatedFixedItems: string[] = [];
  let accumulatedWellScored: string[] = [];

  return [
    {
      name: 'generate_draft',
      description:
        'Generate initial content draft using the recipe author advisor. Call this first.',
      input_schema: {
        type: 'object',
        properties: {
          contentContext: {
            type: 'string',
            description:
              'Content-specific context (research data, keywords, etc.)',
          },
        },
        required: ['contentContext'],
      },
      execute: async (input) => {
        const contentContext = input.contentContext as string;

        // Load author context docs
        const contextParts: string[] = [];
        for (const docType of recipe.authorContextDocs) {
          const doc = await getFoundationDoc(ideaId, docType);
          if (doc) {
            contextParts.push(
              `## ${docType.replace(/-/g, ' ').toUpperCase()}\n${doc.content}`,
            );
          }
        }

        let systemPrompt = getAdvisorSystemPrompt(recipe.authorAdvisor);
        if (recipe.authorFramework) {
          const frameworkPrompt = getFrameworkPrompt(recipe.authorFramework);
          if (frameworkPrompt) {
            systemPrompt += '\n\n## FRAMEWORK\n' + frameworkPrompt;
          }
        }
        const userPrompt =
          `Write ${recipe.contentType} content for this product.\n\n` +
          `CONTEXT:\n${contentContext}\n\n` +
          (contextParts.length > 0
            ? `REFERENCE DOCUMENTS:\n${contextParts.join('\n\n')}\n\n`
            : '') +
          'Write the complete content now.';

        const response = await getAnthropic().messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        const draft =
          response.content[0].type === 'text'
            ? response.content[0].text
            : '';

        // Save to Redis
        await getRedis().set(`draft:${runId}`, draft, { ex: DRAFT_TTL });

        return {
          success: true,
          draftLength: draft.length,
          draft,
        };
      },
    },

    {
      name: 'run_critiques',
      description:
        'Run critique cycle with dynamically selected advisors. Reads current draft from Redis.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        // Read draft
        const draft = await getRedis().get<string>(`draft:${runId}`);
        if (!draft) return { error: 'No draft found — call generate_draft first' };

        // Select critics (first time only)
        if (selectedCritics.length === 0) {
          selectedCritics = await selectCritics(recipe, advisorRegistry);

          // Update progress with selected critics
          const progressKey = `pipeline_progress:${runId}`;
          const existing = await getRedis().get<PipelineProgress>(progressKey);
          if (existing) {
            existing.selectedCritics = selectedCritics.map((a) => ({
              advisorId: a.id,
              name: a.name,
            }));
            await getRedis().set(progressKey, JSON.stringify(existing), {
              ex: PROGRESS_TTL,
            });
          }
        }

        if (selectedCritics.length === 0) {
          return { critiques: [], message: 'No matching critics found' };
        }

        // Run critic calls with p-limit(2) concurrency
        const limit = pLimit(2);
        const results = await Promise.allSettled(
          selectedCritics.map((advisor) =>
            limit(() => runSingleCritic(advisor, draft, recipe, ideaId)),
          ),
        );

        const critiques: AdvisorCritique[] = results.map((result, idx) => {
          if (result.status === 'fulfilled') return result.value;
          return {
            advisorId: selectedCritics[idx].id,
            name: selectedCritics[idx].name,
            score: 0,
            pass: false,
            issues: [],
            error:
              result.reason instanceof Error
                ? result.reason.message
                : 'Critic call failed',
          };
        });

        return { critiques };
      },
    },

    {
      name: 'editor_decision',
      description:
        'Apply mechanical editor rubric to critique results. Returns approve or revise with brief.',
      input_schema: {
        type: 'object',
        properties: {
          critiques: {
            type: 'array',
            description: 'Array of AdvisorCritique objects from run_critiques',
            items: { type: 'object' },
          },
        },
        required: ['critiques'],
      },
      execute: async (input) => {
        const critiques = input.critiques as AdvisorCritique[];
        const result = applyEditorRubric(
          critiques,
          recipe.minAggregateScore,
          previousAvgScore,
        );

        previousAvgScore = result.avgScore;

        return {
          decision: result.decision,
          brief: result.brief,
          avgScore: result.avgScore,
          highIssueCount: result.highIssueCount,
        };
      },
    },

    {
      name: 'revise_draft',
      description:
        'Revise the current draft based on editor brief. Includes do-not-regress guard.',
      input_schema: {
        type: 'object',
        properties: {
          brief: {
            type: 'string',
            description: 'Editor revision brief focusing on high/medium issues',
          },
        },
        required: ['brief'],
      },
      execute: async (input) => {
        const brief = input.brief as string;

        const draft = await getRedis().get<string>(`draft:${runId}`);
        if (!draft) return { error: 'No draft found in Redis' };

        // Build do-not-regress list
        const doNotRegress = [
          ...accumulatedFixedItems,
          ...accumulatedWellScored,
        ];

        let revisionPrompt =
          `REVISION BRIEF:\nAddress these issues:\n${brief}\n\n`;

        if (doNotRegress.length > 0) {
          revisionPrompt +=
            `DO NOT REGRESS — these aspects scored well or were fixed in previous rounds:\n` +
            doNotRegress.map((item) => `- ${item}`).join('\n') +
            '\n\nAddress only the listed issues. Do not change aspects on the "do not regress" list.\n\n';
        }

        revisionPrompt += `CURRENT DRAFT:\n${draft}\n\nRevise the draft now.`;

        const systemPrompt = getAdvisorSystemPrompt(recipe.authorAdvisor);

        const response = await getAnthropic().messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: revisionPrompt }],
        });

        const revisedDraft =
          response.content[0].type === 'text'
            ? response.content[0].text
            : '';

        await getRedis().set(`draft:${runId}`, revisedDraft, {
          ex: DRAFT_TTL,
        });

        return {
          success: true,
          revisedDraftLength: revisedDraft.length,
          revisedDraft,
        };
      },
    },

    {
      name: 'summarize_round',
      description:
        'Save full round data to Redis and return compressed summary. Tracks fixed items across rounds.',
      input_schema: {
        type: 'object',
        properties: {
          round: { type: 'number' },
          critiques: {
            type: 'array',
            items: { type: 'object' },
          },
          editorDecision: {
            type: 'string',
            enum: ['approve', 'revise'],
          },
          brief: { type: 'string' },
        },
        required: ['round', 'critiques', 'editorDecision'],
      },
      execute: async (input) => {
        const round = input.round as number;
        const critiques = input.critiques as AdvisorCritique[];
        const editorDecision = input.editorDecision as 'approve' | 'revise';
        const brief = (input.brief as string) || '';

        // Calculate fixed items
        const newlyFixed = findFixedItems(previousRoundCritiques, critiques);
        accumulatedFixedItems = [...accumulatedFixedItems, ...newlyFixed];

        // Calculate well-scored aspects
        const wellScored = findWellScoredAspects(critiques);
        accumulatedWellScored = [
          ...new Set([...accumulatedWellScored, ...wellScored]),
        ];

        // Save for next round comparison
        previousRoundCritiques = critiques;

        const avgScore =
          critiques.length > 0
            ? critiques.reduce((sum, c) => sum + c.score, 0) / critiques.length
            : 0;

        const roundData: CritiqueRound = {
          round,
          critiques,
          editorDecision,
          revisionBrief: brief || undefined,
          fixedItems: accumulatedFixedItems,
          wellScoredAspects: accumulatedWellScored,
        };

        // Save full round to Redis
        await getRedis().set(
          `critique_round:${runId}:${round}`,
          JSON.stringify(roundData),
          { ex: ROUND_TTL },
        );

        const summary: RoundSummary = {
          round,
          avgScore,
          highIssueCount: critiques.flatMap((c) => c.issues).filter(
            (i) => i.severity === 'high',
          ).length,
          editorDecision,
          brief,
          fixedItems: accumulatedFixedItems,
          wellScoredAspects: accumulatedWellScored,
        };

        return summary;
      },
    },

    {
      name: 'save_content',
      description:
        'Save approved content from Redis with quality status. Call after editor approves.',
      input_schema: {
        type: 'object',
        properties: {
          quality: {
            type: 'string',
            enum: ['approved', 'max-rounds-reached'],
          },
        },
        required: ['quality'],
      },
      execute: async (input) => {
        const quality = input.quality as 'approved' | 'max-rounds-reached';

        const draft = await getRedis().get<string>(`draft:${runId}`);
        if (!draft) return { error: 'No draft found in Redis' };

        // Save approved content
        const contentData = {
          content: draft,
          quality,
          contentType: recipe.contentType,
          savedAt: new Date().toISOString(),
        };

        await getRedis().set(
          `approved_content:${runId}`,
          JSON.stringify(contentData),
          { ex: DRAFT_TTL },
        );

        return {
          success: true,
          quality,
          contentLength: draft.length,
        };
      },
    },
  ];
}
