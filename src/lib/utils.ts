import { Analysis, LeaderboardEntry } from '@/types';

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Core 1-to-1 fuzzy comparison: normalize, check containment, 60% word overlap.
 */
export function fuzzyMatchPair(a: string, b: string): boolean {
  const normalizedA = a.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const normalizedB = b.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (normalizedA === normalizedB) return true;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return true;
  const words1 = new Set(normalizedA.split(/\s+/));
  const words2 = new Set(normalizedB.split(/\s+/));
  const intersection = [...words1].filter((w) => words2.has(w));
  const minSize = Math.min(words1.size, words2.size);
  return minSize > 0 && intersection.length / minSize >= 0.6;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatScoreName(key: string): string {
  const names: Record<string, string> = {
    seoOpportunity: 'SEO',
    competitiveLandscape: 'Competition',
    willingnessToPay: 'WTP',
    differentiationPotential: 'Differentiation',
    expertiseAlignment: 'Expertise',
  };
  return names[key] || key;
}

export function buildLeaderboard(analyses: Analysis[]): LeaderboardEntry[] {
  const sorted = [...analyses].sort((a, b) => {
    const recPriority: Record<string, number> = { 'Tier 1': 0, 'Tier 2': 1, 'Incomplete': 2, 'Tier 3': 3 };
    const aPriority = recPriority[a.recommendation] ?? 2;
    const bPriority = recPriority[b.recommendation] ?? 2;
    if (aPriority !== bPriority) return aPriority - bPriority;
    const confPriority: Record<string, number> = { 'High': 0, 'Medium': 1, 'Low': 2, 'Unknown': 3 };
    return (confPriority[a.confidence] ?? 3) - (confPriority[b.confidence] ?? 3);
  });

  return sorted.map((analysis, index) => {
    const scoreEntries = Object.entries(analysis.scores)
      .filter(([key, val]) => val !== null && key !== 'overall')
      .sort((a, b) => (b[1] as number) - (a[1] as number));

    const topStrength = scoreEntries[0]
      ? `${formatScoreName(scoreEntries[0][0])}: ${scoreEntries[0][1]}/10`
      : 'No scores yet';

    return {
      rank: index + 1,
      ideaName: analysis.ideaName,
      ideaId: analysis.id,
      overallScore: analysis.scores.overall,
      confidence: analysis.confidence,
      recommendation: analysis.recommendation,
      topStrength,
      topRisk: analysis.risks?.[0] || 'None identified',
    };
  });
}
