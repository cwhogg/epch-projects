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
