import { Redis } from '@upstash/redis';
import type { ToolDefinition, AgentPlanStep, Evaluation } from '@/types';

// ---------------------------------------------------------------------------
// Redis (shared lazy singleton)
// ---------------------------------------------------------------------------

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error('Redis not configured');
    redis = new Redis({ url, token });
  }
  return redis;
}

// ---------------------------------------------------------------------------
// Plan tools — let the agent create and update its own execution plan
// ---------------------------------------------------------------------------

// In-memory plan store keyed by runId (also persisted via agent state)
const planStore = new Map<string, AgentPlanStep[]>();

export function getPlan(runId: string): AgentPlanStep[] {
  return planStore.get(runId) || [];
}

export function createPlanTools(runId: string): ToolDefinition[] {
  return [
    {
      name: 'create_plan',
      description:
        'Create a step-by-step plan before starting work. Each step has a description and rationale. Call this at the beginning of your task.',
      input_schema: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                rationale: { type: 'string' },
              },
              required: ['description', 'rationale'],
            },
          },
        },
        required: ['steps'],
      },
      execute: async (input) => {
        const steps = (input.steps as Array<{ description: string; rationale: string }>).map(
          (s) => ({
            description: s.description,
            rationale: s.rationale,
            status: 'pending' as const,
          }),
        );
        planStore.set(runId, steps);
        return { success: true, stepCount: steps.length };
      },
    },
    {
      name: 'update_plan',
      description:
        'Mark a plan step as complete, in_progress, or skipped. Optionally add new steps discovered during execution.',
      input_schema: {
        type: 'object',
        properties: {
          stepIndex: {
            type: 'number',
            description: 'The 0-based index of the step to update',
          },
          status: {
            type: 'string',
            enum: ['in_progress', 'complete', 'skipped'],
          },
          newSteps: {
            type: 'array',
            description: 'Optional new steps to insert after the updated step',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                rationale: { type: 'string' },
              },
              required: ['description', 'rationale'],
            },
          },
        },
        required: ['stepIndex', 'status'],
      },
      execute: async (input) => {
        const plan = planStore.get(runId) || [];
        const idx = input.stepIndex as number;
        const status = input.status as AgentPlanStep['status'];

        if (idx < 0 || idx >= plan.length) {
          return { error: `Step index ${idx} out of range (0-${plan.length - 1})` };
        }

        plan[idx].status = status;

        const newSteps = input.newSteps as Array<{ description: string; rationale: string }> | undefined;
        if (newSteps && newSteps.length > 0) {
          const stepsToInsert = newSteps.map((s) => ({
            description: s.description,
            rationale: s.rationale,
            status: 'pending' as const,
          }));
          plan.splice(idx + 1, 0, ...stepsToInsert);
        }

        planStore.set(runId, plan);
        return { success: true, plan };
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Scratchpad tools — shared key-value store per idea for inter-agent comms
// ---------------------------------------------------------------------------

export function createScratchpadTools(): ToolDefinition[] {
  return [
    {
      name: 'read_scratchpad',
      description:
        'Read a value from the shared scratchpad for this idea. Other agents can write here too.',
      input_schema: {
        type: 'object',
        properties: {
          ideaId: { type: 'string' },
          key: { type: 'string' },
        },
        required: ['ideaId', 'key'],
      },
      execute: async (input) => {
        const value = await getRedis().hget(
          `scratchpad:${input.ideaId}`,
          input.key as string,
        );
        return { key: input.key, value: value ?? null };
      },
    },
    {
      name: 'write_scratchpad',
      description:
        'Write a value to the shared scratchpad for this idea. Other agents can read it later.',
      input_schema: {
        type: 'object',
        properties: {
          ideaId: { type: 'string' },
          key: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['ideaId', 'key', 'value'],
      },
      execute: async (input) => {
        await getRedis().hset(
          `scratchpad:${input.ideaId}`,
          { [input.key as string]: input.value as string },
        );
        return { success: true };
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Evaluation helpers — deterministic checks agents can use
// ---------------------------------------------------------------------------

export function checkKeywordPresence(text: string, keywords: string[]): Evaluation {
  const lower = text.toLowerCase();
  const found: string[] = [];
  const missing: string[] = [];

  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      found.push(kw);
    } else {
      missing.push(kw);
    }
  }

  const ratio = keywords.length > 0 ? found.length / keywords.length : 1;
  return {
    pass: ratio >= 0.6,
    score: Math.round(ratio * 10),
    issues: missing.map((kw) => `Missing keyword: "${kw}"`),
    suggestions: missing.map((kw) => `Incorporate "${kw}" naturally into the text`),
  };
}

export function checkHeadingHierarchy(html: string): Evaluation {
  const issues: string[] = [];
  const suggestions: string[] = [];

  const h1Matches = html.match(/<h1[\s>]/gi) || [];
  if (h1Matches.length === 0) {
    issues.push('No H1 tag found');
    suggestions.push('Add exactly one H1 containing the primary keyword');
  } else if (h1Matches.length > 1) {
    issues.push(`Found ${h1Matches.length} H1 tags — should be exactly 1`);
    suggestions.push('Convert extra H1 tags to H2');
  }

  // Check that H2 exists
  const h2Matches = html.match(/<h2[\s>]/gi) || [];
  if (h2Matches.length === 0) {
    issues.push('No H2 tags found');
    suggestions.push('Add H2 headings for major sections');
  }

  const score = Math.max(0, 10 - issues.length * 3);
  return { pass: issues.length === 0, score, issues, suggestions };
}

export function checkWordCount(text: string, min: number, max?: number): Evaluation {
  const words = text.split(/\s+/).filter((w) => w.length > 0).length;
  const issues: string[] = [];
  const suggestions: string[] = [];

  if (words < min) {
    issues.push(`Word count ${words} is below minimum ${min}`);
    suggestions.push(`Expand content to at least ${min} words`);
  }
  if (max && words > max) {
    issues.push(`Word count ${words} exceeds maximum ${max}`);
    suggestions.push(`Trim content to under ${max} words`);
  }

  const score = words >= min ? 10 : Math.round((words / min) * 10);
  return { pass: issues.length === 0, score, issues, suggestions };
}

export function checkMetaDescription(description: string, primaryKeyword: string): Evaluation {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const len = description.length;

  if (len < 140) {
    issues.push(`Meta description too short (${len} chars, need 140+)`);
    suggestions.push('Expand to 150-160 characters');
  }
  if (len > 165) {
    issues.push(`Meta description too long (${len} chars, max 160)`);
    suggestions.push('Trim to 150-160 characters');
  }
  if (!description.toLowerCase().includes(primaryKeyword.toLowerCase())) {
    issues.push(`Primary keyword "${primaryKeyword}" not found in meta description`);
    suggestions.push(`Include "${primaryKeyword}" naturally`);
  }

  const score = Math.max(0, 10 - issues.length * 3);
  return { pass: issues.length === 0, score, issues, suggestions };
}

/**
 * Combine multiple evaluations into a single overall evaluation.
 */
export function combineEvaluations(evals: Evaluation[]): Evaluation {
  const allIssues = evals.flatMap((e) => e.issues);
  const allSuggestions = evals.flatMap((e) => e.suggestions);
  const avgScore = evals.length > 0
    ? Math.round(evals.reduce((sum, e) => sum + e.score, 0) / evals.length)
    : 10;

  return {
    pass: evals.every((e) => e.pass),
    score: avgScore,
    issues: allIssues,
    suggestions: allSuggestions,
  };
}
