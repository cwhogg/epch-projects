import type { AdvisorCritique, CritiqueIssue } from '@/types';
import { getAnthropic } from '@/lib/anthropic';
import { CLAUDE_MODEL } from '@/lib/config';
import { getFoundationDoc } from '@/lib/db';
import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';
import { recipes, type ContentRecipe } from '@/lib/content-recipes';
import { advisorRegistry, type AdvisorEntry } from '@/lib/advisors/registry';
import { applyEditorRubric } from '@/lib/editor-decision';
import pLimit from 'p-limit';

export interface CritiqueResult {
  advisorId: string;
  advisorName: string;
  score: number;
  pass: boolean;
  issues: { severity: string; description: string }[];
  strengths: string[];
  error?: string;
}

export interface CritiqueRoundResult {
  critiques: CritiqueResult[];
  avgScore: number;
  decision: 'approve' | 'revise';
  brief: string;
}

// Tool schema for structured critique output — passed to each critic call
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
            severity: { type: 'string' as const, enum: ['high', 'medium', 'low'] },
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
 * Stateless — no closure state needed.
 */
export async function runSingleCritic(
  advisor: AdvisorEntry,
  draft: string,
  recipe: ContentRecipe,
  ideaId: string,
): Promise<AdvisorCritique> {
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
    userPrompt += `EMPHASIS FOR THIS CONTENT TYPE:\n${recipe.evaluationEmphasis}\n\n`;
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
 * Run a full critique round: resolve critics from recipe, run them in parallel,
 * apply editor rubric, and return structured results.
 */
export async function runCritiqueRound(
  draft: string,
  recipeKey: string,
  ideaId: string,
  previousAvgScore?: number,
): Promise<CritiqueRoundResult> {
  const recipe = recipes[recipeKey as keyof typeof recipes];
  if (!recipe) {
    throw new Error(`Recipe not found: "${recipeKey}"`);
  }

  // Resolve named critics from registry
  const critics: AdvisorEntry[] = [];
  for (const id of recipe.namedCritics ?? []) {
    const entry = advisorRegistry.find((a) => a.id === id);
    if (entry) {
      critics.push(entry);
    }
  }

  if (critics.length === 0) {
    return {
      critiques: [],
      avgScore: 0,
      decision: 'approve',
      brief: 'No critics configured for this recipe.',
    };
  }

  // Run critic calls with p-limit(2) concurrency
  const limit = pLimit(2);
  const results = await Promise.allSettled(
    critics.map((advisor) =>
      limit(() => runSingleCritic(advisor, draft, recipe, ideaId)),
    ),
  );

  const critiques: CritiqueResult[] = results.map((result, idx) => {
    const advisor = critics[idx];
    if (result.status === 'fulfilled') {
      const c = result.value;
      return {
        advisorId: c.advisorId,
        advisorName: c.name,
        score: c.score,
        pass: c.pass,
        issues: c.issues.map((i) => ({ severity: i.severity, description: i.description })),
        strengths: [],
        error: c.error,
      };
    }
    return {
      advisorId: advisor.id,
      advisorName: advisor.name,
      score: 0,
      pass: false,
      issues: [],
      strengths: [],
      error: result.reason instanceof Error ? result.reason.message : 'Critic call failed',
    };
  });

  // Convert to AdvisorCritique format for editor rubric
  const advisorCritiques: AdvisorCritique[] = critiques.map((c) => ({
    advisorId: c.advisorId,
    name: c.advisorName,
    score: c.score,
    pass: c.pass,
    issues: c.issues.map((i) => ({ severity: i.severity, description: i.description, suggestion: '' })),
    error: c.error,
  }));

  const editorResult = applyEditorRubric(
    advisorCritiques,
    recipe.minAggregateScore,
    previousAvgScore,
  );

  return {
    critiques,
    avgScore: editorResult.avgScore,
    decision: editorResult.decision,
    brief: editorResult.brief,
  };
}
