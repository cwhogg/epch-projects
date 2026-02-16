import type { AdvisorCritique } from '@/types';

export interface EditorDecisionResult {
  decision: 'approve' | 'revise';
  brief: string;
  avgScore: number;
  highIssueCount: number;
}

/**
 * Mechanical editor rubric. No LLM judgment — pure rules.
 *
 * - ANY high-severity issue → revise
 * - NO high-severity AND avg score >= threshold → approve
 * - NO high-severity BUT avg < threshold → revise (safety valve)
 * - Scores decreasing from previous round → approve (oscillation guard)
 * - Empty critiques → approve (nothing to gate on)
 */
export function applyEditorRubric(
  critiques: AdvisorCritique[],
  minAggregateScore: number,
  previousAvgScore?: number,
): EditorDecisionResult {
  if (critiques.length === 0) {
    return { decision: 'approve', brief: '', avgScore: 0, highIssueCount: 0 };
  }

  const avgScore =
    critiques.reduce((sum, c) => sum + c.score, 0) / critiques.length;

  const allIssues = critiques.flatMap((c) =>
    c.issues.map((issue) => ({
      ...issue,
      advisorId: c.advisorId,
      advisorName: c.name,
    })),
  );

  const highIssues = allIssues.filter((i) => i.severity === 'high');
  const mediumIssues = allIssues.filter((i) => i.severity === 'medium');
  const highIssueCount = highIssues.length;

  // Build brief from high + medium issues
  const briefLines: string[] = [];
  for (const issue of [...highIssues, ...mediumIssues]) {
    briefLines.push(
      `[${issue.severity.toUpperCase()}] (${issue.advisorName}) ${issue.description}`,
    );
  }
  const brief = briefLines.join('\n');

  // Rule 1: Any high-severity → revise
  if (highIssueCount > 0) {
    return { decision: 'revise', brief, avgScore, highIssueCount };
  }

  // Rule 2: Scores decreasing (oscillation) → approve
  if (previousAvgScore !== undefined && avgScore < previousAvgScore) {
    return { decision: 'approve', brief, avgScore, highIssueCount };
  }

  // Rule 3: Avg >= threshold → approve
  if (avgScore >= minAggregateScore) {
    return { decision: 'approve', brief, avgScore, highIssueCount };
  }

  // Rule 4: Avg < threshold → revise (safety valve)
  return { decision: 'revise', brief, avgScore, highIssueCount };
}
