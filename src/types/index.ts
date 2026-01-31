export interface ProductIdea {
  id: string;
  name: string;
  description: string;
  targetUser: string;
  problemSolved: string;
  url?: string;
  githubRepo?: string;
  documentContent?: string;
  createdAt: string;
  status: 'pending' | 'analyzing' | 'complete';
}

export interface AnalysisScores {
  seoOpportunity: number | null;
  competitiveLandscape: number | null;
  willingnessToPay: number | null;
  differentiationPotential: number | null;
  expertiseAlignment: number | null;
  overall: number | null;
}

export interface Analysis {
  id: string;
  ideaId: string;
  ideaName: string;
  scores: AnalysisScores;
  confidence: 'High' | 'Medium' | 'Low' | 'Unknown';
  recommendation: 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Incomplete';
  summary: string;
  risks: string[];
  completedAt: string;
  hasCompetitorAnalysis: boolean;
  hasKeywordAnalysis: boolean;
  hasContentGenerated?: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  ideaName: string;
  ideaId: string;
  overallScore: number | null;
  confidence: string;
  recommendation: string;
  topStrength: string;
  topRisk: string;
}

// Content Agent Types

export type ContentType = 'blog-post' | 'landing-page' | 'comparison' | 'faq';

export interface ContentPiece {
  id: string;
  ideaId: string;
  type: ContentType;
  title: string;
  slug: string;
  targetKeywords: string[];
  contentGap?: string;
  priority: number;
  rationale: string;
  status: 'pending' | 'generating' | 'complete' | 'error';
  markdown?: string;
  wordCount?: number;
  generatedAt?: string;
}

export interface ContentCalendar {
  ideaId: string;
  ideaName: string;
  strategySummary: string;
  pieces: ContentPiece[];
  createdAt: string;
}

export interface ContentProgress {
  ideaId: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  currentStep: string;
  steps: { name: string; status: 'pending' | 'running' | 'complete' | 'error'; detail?: string }[];
  error?: string;
  completedPieceIds: string[];
}
