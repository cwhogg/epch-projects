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
  recommendation: 'Test First' | 'Test Later' | 'Don\'t Test' | 'Incomplete';
  summary: string;
  risks: string[];
  completedAt: string;
  hasCompetitorAnalysis: boolean;
  hasKeywordAnalysis: boolean;
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
