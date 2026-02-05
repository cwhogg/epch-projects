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

export type ContentType = 'blog-post' | 'comparison' | 'faq';

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
  status: 'pending' | 'generating' | 'complete' | 'error' | 'rejected';
  rejectionReason?: string;
  markdown?: string;
  wordCount?: number;
  generatedAt?: string;
}

export interface RejectedPiece {
  id: string;
  ideaId: string;
  title: string;
  slug: string;
  type: ContentType;
  targetKeywords: string[];
  rationale: string;
  rejectionReason?: string;
  rejectedAt: string;
}

export interface ContentCalendar {
  ideaId: string;
  ideaName: string;
  targetId?: string; // 'secondlook' | 'study-platform', defaults to 'secondlook'
  active?: boolean; // defaults to true; set false to pause publishing
  strategySummary: string;
  pieces: ContentPiece[];
  rejectedPieces?: RejectedPiece[];
  nextPieceIndex?: number;
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

// Google Search Console Types

export interface GSCPropertyLink {
  ideaId: string;
  siteUrl: string;
  linkedAt: string;
  lastFetchedAt?: string;
}

export interface GSCQueryRow {
  query: string;
  page?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCDateRow {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCAnalyticsData {
  ideaId: string;
  siteUrl: string;
  fetchedAt: string;
  timeSeries: GSCDateRow[];
  queryData: GSCQueryRow[];
  pageData: GSCQueryRow[];
  startDate: string;
  endDate: string;
}

export interface KeywordComparison {
  keyword: string;
  predicted: {
    intentType?: string;
    estimatedVolume?: string;
    estimatedCompetitiveness?: string;
  } | null;
  actual: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  } | null;
}

export interface GSCAnalyticsSummary {
  totalClicks: number;
  totalImpressions: number;
  averageCtr: number;
  averagePosition: number;
  topQuery: string | null;
  predictedKeywordsWithTraffic: number;
  totalPredictedKeywords: number;
  unpredictedQueries: GSCQueryRow[];
}

// Painted Door (Website Agent) Types

export interface BrandIdentity {
  siteName: string;
  tagline: string;
  seoDescription: string;
  targetDemographic: string;
  voice: { tone: string; personality: string; examples: string[] };
  colors: {
    primary: string;
    primaryLight: string;
    background: string;
    backgroundElevated: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    border: string;
  };
  typography: { headingFont: string; bodyFont: string; monoFont: string };
  landingPage: {
    heroHeadline: string;
    heroSubheadline: string;
    ctaText: string;
    valueProps: { title: string; description: string }[];
    socialProofApproach: string;
    faqs: { question: string; answer: string }[];
  };
}

export interface PaintedDoorSite {
  id: string;
  ideaId: string;
  ideaName: string;
  brand: BrandIdentity;
  repoOwner: string;
  repoName: string;
  repoUrl: string;
  siteUrl: string;
  vercelProjectId: string;
  status: 'generating' | 'pushing' | 'deploying' | 'live' | 'failed';
  error?: string;
  createdAt: string;
  deployedAt?: string;
  signupCount: number;
}

export interface PaintedDoorProgress {
  ideaId: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  currentStep: string;
  steps: {
    name: string;
    status: 'pending' | 'running' | 'complete' | 'error';
    detail?: string;
  }[];
  error?: string;
  result?: PaintedDoorSite;
}

// Analytics Agent Types

export interface PieceSnapshot {
  ideaId: string;
  pieceId: string;
  slug: string;
  title: string;
  type: ContentType;
  weekId: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: { query: string; clicks: number; impressions: number; position: number }[];
}

export type AlertSeverity = 'positive' | 'warning' | 'info';

export interface PerformanceAlert {
  pieceSlug: string;
  pieceTitle: string;
  severity: AlertSeverity;
  message: string;
  metric: string;
  previousValue: number;
  currentValue: number;
}

export interface WeeklyReport {
  weekId: string;
  generatedAt: string;
  siteUrl: string;
  siteSummary: {
    totalClicks: number;
    totalImpressions: number;
    averagePosition: number;
    averageCtr: number;
    clicksChange: number | null;
    impressionsChange: number | null;
  };
  pieces: Array<{
    ideaId: string;
    pieceId: string;
    slug: string;
    title: string;
    type: ContentType;
    current: PieceSnapshot;
    previous: PieceSnapshot | null;
    clicksChange: number | null;
    impressionsChange: number | null;
    positionChange: number | null;
  }>;
  unmatchedPages: GSCQueryRow[];
  alerts: PerformanceAlert[];
}

// Agent Runtime Types

export type AgentStatus = 'running' | 'paused' | 'complete' | 'error';

export interface AgentPlanStep {
  description: string;
  rationale: string;
  status: 'pending' | 'in_progress' | 'complete' | 'skipped';
}

export interface AgentState {
  runId: string;
  agentId: string;
  messages: AgentMessage[];
  turnCount: number;
  status: AgentStatus;
  plan: AgentPlanStep[];
  lastToolCall?: string;
  finalOutput?: string;
  error?: string;
  startedAt: string;
  resumeCount: number;
}

/** Anthropic message format — subset we need for serialization */
export type AgentMessage =
  | { role: 'user'; content: string | AgentContentBlock[] }
  | { role: 'assistant'; content: AgentContentBlock[] };

export type AgentContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

export interface AgentConfig {
  agentId: string;
  runId: string;
  model: string;
  maxTokens: number;
  maxTurns: number;
  tools: ToolDefinition[];
  systemPrompt: string;
  onProgress: (step: string, detail?: string) => Promise<void>;
}

export interface Evaluation {
  pass: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
}

export type AgentEventType =
  | 'analysis_complete'
  | 'content_generated'
  | 'site_deployed'
  | 'analytics_ready';

export interface AgentEvent {
  type: AgentEventType;
  agentId: string;
  ideaId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}
