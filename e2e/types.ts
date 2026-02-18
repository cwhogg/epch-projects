export interface EvalScenario {
  name: string;
  surface: string;
  tags: string[];
  config: Record<string, unknown>;
  fixtures: Record<string, string>;
  conversation: ConversationTurn[];
  dimensions: string[];
  dimensionConfig?: Record<string, Record<string, unknown>>;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content?: string;
  evaluate?: boolean;
}

export interface DimensionDefinition {
  name: string;
  description: string;
  heuristic: (response: string, scenario: EvalScenario) => HeuristicResult;
  judgeRubric: string;
  skipHeuristic?: (scenario: EvalScenario, turnIndex: number) => boolean;
  // Note: No skipJudge — the runner already skips judge when heuristic result is 'fail'
}

export interface HeuristicResult {
  result: 'pass' | 'warn' | 'fail' | 'n/a';
  details?: string[];
}

export interface JudgeResult {
  score: number;
  reasoning: string;
  individualScores: number[];
}

export interface PromptResult {
  systemPrompt?: string;
  userMessage?: string;
  model?: string;
}

export interface SurfacePattern {
  glob: string;
  tags: string[];
}

export interface DimensionScore {
  result: 'pass' | 'warn' | 'fail' | 'n/a';
  heuristic: HeuristicResult;
  judge?: JudgeResult;
}

export interface ScenarioResult {
  name: string;
  surface: string;
  result: 'pass' | 'warn' | 'fail';
  dimensions: Record<string, DimensionScore>;
  apiCalls: number;
}

export interface EvalLogEntry {
  timestamp: string;
  trigger: 'auto' | 'manual';
  changedFiles: string[];
  scopeReason: string;
  scenarios: ScenarioResult[];
  totals: {
    apiCalls: number;
    scenariosRun: number;
    passed: number;
    warned: number;
    failed: number;
    durationMs: number;
  };
}
