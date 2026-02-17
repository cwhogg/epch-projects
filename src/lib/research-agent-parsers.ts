import { Analysis, AnalysisScores } from '@/types';

export function parseScores(content: string): AnalysisScores {
  const scores: AnalysisScores = {
    seoOpportunity: null,
    competitiveLandscape: null,
    willingnessToPay: null,
    differentiationPotential: null,
    expertiseAlignment: null,
    overall: null,
  };

  // Match format: | Dimension | X/10 | reasoning |
  // Score appears right after dimension name, followed by pipe
  const patterns = [
    { key: 'seoOpportunity', pattern: /SEO Opportunity\s*\|\s*(\d+)\/10/i },
    { key: 'competitiveLandscape', pattern: /Competitive\s*(?:Landscape)?\s*\|\s*(\d+)\/10/i },
    { key: 'willingnessToPay', pattern: /Willingness\s*(?:to)?\s*Pay\s*\|\s*(\d+)\/10/i },
    { key: 'differentiationPotential', pattern: /Differentiation\s*(?:Potential)?\s*\|\s*(\d+)\/10/i },
    { key: 'expertiseAlignment', pattern: /Expertise\s*(?:Alignment)?\s*\|\s*(\d+)\/10/i },
  ];

  patterns.forEach(({ key, pattern }) => {
    const match = content.match(pattern);
    if (match && match[1]) {
      scores[key as keyof AnalysisScores] = parseInt(match[1]);
    }
  });

  // Calculate overall as weighted average if we have scores
  const weights = {
    seoOpportunity: 0.3,
    competitiveLandscape: 0.2,
    willingnessToPay: 0.25,
    differentiationPotential: 0.2,
    expertiseAlignment: 0.05,
  };

  let totalWeight = 0;
  let weightedSum = 0;

  Object.entries(weights).forEach(([key, weight]) => {
    const score = scores[key as keyof AnalysisScores];
    if (score !== null) {
      weightedSum += score * weight;
      totalWeight += weight;
    }
  });

  if (totalWeight > 0) {
    scores.overall = Math.round(weightedSum / totalWeight);
  }

  return scores;
}

export function parseRecommendation(content: string): Analysis['recommendation'] {
  // Look for explicit recommendation patterns
  const recMatch = content.match(/(?:OVERALL\s+)?RECOMMENDATION[:\s]*(Tier\s*[123]|Incomplete)/i);
  if (recMatch) {
    const rec = recMatch[1];
    if (rec.includes('1')) return 'Tier 1';
    if (rec.includes('2')) return 'Tier 2';
    if (rec.includes('3')) return 'Tier 3';
  }

  // Fallback to simple search
  if (content.includes('Tier 1')) return 'Tier 1';
  if (content.includes('Tier 2')) return 'Tier 2';
  if (content.includes('Tier 3')) return 'Tier 3';
  return 'Incomplete';
}

export function parseConfidence(content: string): Analysis['confidence'] {
  // Look for the formal CONFIDENCE declaration (near RECOMMENDATION)
  // Search for the LAST occurrence to skip any incidental mentions in reasoning
  const allMatches = [...content.matchAll(/CONFIDENCE[:\s]*(High|Medium|Low)/gi)];
  if (allMatches.length > 0) {
    const last = allMatches[allMatches.length - 1];
    const value = last[1].charAt(0).toUpperCase() + last[1].slice(1).toLowerCase();
    if (value === 'High' || value === 'Medium' || value === 'Low') return value;
  }

  // Fallback: look near RECOMMENDATION line
  const nearRec = content.match(/RECOMMENDATION[:\s]*(?:Tier\s*[123]|Incomplete)[\s\S]{0,100}CONFIDENCE[:\s]*(High|Medium|Low)/i);
  if (nearRec) return nearRec[1] as Analysis['confidence'];

  return 'Unknown';
}

export function parseRisks(content: string): string[] {
  const risks: string[] = [];

  // Look for KEY RISKS section
  const riskSection = content.match(/KEY RISKS[:\s]*\n([\s\S]*?)(?=\n(?:NEXT STEPS|##|$))/i);
  if (riskSection) {
    const lines = riskSection[1].split('\n');
    for (const line of lines) {
      // Match bullet points
      const bulletMatch = line.match(/^[-*•]\s*(.+)/);
      if (bulletMatch && bulletMatch[1].trim().length > 10) {
        risks.push(bulletMatch[1].trim());
      }
    }
  }

  // Fallback to old pattern if no risks found
  if (risks.length === 0) {
    const fallbackSection = content.match(/(?:Key )?Risks[:\s]*\n([\s\S]*?)(?=\n(?:Next|##|$))/i);
    if (fallbackSection) {
      const bullets = fallbackSection[1].match(/[-*•]\s*([^\n]+)/g);
      if (bullets) {
        bullets.slice(0, 5).forEach((b) => {
          const cleaned = b.replace(/^[-*•]\s*/, '').trim();
          if (cleaned.length > 10) risks.push(cleaned);
        });
      }
    }
  }

  return risks.slice(0, 5);
}

export function parseSummary(content: string): string {
  // Look for ONE-LINE SUMMARY first (new format)
  const oneLineSummary = content.match(/ONE-LINE SUMMARY[:\s]*([^\n]+)/i);
  if (oneLineSummary && oneLineSummary[1].trim().length > 10) {
    return oneLineSummary[1].trim();
  }

  // Try to find an executive summary or first substantial paragraph
  const summaryMatch = content.match(/(?:Summary|Overview)[:\s]*\n\n?([^\n]+)/i);
  if (summaryMatch && summaryMatch[1].trim().length > 10) {
    return summaryMatch[1].substring(0, 500);
  }

  // Fallback: grab the recommendation line
  const recSection = content.match(/OVERALL RECOMMENDATION[:\s]*([^\n]+)/i);
  if (recSection) return recSection[1].trim();

  return '';
}
