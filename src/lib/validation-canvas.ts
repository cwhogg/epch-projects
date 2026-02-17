import {
  getAnalysisFromDb,
  getAnalysisContent,
  getCanvasState,
  saveCanvasState,
  saveAssumption,
  getAssumption,
  getAllAssumptions,
  savePivotSuggestions,
  getPivotSuggestions,
  clearPivotSuggestions,
  appendPivotHistory,
} from '@/lib/db';
import { getAnthropic } from '@/lib/anthropic';
import { CLAUDE_MODEL } from '@/lib/config';
import { parseLLMJson } from '@/lib/llm-utils';
import type {
  AssumptionType,
  Assumption,
  CanvasState,
  PivotSuggestion,
  PivotRecord,
  ValidationCanvasData,
} from '@/types';
import { ASSUMPTION_TYPES } from '@/types';

// Downstream dependency order: when type N pivots, types N+1..4 reset
const DOWNSTREAM: Record<AssumptionType, AssumptionType[]> = {
  demand: ['reachability', 'engagement', 'wtp', 'differentiation'],
  reachability: ['engagement', 'wtp', 'differentiation'],
  engagement: ['wtp', 'differentiation'],
  wtp: ['differentiation'],
  differentiation: [],
};

const LINKED_STAGES: Record<AssumptionType, string> = {
  demand: 'analysis',
  reachability: 'content',
  engagement: 'painted-door',
  wtp: 'analytics',
  differentiation: 'analytics',
};

const DEFAULT_THRESHOLDS: Record<AssumptionType, { validated: string; invalidated: string; windowDays: number }> = {
  demand: {
    validated: '500+ monthly searches for primary keyword cluster AND < 20 direct competitors',
    invalidated: '< 100 monthly searches OR > 50 direct competitors with established authority',
    windowDays: 0,
  },
  reachability: {
    validated: 'Any content piece ranks in top 50 for a target keyword OR 100+ organic sessions/month',
    invalidated: '0 ranking keywords and < 10 organic sessions/month after evaluation window',
    windowDays: 45,
  },
  engagement: {
    validated: '3%+ email signup conversion rate from organic visitors OR 2+ min avg time on site',
    invalidated: '< 0.5% signup rate AND < 30s avg time on site after evaluation window',
    windowDays: 30,
  },
  wtp: {
    validated: '1%+ click-through to pricing/purchase page from engaged visitors',
    invalidated: '0 pricing page visits after 100+ engaged sessions',
    windowDays: 60,
  },
  differentiation: {
    validated: 'Sustained or growing organic traffic over 3 consecutive analytics periods',
    invalidated: 'Declining traffic over 3 consecutive periods OR new direct competitor capturing > 50% of target keywords',
    windowDays: 90,
  },
};

/**
 * Generate initial assumptions for an idea from its analysis data.
 * Creates the canvas state and all five assumptions with concrete statements.
 */
export async function generateAssumptions(ideaId: string): Promise<ValidationCanvasData | null> {
  const analysis = await getAnalysisFromDb(ideaId);
  if (!analysis) return null;

  const content = await getAnalysisContent(ideaId);

  // Build context for LLM to generate concrete assumption statements
  let context = `Business: ${analysis.ideaName}\n`;
  context += `Summary: ${analysis.summary}\n`;

  if (content?.seoData) {
    try {
      const seo = JSON.parse(content.seoData);
      const keywords = seo.synthesis?.comparison?.agreedKeywords ?? [];
      if (keywords.length > 0) {
        context += `Top keywords: ${keywords.slice(0, 5).map((k: { keyword: string; volume?: number }) => `${k.keyword} (${k.volume ?? '?'} searches/mo)`).join(', ')}\n`;
      }
      const competitors = seo.synthesis?.serpValidated?.length ?? 0;
      context += `SERP-validated gaps: ${competitors}\n`;
    } catch { /* ignore parse errors */ }
  }

  if (content?.competitors) {
    context += `Competitors: ${content.competitors.slice(0, 500)}\n`;
  }

  // Ask Claude to generate concrete, testable assumption statements
  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: 'You generate concrete, testable business assumptions. Output valid JSON only, no markdown.',
    messages: [{
      role: 'user',
      content: `Given this business context, generate concrete testable statements for each of these five assumption types. Each statement should be specific and measurable — not generic.

Context:
${context}

Output a JSON object with these keys: demand, reachability, engagement, wtp, differentiation.
Each value should be an object with:
- statement: a concrete, testable claim (e.g., "1,200+ monthly searches for 'chronic illness second opinion'" not "people search for this")
- evidence: array of supporting data points from the context above (can be empty if no data yet)

Example:
{
  "demand": { "statement": "1,200+ monthly searches for target keyword cluster with < 15 direct competitors", "evidence": ["keyword data shows 1,200 monthly searches"] },
  "reachability": { "statement": "SEO content targeting diagnostic journey keywords can rank in top 50 within 45 days", "evidence": [] },
  ...
}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const generated = parseLLMJson<Record<string, { statement: string; evidence: string[] }>>(text);

  // Create canvas state
  const canvasState: CanvasState = { status: 'active' };
  await saveCanvasState(ideaId, canvasState);

  // Create assumptions
  const assumptions: Record<string, Assumption> = {};
  for (const type of ASSUMPTION_TYPES) {
    const gen = generated[type];
    const assumption: Assumption = {
      type,
      status: 'untested',
      statement: gen?.statement ?? `[No statement generated for ${type}]`,
      evidence: gen?.evidence ?? [],
      threshold: DEFAULT_THRESHOLDS[type],
      linkedStage: LINKED_STAGES[type],
    };
    await saveAssumption(ideaId, assumption);
    assumptions[type] = assumption;
  }

  return {
    canvas: canvasState,
    assumptions: assumptions as Record<AssumptionType, Assumption>,
    pivotSuggestions: {},
    pivotHistory: {},
  };
}

/**
 * Evaluate all Testing assumptions against their thresholds.
 * Called after analytics cron runs. Only processes assumptions with status 'testing'.
 *
 * NOTE: Threshold-based auto-evaluation is deferred to a follow-up plan.
 * This implementation provides the hook point and guard logic. The curator
 * changes statuses manually via the API until auto-evaluation is implemented.
 * See Decision Log entry 6 for rationale.
 */
export async function evaluateAssumptions(ideaId: string): Promise<void> {
  const canvasState = await getCanvasState(ideaId);
  if (!canvasState || canvasState.status === 'killed') return;

  const assumptions = await getAllAssumptions(ideaId);
  const testingAssumptions = Object.values(assumptions).filter(a => a.status === 'testing');

  if (testingAssumptions.length === 0) return;

  // TODO: Auto-evaluate testing assumptions against analytics data.
  // Design doc specifies checking thresholds (e.g., 500+ searches for demand,
  // top-50 rankings for reachability) and auto-transitioning to validated/invalidated.
  // Requires integration with GSC analytics data and research agent output.
  // Deferred to a follow-up plan — see Decision Log entry 6.
}

/**
 * Generate 2-3 pivot suggestions when an assumption is invalidated.
 * Uses Claude to analyze the failure and suggest alternatives.
 */
export async function generatePivotSuggestions(
  ideaId: string,
  type: AssumptionType,
): Promise<PivotSuggestion[]> {
  const assumption = await getAssumption(ideaId, type);
  if (!assumption) return [];

  const content = await getAnalysisContent(ideaId);

  let context = `The "${type}" assumption was invalidated.\n`;
  context += `Statement: ${assumption.statement}\n`;
  context += `Evidence: ${assumption.evidence.join(', ') || 'none'}\n`;

  if (content?.seoData) {
    context += `SEO Data: ${content.seoData.slice(0, 1000)}\n`;
  }
  if (content?.competitors) {
    context += `Competitors: ${content.competitors.slice(0, 500)}\n`;
  }

  try {
    const response = await getAnthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: 'You are a business pivot advisor. Generate concrete, actionable pivot suggestions. Output valid JSON only.',
      messages: [{
        role: 'user',
        content: `This business assumption was invalidated:

Type: ${type}
Statement: ${assumption.statement}
Evidence that invalidated it: ${assumption.evidence.join(', ') || 'Insufficient data'}

Context:
${context}

Generate 2-3 pivot suggestions. Each should be a concrete reframing — not just "try harder."

Output a JSON array of objects, each with:
- statement: the new concrete assumption to test
- evidence: supporting data for this pivot direction (array of strings)
- impact: what existing work survives vs. needs rebuilding (1-2 sentences)
- experiment: what to run next to test this pivoted assumption (1 sentence)

Example:
[
  {
    "statement": "Shift from 'rare disease second opinion' to 'chronic illness symptom tracker' — 4x search volume, fewer competitors",
    "evidence": ["4,800 monthly searches for 'symptom tracker'", "Only 3 direct competitors vs 15 in original niche"],
    "impact": "Existing blog content salvageable with angle adjustment. Painted door site needs full rebuild.",
    "experiment": "Publish 3 symptom-tracker focused articles and measure organic traffic after 30 days"
  }
]`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const suggestions = parseLLMJson<PivotSuggestion[]>(text);

    if (Array.isArray(suggestions) && suggestions.length > 0) {
      await savePivotSuggestions(ideaId, type, suggestions);
      return suggestions;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Apply a pivot suggestion: update the assumption, clear suggestions,
 * record history, and reset downstream assumptions.
 */
export async function applyPivot(
  ideaId: string,
  type: AssumptionType,
  suggestionIndex: number,
): Promise<void> {
  const assumption = await getAssumption(ideaId, type);
  if (!assumption) throw new Error(`No assumption found for ${type}`);

  const suggestions = await getPivotSuggestions(ideaId, type);
  if (suggestionIndex < 0 || suggestionIndex >= suggestions.length) {
    throw new Error(`Invalid suggestion index: ${suggestionIndex}. Available: ${suggestions.length}`);
  }

  const chosen = suggestions[suggestionIndex];

  // Record the pivot in history
  const record: PivotRecord = {
    fromStatement: assumption.statement,
    toStatement: chosen.statement,
    reason: chosen.impact,
    suggestedBy: 'system',
    approvedBy: 'curator',
    timestamp: Date.now(),
    alternatives: suggestions.filter((_, i) => i !== suggestionIndex),
  };
  await appendPivotHistory(ideaId, type, record);

  // Update the assumption with the new statement
  const updated: Assumption = {
    ...assumption,
    status: 'untested',
    statement: chosen.statement,
    evidence: chosen.evidence,
    invalidatedAt: undefined,
  };
  await saveAssumption(ideaId, updated);

  // Clear the suggestions
  await clearPivotSuggestions(ideaId, type);

  // Reset downstream assumptions to untested
  const downstream = DOWNSTREAM[type];
  for (const downType of downstream) {
    const downAssumption = await getAssumption(ideaId, downType);
    if (downAssumption && downAssumption.status !== 'untested') {
      await saveAssumption(ideaId, {
        ...downAssumption,
        status: 'untested',
        validatedAt: undefined,
        invalidatedAt: undefined,
      });
    }
  }

  // Trigger strategy doc regeneration for Demand or Differentiation pivots.
  // These change the fundamental audience/positioning, so the strategy doc
  // (and its downstream dependents) need to be regenerated.
  if (type === 'demand' || type === 'differentiation') {
    const { deleteFoundationDoc } = await import('@/lib/db');
    // Delete strategy doc — it will be regenerated on next Foundation tab visit.
    // Downstream docs (positioning, brand-voice, etc.) remain but may be stale;
    // the Foundation tab shows them as needing regeneration when strategy changes.
    await deleteFoundationDoc(ideaId, 'strategy').catch(() => {});
  }
}
