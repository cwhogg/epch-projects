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
  seoDescription?: string;
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
  landingPage?: {
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

// Foundation Document Types

export type FoundationDocType =
  | 'strategy'
  | 'positioning'
  | 'brand-voice'
  | 'design-principles'
  | 'seo-strategy'
  | 'social-media-strategy';

export const FOUNDATION_DOC_TYPES: FoundationDocType[] = [
  'strategy',
  'positioning',
  'brand-voice',
  'design-principles',
  'seo-strategy',
  'social-media-strategy',
];

export interface FoundationDocument {
  id: string;                     // same as type, e.g. 'strategy'
  ideaId: string;
  type: FoundationDocType;
  content: string;                // plain text, optimized for LLM consumption
  advisorId: string;              // which advisor created/last edited it
  generatedAt: string;            // ISO timestamp of last generation
  editedAt: string | null;        // ISO timestamp of last manual edit
  version: number;                // increments on each save
}

export type FoundationDocStatus = 'pending' | 'running' | 'complete' | 'error';

export interface FoundationProgress {
  ideaId: string;
  status: 'pending' | 'running' | 'paused' | 'complete' | 'error';
  currentStep: string;
  docs: Record<FoundationDocType, FoundationDocStatus>;
  error?: string;
  updatedAt?: string;
}

export interface StrategicInputs {
  differentiation?: string;      // "What makes your approach fundamentally different?"
  deliberateTradeoffs?: string;  // "What are you deliberately choosing NOT to do?"
  antiTarget?: string;           // "Who specifically are you NOT targeting?"
}

// Content Pipeline Phase 2: Critique Engine Types

export interface PipelineProgress {
  status: 'running' | 'complete' | 'error' | 'max-rounds-reached';
  contentType: string;
  currentStep: string;
  round: number;
  maxRounds: number;
  quality: 'approved' | 'max-rounds-reached' | null;
  selectedCritics: { advisorId: string; name: string }[];
  critiqueHistory: CritiqueRound[];
}

export interface CritiqueRound {
  round: number;
  critiques: AdvisorCritique[];
  editorDecision: 'approve' | 'revise';
  revisionBrief?: string;
  fixedItems: string[];
  wellScoredAspects: string[];
}

export interface AdvisorCritique {
  advisorId: string;
  name: string;
  score: number;
  pass: boolean;
  issues: CritiqueIssue[];
  error?: string;
}

export interface CritiqueIssue {
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
}

export interface RoundSummary {
  round: number;
  avgScore: number;
  highIssueCount: number;
  editorDecision: 'approve' | 'revise';
  brief: string;
  fixedItems: string[];
  wellScoredAspects: string[];
}

// Validation Canvas Types

export type AssumptionType = 'demand' | 'reachability' | 'engagement' | 'wtp' | 'differentiation';

export const ASSUMPTION_TYPES: AssumptionType[] = [
  'demand', 'reachability', 'engagement', 'wtp', 'differentiation',
];

export type AssumptionStatus = 'untested' | 'testing' | 'validated' | 'invalidated' | 'pivoted';

export interface AssumptionThreshold {
  validated: string;
  invalidated: string;
  windowDays: number;
}

export interface Assumption {
  type: AssumptionType;
  status: AssumptionStatus;
  statement: string;
  evidence: string[];
  threshold: AssumptionThreshold;
  linkedStage: string;
  validatedAt?: number;
  invalidatedAt?: number;
}

export interface PivotSuggestion {
  statement: string;
  evidence: string[];
  impact: string;
  experiment: string;
}

export interface PivotRecord {
  fromStatement: string;
  toStatement: string;
  reason: string;
  suggestedBy: 'system';
  approvedBy: 'curator';
  timestamp: number;
  alternatives: PivotSuggestion[];
}

export interface CanvasState {
  status: 'active' | 'killed';
  killedAt?: number;
  killedReason?: string;
}

export interface ValidationCanvasData {
  canvas: CanvasState;
  assumptions: Record<AssumptionType, Assumption>;
  pivotSuggestions: Partial<Record<AssumptionType, PivotSuggestion[]>>;
  pivotHistory: Partial<Record<AssumptionType, PivotRecord[]>>;
}

// Website Builder Chat Types

export type BuildMode = 'interactive' | 'autonomous';

export interface BuildStep {
  name: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  detail?: string;
  substeps?: { name: string; status: 'pending' | 'active' | 'complete' | 'error' }[];
}

export const WEBSITE_BUILD_STEPS: { name: string; checkpoint: boolean }[] = [
  { name: 'Extract Ingredients', checkpoint: true },
  { name: 'Design Brand Identity', checkpoint: false },
  { name: 'Write Hero', checkpoint: true },
  { name: 'Assemble Page', checkpoint: true },
  { name: 'Pressure Test', checkpoint: false },
  { name: 'Advisor Review', checkpoint: true },
  { name: 'Build & Deploy', checkpoint: false },
  { name: 'Verify', checkpoint: false },
];

export interface BuildSession {
  ideaId: string;
  mode: BuildMode;
  currentStep: number;
  steps: BuildStep[];
  artifacts: {
    ingredients?: string;
    brandIdentity?: string;
    heroContent?: string;
    pageContent?: string;
    pressureTestResults?: string;
    reviewResults?: string;
    siteUrl?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: {
    advisorConsultation?: { advisorId: string; advisorName: string; question: string };
    stepTransition?: { from: number; to: number };
  };
}

export type StreamEndSignal =
  | { action: 'checkpoint'; step: number; prompt: string }
  | { action: 'continue'; step: number }
  | { action: 'poll'; step: number; pollUrl: string }
  | { action: 'complete'; result: { siteUrl: string; repoUrl: string } };

export interface ChatRequestBody {
  type: 'mode_select' | 'user' | 'continue';
  mode?: BuildMode;
  content?: string;
  step?: number;
}
