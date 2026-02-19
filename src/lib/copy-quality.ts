export interface CopyQualityFlag {
  category: string;
  match: string;
  index: number;
}

const BLOCKLIST: { category: string; patterns: RegExp[] }[] = [
  {
    category: 'filler-opener',
    patterns: [
      /\bGreat question[!.]?/gi,
      /\bThat's a great point/gi,
      /\bAbsolutely[!.]/gi,
      /\bI'd be happy to\b/gi,
    ],
  },
  {
    category: 'vague-intensifier',
    patterns: [
      /\bincredibly\b/gi,
      /\bextremely\b/gi,
      /\btruly\b/gi,
      /\bremarkably\b/gi,
      /\bfundamentally\b/gi,
    ],
  },
  {
    category: 'business-jargon',
    patterns: [
      /\bleverage\b/gi,
      /\boptimize\b/gi,
      /\bempower\b/gi,
      /\brevolutionize\b/gi,
      /\bcutting[- ]edge\b/gi,
      /\bgame[- ]changing\b/gi,
      /\bnext[- ]level\b/gi,
      /\bbest[- ]in[- ]class\b/gi,
      /\bworld[- ]class\b/gi,
      /\bstate[- ]of[- ]the[- ]art\b/gi,
    ],
  },
  {
    category: 'padded-transition',
    patterns: [
      /\bIt's worth noting that\b/gi,
      /\bIt's important to understand\b/gi,
      /\bAt the end of the day\b/gi,
      /\bIn today's fast-paced world\b/gi,
      /\bWhen it comes to\b/gi,
    ],
  },
  {
    category: 'sycophantic-praise',
    patterns: [
      /\bExcellent choice[!.]?/gi,
      /\bLove that idea[!.]?/gi,
      /\bWhat a great approach[!.]?/gi,
    ],
  },
  {
    category: 'generic-closer',
    patterns: [
      /\bLet me know if you have any questions\b/gi,
      /\bHope this helps[!.]?/gi,
      /\bFeel free to reach out\b/gi,
    ],
  },
  {
    category: 'fake-specificity',
    patterns: [
      /\bStudies show\b/gi,
      /\bResearch suggests\b/gi,
      /\bExperts agree\b/gi,
    ],
  },
  {
    category: 'em-dash',
    patterns: [
      /\s—\s/g,   // Unicode em dash with surrounding spaces
      /\s--\s/g,  // Double hyphen used as em dash (with spaces)
    ],
  },
];

export function validateCopyQuality(text: string): CopyQualityFlag[] {
  if (!text) return [];

  const flags: CopyQualityFlag[] = [];

  for (const { category, patterns } of BLOCKLIST) {
    for (const pattern of patterns) {
      // Reset lastIndex for global regexes
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        flags.push({
          category,
          match: match[0],
          index: match.index,
        });
      }
    }
  }

  return flags;
}
