export function getHeaderGradient(recommendation: string): string {
  switch (recommendation) {
    case 'Tier 1': return 'radial-gradient(ellipse at top left, rgba(52, 211, 153, 0.1) 0%, transparent 50%)';
    case 'Tier 2': return 'radial-gradient(ellipse at top left, rgba(251, 191, 36, 0.08) 0%, transparent 50%)';
    case 'Tier 3': return 'radial-gradient(ellipse at top left, rgba(248, 113, 113, 0.08) 0%, transparent 50%)';
    default: return 'none';
  }
}
