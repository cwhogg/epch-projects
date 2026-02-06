import fs from 'fs';
import path from 'path';
import { ProductIdea, Analysis, AnalysisScores, LeaderboardEntry } from '@/types';
import { formatScoreName } from './utils';

const DATA_DIR = path.join(process.cwd(), 'data');
const IDEAS_FILE = path.join(DATA_DIR, 'ideas.json');

// For local development, experiments are in parent directory.
// For Vercel deployment, copy experiments folder into the project or set EXPERIMENTS_DIR env var.
function getExperimentsDir(): string {
  if (process.env.EXPERIMENTS_DIR) {
    return process.env.EXPERIMENTS_DIR;
  }
  // Check if experiments folder exists in project root first (for Vercel deployment)
  const inProjectDir = path.join(process.cwd(), 'experiments');
  if (fs.existsSync(inProjectDir)) {
    return inProjectDir;
  }
  // Fall back to parent directory (local development)
  return path.join(process.cwd(), '..', 'experiments');
}

const EXPERIMENTS_DIR = getExperimentsDir();

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(IDEAS_FILE)) {
    fs.writeFileSync(IDEAS_FILE, JSON.stringify([], null, 2));
  }
}

// Ideas CRUD
export function getIdeas(): ProductIdea[] {
  ensureDataDir();
  const data = fs.readFileSync(IDEAS_FILE, 'utf-8');
  return JSON.parse(data);
}

export function getIdea(id: string): ProductIdea | null {
  const ideas = getIdeas();
  return ideas.find(i => i.id === id) || null;
}

export function saveIdea(idea: ProductIdea): ProductIdea {
  ensureDataDir();
  const ideas = getIdeas();
  const existingIndex = ideas.findIndex(i => i.id === idea.id);

  if (existingIndex >= 0) {
    ideas[existingIndex] = idea;
  } else {
    ideas.push(idea);
  }

  fs.writeFileSync(IDEAS_FILE, JSON.stringify(ideas, null, 2));
  return idea;
}

export function deleteIdea(id: string): boolean {
  const ideas = getIdeas();
  const filtered = ideas.filter(i => i.id !== id);
  if (filtered.length === ideas.length) return false;
  fs.writeFileSync(IDEAS_FILE, JSON.stringify(filtered, null, 2));
  return true;
}

// Parse analysis from markdown files
export function parseAnalysisFromMarkdown(ideaId: string, content: string): Partial<Analysis> {
  const scores: AnalysisScores = {
    seoOpportunity: null,
    competitiveLandscape: null,
    willingnessToPay: null,
    differentiationPotential: null,
    expertiseAlignment: null,
    overall: null,
  };

  // Parse scores from markdown table - format is: | Dimension | Weight | Score/10 | Reasoning |
  // Need to skip past the weight column (e.g., "50%") to get the actual score
  const scorePatterns = [
    { key: 'seoOpportunity', pattern: /SEO Opportunity[^|]*\|[^|]*\|\s*(\d+)\/10/i },
    { key: 'competitiveLandscape', pattern: /Competitive.*?Landscape[^|]*\|[^|]*\|\s*(\d+)\/10/i },
    { key: 'willingnessToPay', pattern: /Willingness.*?Pay[^|]*\|[^|]*\|\s*(\d+)\/10/i },
    { key: 'differentiationPotential', pattern: /Differentiation[^|]*\|[^|]*\|\s*(\d+)\/10/i },
    { key: 'expertiseAlignment', pattern: /(?:Expertise.*?Alignment|Alignment.*?Expertise)[^|]*\|[^|]*\|\s*(\d+)\/10/i },
  ];

  scorePatterns.forEach(({ key, pattern }) => {
    const match = content.match(pattern);
    if (match && match[1] && !isNaN(parseInt(match[1]))) {
      scores[key as keyof AnalysisScores] = parseInt(match[1]);
    }
  });

  // Parse confidence
  let confidence: 'High' | 'Medium' | 'Low' | 'Unknown' = 'Unknown';
  const confidenceMatch = content.match(/Confidence.*?\|?\s*(High|Medium|Low|Unknown)/i);
  if (confidenceMatch) {
    confidence = confidenceMatch[1] as typeof confidence;
  } else {
    // Check for compound confidence like "Low-Medium"
    const compoundMatch = content.match(/Confidence.*?\|?\s*(Low-Medium|Medium-High)/i);
    if (compoundMatch) {
      confidence = 'Medium'; // Map compound confidences to Medium
    }
  }

  // Parse recommendation - check most specific first
  let recommendation: Analysis['recommendation'] = 'Incomplete';
  if (content.includes('Tier 1')) recommendation = 'Tier 1';
  else if (content.includes('Tier 2')) recommendation = 'Tier 2';
  else if (content.includes('Tier 3')) recommendation = 'Tier 3';

  // Parse summary (first paragraph after Summary heading)
  let summary = '';
  const summaryMatch = content.match(/## Summary\n\n([\s\S]*?)(?=\n##|\n---)/);
  if (summaryMatch) {
    summary = summaryMatch[1].trim().substring(0, 500);
  }

  // Parse risks
  const risks: string[] = [];
  const risksSection = content.match(/## Key Risks\n\n([\s\S]*?)(?=\n##|\n---)/);
  if (risksSection) {
    const riskMatches = risksSection[1].match(/\d+\.\s*\*\*([^*]+)\*\*/g);
    if (riskMatches) {
      riskMatches.forEach(r => {
        const cleaned = r.replace(/\d+\.\s*\*\*/, '').replace(/\*\*/, '').trim();
        if (cleaned) risks.push(cleaned);
      });
    }
  }

  return {
    scores,
    confidence,
    recommendation,
    summary,
    risks,
  };
}

// Get analyses from experiments folder
export function getAnalyses(): Analysis[] {
  const analyses: Analysis[] = [];

  if (!fs.existsSync(EXPERIMENTS_DIR)) {
    return analyses;
  }

  const folders = fs.readdirSync(EXPERIMENTS_DIR).filter(f => {
    const fullPath = path.join(EXPERIMENTS_DIR, f);
    return fs.statSync(fullPath).isDirectory() && f !== 'README.md';
  });

  folders.forEach(folder => {
    const analysisPath = path.join(EXPERIMENTS_DIR, folder, 'analysis.md');
    const competitorsPath = path.join(EXPERIMENTS_DIR, folder, 'competitors.md');
    const keywordsPath = path.join(EXPERIMENTS_DIR, folder, 'keywords.md');

    if (fs.existsSync(analysisPath)) {
      const content = fs.readFileSync(analysisPath, 'utf-8');
      const parsed = parseAnalysisFromMarkdown(folder, content);

      // Get idea name from the analysis file
      const nameMatch = content.match(/# Analysis: (.+)/);
      const ideaName = nameMatch ? nameMatch[1] : folder;

      analyses.push({
        id: folder,
        ideaId: folder,
        ideaName,
        scores: parsed.scores || {
          seoOpportunity: null,
          competitiveLandscape: null,
          willingnessToPay: null,
          differentiationPotential: null,
          expertiseAlignment: null,
          overall: null,
        },
        confidence: parsed.confidence || 'Unknown',
        recommendation: parsed.recommendation || 'Incomplete',
        summary: parsed.summary || '',
        risks: parsed.risks || [],
        completedAt: fs.statSync(analysisPath).mtime.toISOString(),
        hasCompetitorAnalysis: fs.existsSync(competitorsPath),
        hasKeywordAnalysis: fs.existsSync(keywordsPath),
      });
    }
  });

  return analyses;
}

export function getAnalysis(id: string): { analysis: Analysis; content: { main: string; competitors?: string; keywords?: string } } | null {
  const analysisPath = path.join(EXPERIMENTS_DIR, id, 'analysis.md');

  if (!fs.existsSync(analysisPath)) {
    return null;
  }

  const analyses = getAnalyses();
  const analysis = analyses.find(a => a.id === id);

  if (!analysis) return null;

  const content: { main: string; competitors?: string; keywords?: string } = {
    main: fs.readFileSync(analysisPath, 'utf-8'),
  };

  const competitorsPath = path.join(EXPERIMENTS_DIR, id, 'competitors.md');
  const keywordsPath = path.join(EXPERIMENTS_DIR, id, 'keywords.md');

  if (fs.existsSync(competitorsPath)) {
    content.competitors = fs.readFileSync(competitorsPath, 'utf-8');
  }
  if (fs.existsSync(keywordsPath)) {
    content.keywords = fs.readFileSync(keywordsPath, 'utf-8');
  }

  return { analysis, content };
}

// Generate leaderboard
export function getLeaderboard(): LeaderboardEntry[] {
  const analyses = getAnalyses();

  // Sort by recommendation priority, then by available scores
  const sorted = analyses.sort((a, b) => {
    const recPriority: Record<string, number> = { 'Tier 1': 0, 'Tier 2': 1, 'Incomplete': 2, 'Tier 3': 3 };
    const aPriority = recPriority[a.recommendation] ?? 2;
    const bPriority = recPriority[b.recommendation] ?? 2;

    if (aPriority !== bPriority) return aPriority - bPriority;

    // Then by confidence
    const confPriority = { 'High': 0, 'Medium': 1, 'Low': 2, 'Unknown': 3 };
    const aConf = confPriority[a.confidence] ?? 3;
    const bConf = confPriority[b.confidence] ?? 3;

    return aConf - bConf;
  });

  return sorted.map((analysis, index) => {
    // Find top strength (highest non-null score)
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
      topRisk: analysis.risks[0] || 'None identified',
    };
  });
}

