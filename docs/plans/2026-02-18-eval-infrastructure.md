# Eval Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build functional eval infrastructure for epch-projects with a runner, 5 scoring dimensions, 4 prompt adapter surfaces, and 6 initial scenarios.

**Source Design Doc:** `docs/plans/2026-02-18-eval-infrastructure-design.md`

**Architecture:** Standalone CLI eval runner (`npm run eval`) using `tsx`. Eval helpers (judge, logger, scenario-loader, trigger) live in `e2e/eval-helpers/`. Dimensions are self-contained modules in `e2e/dimensions/`. The prompt adapter wires scenarios to real production prompt builders (`getAdvisorSystemPrompt`, `createPrompt`, `buildCalendarPrompt`, `getFrameworkPrompt`). Scenarios are JSON files in `e2e/scenarios/`.

**Tech Stack:** TypeScript, tsx (script runner), @anthropic-ai/sdk (judge + response generation), minimatch (trigger glob matching), vitest (helper/dimension tests), dotenv (.env.local loading)

**Scope note:** This plan covers epch-projects instantiation only. Updating the kickstart skill to generate generic scaffolding is a separate effort in the `~/.claude/` repo.

---

## Prerequisites

> Complete these steps manually before starting Task 1.

- [ ] Ensure `.env.local` is symlinked in the worktree: `ls -la /Users/ericpage/software/epch-projects/.worktrees/eval-infrastructure/.env.local` — if missing, run `ln -sf ../../.env.local .env.local` from the worktree root
- [ ] Ensure `ANTHROPIC_API_KEY` is set in `.env.local`

---

### ✅ Task 1: Install dev dependencies and scaffold config files

**Files:**
- Modify: `package.json`
- Create: `e2e/tsconfig.json`
- Create: `e2e/.gitignore`

**Step 1: Install dev dependencies**

Run: `npm i -D tsx minimatch @types/minimatch dotenv`

**Step 2: Create `e2e/tsconfig.json`**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["**/*.ts", "../src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

> **Note:** Do NOT add a `paths` override here. The parent `tsconfig.json` already maps `@/*` to `./src/*` relative to the repo root. Adding `paths` in this child config would override it to resolve relative to `e2e/`, pointing `@/*` to `e2e/src/` which doesn't exist.

**Step 3: Create `e2e/.gitignore`**

```
eval-log.jsonl
.eval-audit-last-run
```

**Step 4: Run tests to verify nothing broke**

Run: `npm test`
Expected: All existing tests pass.

**Step 5: Commit**

```
git add package.json package-lock.json e2e/tsconfig.json e2e/.gitignore
git commit -m "chore: add eval dev dependencies and e2e scaffold"
```

---

### ✅ Task 2: Create shared types

**Files:**
- Create: `e2e/types.ts`

**Step 1: Write types file**

```typescript
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
```

**Step 2: Commit**

```
git add e2e/types.ts
git commit -m "feat(eval): add shared type definitions"
```

---

### ✅ Task 3: Create eval configuration

**Files:**
- Create: `e2e/eval-config.ts`

**Step 1: Write config file**

```typescript
import type { SurfacePattern } from './types';

export const EVAL_CONFIG = {
  defaultModel: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  judgeModel: 'claude-haiku-4-5-20251001',
  judgeThresholds: {
    pass: 4,  // >= 4
    warn: 3,  // == 3
    // < 3 = fail
  },
  outputLength: {
    words: { max: 500, warn: 800 },
    sentences: { max: 30, warn: 50 },
    paragraphs: { max: 10, warn: 15 },
  },
  llmSurfacePatterns: [
    { glob: 'src/lib/advisors/prompts/*.md', tags: ['advisor'] },
    { glob: 'src/lib/frameworks/prompts/*/prompt.md', tags: ['framework'] },
    { glob: 'src/lib/research-agent-prompts.ts', tags: ['research'] },
    { glob: 'src/lib/content-prompts.ts', tags: ['content'] },
    { glob: 'src/lib/painted-door-prompts.ts', tags: ['painted-door'] },
    { glob: 'src/lib/agent-tools/*.ts', tags: ['agent-tools'] },
    { glob: 'src/lib/expertise-profile.ts', tags: ['research'] },
    { glob: 'src/lib/seo-knowledge.ts', tags: ['research', 'seo'] },
    { glob: 'src/lib/critique-service.ts', tags: ['content'] },
    { glob: 'src/lib/frameworks/framework-loader.ts', tags: ['framework'] },
  ] as SurfacePattern[],
};
```

**Step 2: Commit**

```
git add e2e/eval-config.ts
git commit -m "feat(eval): add eval configuration with epch-projects surface patterns"
```

---

### ✅ Task 4: Logger helper (TDD)

**Files:**
- Create: `e2e/eval-helpers/__tests__/logger.test.ts`
- Create: `e2e/eval-helpers/logger.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { appendLog } from '../logger';
import type { EvalLogEntry } from '../../types';

const TEST_LOG_PATH = join(__dirname, '../../eval-log.test.jsonl');

function makeEntry(overrides: Partial<EvalLogEntry> = {}): EvalLogEntry {
  return {
    timestamp: '2026-02-18T12:00:00.000Z',
    trigger: 'manual',
    changedFiles: [],
    scopeReason: '--all',
    scenarios: [],
    totals: { apiCalls: 0, scenariosRun: 0, passed: 0, warned: 0, failed: 0, durationMs: 100 },
    ...overrides,
  };
}

describe('logger', () => {
  afterEach(() => {
    if (existsSync(TEST_LOG_PATH)) unlinkSync(TEST_LOG_PATH);
  });

  it('creates a new JSONL file if none exists', () => {
    appendLog(makeEntry(), TEST_LOG_PATH);
    expect(existsSync(TEST_LOG_PATH)).toBe(true);
    const parsed = JSON.parse(readFileSync(TEST_LOG_PATH, 'utf-8').trim());
    expect(parsed.timestamp).toBe('2026-02-18T12:00:00.000Z');
  });

  it('appends to existing file without overwriting', () => {
    appendLog(makeEntry({ trigger: 'auto' }), TEST_LOG_PATH);
    appendLog(makeEntry({ trigger: 'manual' }), TEST_LOG_PATH);
    const lines = readFileSync(TEST_LOG_PATH, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).trigger).toBe('auto');
    expect(JSON.parse(lines[1]).trigger).toBe('manual');
  });

  it('writes valid JSON per line', () => {
    appendLog(makeEntry({ scopeReason: '--scenario test' }), TEST_LOG_PATH);
    expect(() => JSON.parse(readFileSync(TEST_LOG_PATH, 'utf-8').trim())).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- e2e/eval-helpers/__tests__/logger.test.ts`
Expected: FAIL — `Cannot find module '../logger'`

**Step 3: Write minimal implementation**

```typescript
import { appendFileSync } from 'fs';
import { join } from 'path';
import type { EvalLogEntry } from '../types';

const DEFAULT_LOG_PATH = join(process.cwd(), 'e2e', 'eval-log.jsonl');

export function appendLog(entry: EvalLogEntry, logPath: string = DEFAULT_LOG_PATH): void {
  appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8');
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- e2e/eval-helpers/__tests__/logger.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```
git add e2e/eval-helpers/logger.ts e2e/eval-helpers/__tests__/logger.test.ts
git commit -m "feat(eval): add JSONL logger with tests"
```

---

### ✅ Task 5: Scenario loader helper (TDD)

**Files:**
- Create: `e2e/eval-helpers/__tests__/scenario-loader.test.ts`
- Create: `e2e/eval-helpers/scenario-loader.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { loadScenario, loadAllScenarios } from '../scenario-loader';

const TEST_DIR = join(__dirname, '../../scenarios-test');

function writeScenario(name: string, data: Record<string, unknown>) {
  writeFileSync(join(TEST_DIR, `${name}.json`), JSON.stringify(data));
}

const valid = {
  name: 'test-scenario', surface: 'test-surface', tags: ['test'],
  config: {}, fixtures: {},
  conversation: [{ role: 'user', content: 'Hello' }, { role: 'assistant', evaluate: true }],
  dimensions: ['output-length'],
};

describe('scenario-loader', () => {
  beforeEach(() => { mkdirSync(TEST_DIR, { recursive: true }); });
  afterEach(() => { if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true }); });

  it('loads a valid scenario by name', () => {
    writeScenario('valid', valid);
    const result = loadScenario('valid', TEST_DIR);
    expect(result.name).toBe('test-scenario');
    expect(result.dimensions).toEqual(['output-length']);
  });

  it('throws for missing scenario file', () => {
    expect(() => loadScenario('nonexistent', TEST_DIR)).toThrow(/not found/i);
  });

  it('throws for scenario missing required fields', () => {
    writeScenario('bad', { name: 'bad' });
    expect(() => loadScenario('bad', TEST_DIR)).toThrow(/missing required field/i);
  });

  it('loads all scenarios from directory', () => {
    writeScenario('one', { ...valid, name: 'one' });
    writeScenario('two', { ...valid, name: 'two' });
    const all = loadAllScenarios(TEST_DIR);
    expect(all).toHaveLength(2);
  });

  it('skips non-JSON files', () => {
    writeScenario('valid', valid);
    writeFileSync(join(TEST_DIR, 'readme.md'), '# Not a scenario');
    expect(loadAllScenarios(TEST_DIR)).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- e2e/eval-helpers/__tests__/scenario-loader.test.ts`
Expected: FAIL — `Cannot find module '../scenario-loader'`

**Step 3: Write minimal implementation**

```typescript
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { EvalScenario } from '../types';

const DEFAULT_DIR = join(process.cwd(), 'e2e', 'scenarios');
const REQUIRED_FIELDS = ['name', 'surface', 'tags', 'conversation', 'dimensions'] as const;

export function loadScenario(name: string, scenariosDir: string = DEFAULT_DIR): EvalScenario {
  const filePath = join(scenariosDir, `${name}.json`);
  if (!existsSync(filePath)) throw new Error(`Scenario not found: ${filePath}`);
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  validate(raw, name);
  return raw as EvalScenario;
}

export function loadAllScenarios(scenariosDir: string = DEFAULT_DIR): EvalScenario[] {
  if (!existsSync(scenariosDir)) return [];
  return readdirSync(scenariosDir)
    .filter(f => f.endsWith('.json'))
    .map(f => loadScenario(f.replace('.json', ''), scenariosDir));
}

function validate(data: Record<string, unknown>, name: string): void {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in data) || data[field] == null) {
      throw new Error(`Scenario "${name}": missing required field "${field}"`);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- e2e/eval-helpers/__tests__/scenario-loader.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```
git add e2e/eval-helpers/scenario-loader.ts e2e/eval-helpers/__tests__/scenario-loader.test.ts
git commit -m "feat(eval): add scenario loader with validation and tests"
```

---

### ✅ Task 6: Trigger/scoping helper (TDD)

**Files:**
- Create: `e2e/eval-helpers/__tests__/trigger.test.ts`
- Create: `e2e/eval-helpers/trigger.ts`

The trigger helper has three functions: `getChangedFiles()` (runs git diff), `getTriggeredTags()` (matches files to patterns via minimatch), and `filterScenariosByTags()` (filters scenarios by tag overlap). The pure functions are tested without mocking; `getChangedFiles` uses `child_process.execSync` to run a fixed `git diff` command (no user input).

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EvalScenario, SurfacePattern } from '../../types';

// Mock child_process for getChangedFiles tests
vi.mock('child_process', () => ({ execSync: vi.fn() }));

import { getTriggeredTags, filterScenariosByTags, getChangedFiles } from '../trigger';
import { execSync } from 'child_process';
const mockExecSync = vi.mocked(execSync);

const patterns: SurfacePattern[] = [
  { glob: 'src/lib/advisors/prompts/*.md', tags: ['advisor'] },
  { glob: 'src/lib/frameworks/prompts/*/prompt.md', tags: ['framework'] },
  { glob: 'src/lib/research-agent-prompts.ts', tags: ['research'] },
  { glob: 'src/lib/content-prompts.ts', tags: ['content'] },
];

function makeScenario(name: string, tags: string[]): EvalScenario {
  return { name, surface: 'test', tags, config: {}, fixtures: {}, conversation: [], dimensions: [] };
}

describe('getTriggeredTags', () => {
  it('matches advisor prompt changes', () => {
    expect(getTriggeredTags(['src/lib/advisors/prompts/richard-rumelt.md'], patterns)).toContain('advisor');
  });

  it('matches framework prompt changes', () => {
    expect(getTriggeredTags(['src/lib/frameworks/prompts/value-metric/prompt.md'], patterns)).toContain('framework');
  });

  it('matches exact file paths', () => {
    expect(getTriggeredTags(['src/lib/research-agent-prompts.ts'], patterns)).toContain('research');
  });

  it('returns empty for unmatched files', () => {
    expect(getTriggeredTags(['src/app/page.tsx'], patterns)).toHaveLength(0);
  });

  it('deduplicates tags', () => {
    const tags = getTriggeredTags([
      'src/lib/advisors/prompts/a.md',
      'src/lib/advisors/prompts/b.md',
    ], patterns);
    expect(tags.filter(t => t === 'advisor')).toHaveLength(1);
  });

  it('collects tags from multiple patterns', () => {
    const tags = getTriggeredTags([
      'src/lib/advisors/prompts/a.md',
      'src/lib/content-prompts.ts',
    ], patterns);
    expect(tags).toContain('advisor');
    expect(tags).toContain('content');
  });
});

describe('filterScenariosByTags', () => {
  const scenarios = [
    makeScenario('a', ['advisor']),
    makeScenario('f', ['framework']),
    makeScenario('w', ['*']),
  ];

  it('filters matching tags', () => {
    const result = filterScenariosByTags(scenarios, ['advisor']);
    expect(result.map(s => s.name)).toContain('a');
    expect(result.map(s => s.name)).not.toContain('f');
  });

  it('includes wildcard scenarios', () => {
    expect(filterScenariosByTags(scenarios, ['advisor']).map(s => s.name)).toContain('w');
  });

  it('returns empty when no tags triggered', () => {
    expect(filterScenariosByTags(scenarios, [])).toHaveLength(0);
  });
});

describe('getChangedFiles', () => {
  beforeEach(() => { mockExecSync.mockReset(); });

  it('returns changed files from git diff', () => {
    mockExecSync.mockReturnValue(Buffer.from('src/lib/test.ts\nREADME.md\n'));
    expect(getChangedFiles()).toEqual(['src/lib/test.ts', 'README.md']);
  });

  it('returns empty array when no changes', () => {
    mockExecSync.mockReturnValue(Buffer.from(''));
    expect(getChangedFiles()).toEqual([]);
  });

  it('returns empty array when git command fails', () => {
    mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });
    expect(getChangedFiles()).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- e2e/eval-helpers/__tests__/trigger.test.ts`
Expected: FAIL — `Cannot find module '../trigger'`

**Step 3: Write minimal implementation**

```typescript
import { execSync } from 'child_process';
import { minimatch } from 'minimatch';
import type { EvalScenario, SurfacePattern } from '../types';

export function getChangedFiles(): string[] {
  try {
    const output = execSync('git diff --name-only main...HEAD', { encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export function getTriggeredTags(files: string[], patterns: SurfacePattern[]): string[] {
  const tagSet = new Set<string>();
  for (const file of files) {
    for (const pattern of patterns) {
      if (minimatch(file, pattern.glob)) {
        pattern.tags.forEach(t => tagSet.add(t));
      }
    }
  }
  return [...tagSet];
}

export function filterScenariosByTags(scenarios: EvalScenario[], triggeredTags: string[]): EvalScenario[] {
  if (triggeredTags.length === 0) return [];
  return scenarios.filter(s =>
    s.tags.includes('*') || s.tags.some(t => triggeredTags.includes(t))
  );
}

export function scopeScenarios(
  scenarios: EvalScenario[], patterns: SurfacePattern[], changedFiles: string[],
): EvalScenario[] {
  return filterScenariosByTags(scenarios, getTriggeredTags(changedFiles, patterns));
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- e2e/eval-helpers/__tests__/trigger.test.ts`
Expected: PASS (9 tests)

**Step 5: Commit**

```
git add e2e/eval-helpers/trigger.ts e2e/eval-helpers/__tests__/trigger.test.ts
git commit -m "feat(eval): add trigger/scoping helper with git diff and tag matching"
```

---

### ✅ Task 7: Judge helper (TDD)

**Files:**
- Create: `e2e/eval-helpers/__tests__/judge.test.ts`
- Create: `e2e/eval-helpers/judge.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runJudge } from '../judge';

const mockCreate = vi.fn();
vi.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({ messages: { create: mockCreate } }),
}));

function toolResponse(score: number, reasoning: string) {
  return {
    content: [{ type: 'tool_use' as const, id: 'toolu_1', name: 'score_response', input: { score, reasoning } }],
  };
}

const input = { rubric: 'Test rubric', systemPrompt: 'Test prompt', response: 'Test response', model: 'claude-haiku-4-5-20251001' };

describe('judge', () => {
  beforeEach(() => { mockCreate.mockReset(); });

  it('returns median score from 3 calls', async () => {
    mockCreate
      .mockResolvedValueOnce(toolResponse(3, 'Low'))
      .mockResolvedValueOnce(toolResponse(5, 'High'))
      .mockResolvedValueOnce(toolResponse(4, 'Mid'));
    const result = await runJudge(input);
    expect(result.score).toBe(4);
    expect(result.individualScores).toEqual([3, 5, 4]);
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('returns score 0 when all calls fail', async () => {
    mockCreate.mockRejectedValue(new Error('API error'));
    const result = await runJudge(input);
    expect(result.score).toBe(0);
    expect(result.reasoning).toContain('All judge calls failed');
  });

  it('handles partial failures', async () => {
    mockCreate
      .mockResolvedValueOnce(toolResponse(4, 'Good'))
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce(toolResponse(3, 'OK'));
    const result = await runJudge(input);
    expect(result.score).toBe(3); // median of [3, 4]
    expect(result.individualScores).toEqual([4, 3]);
  });

  it('handles response with no tool_use block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Cannot score.' }] });
    const result = await runJudge(input);
    expect(result.score).toBe(0);
  });

  it('handles tool_use with missing score field', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use' as const, id: 'toolu_1', name: 'score_response', input: { reasoning: 'No score' } }],
    });
    const result = await runJudge(input);
    expect(result.score).toBe(0);
  });

  it('truncates system prompt to 3000 chars', async () => {
    mockCreate.mockResolvedValue(toolResponse(4, 'OK'));
    await runJudge({ ...input, systemPrompt: 'x'.repeat(5000) });
    const userContent = mockCreate.mock.calls[0][0].messages[0].content;
    expect(userContent.length).toBeLessThan(5000);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- e2e/eval-helpers/__tests__/judge.test.ts`
Expected: FAIL — `Cannot find module '../judge'`

**Step 3: Write minimal implementation**

```typescript
import { getAnthropic } from '@/lib/anthropic';
import type { JudgeResult } from '../types';

const JUDGE_CALLS = 3;
const MAX_PROMPT_LEN = 3000;

interface JudgeInput {
  rubric: string;
  systemPrompt: string;
  response: string;
  model: string;
}

const scoreTool = {
  name: 'score_response' as const,
  description: 'Score the LLM response',
  input_schema: {
    type: 'object' as const,
    properties: {
      score: { type: 'number' as const, minimum: 1, maximum: 5 },
      reasoning: { type: 'string' as const },
    },
    required: ['score', 'reasoning'],
  },
};

export async function runJudge(input: JudgeInput): Promise<JudgeResult> {
  const client = getAnthropic();
  const truncated = input.systemPrompt.slice(0, MAX_PROMPT_LEN);

  const promises = Array.from({ length: JUDGE_CALLS }, () =>
    client.messages.create({
      model: input.model,
      max_tokens: 256,
      system: `You are evaluating an LLM response. ${input.rubric}`,
      messages: [{
        role: 'user' as const,
        content: `System prompt (may be truncated):\n${truncated}\n\nResponse to evaluate:\n${input.response}`,
      }],
      tools: [scoreTool],
      tool_choice: { type: 'tool' as const, name: 'score_response' },
    }).catch(() => null)
  );

  const results = await Promise.all(promises);
  const scores: number[] = [];
  const reasonings: string[] = [];

  for (const result of results) {
    if (!result) continue;
    const block = result.content.find((b: { type: string }) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') continue;
    const inp = block.input as { score?: number; reasoning?: string };
    if (typeof inp.score !== 'number') continue;
    scores.push(inp.score);
    reasonings.push(inp.reasoning || '');
  }

  if (scores.length === 0) {
    return { score: 0, reasoning: 'All judge calls failed', individualScores: [] };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const medianIdx = Math.floor((sorted.length - 1) / 2);
  const medianScore = sorted[medianIdx];
  const closestIdx = scores.findIndex(s => s === medianScore);

  return { score: medianScore, reasoning: reasonings[closestIdx] || '', individualScores: scores };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- e2e/eval-helpers/__tests__/judge.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```
git add e2e/eval-helpers/judge.ts e2e/eval-helpers/__tests__/judge.test.ts
git commit -m "feat(eval): add LLM-as-judge with median voting and tests"
```

---

### ✅ Task 8: Helpers barrel export

**Files:**
- Create: `e2e/eval-helpers/index.ts`

**Step 1: Write barrel export**

```typescript
export { appendLog } from './logger';
export { loadScenario, loadAllScenarios } from './scenario-loader';
export { getChangedFiles, getTriggeredTags, filterScenariosByTags, scopeScenarios } from './trigger';
export { runJudge } from './judge';
```

**Step 2: Run all helper tests**

Run: `npm test -- e2e/eval-helpers/__tests__/`
Expected: PASS (all tests from Tasks 4-7)

**Step 3: Commit**

```
git add e2e/eval-helpers/index.ts
git commit -m "feat(eval): add helpers barrel export"
```

---

### ✅ Task 9: output-length dimension (TDD)

**Files:**
- Create: `e2e/dimensions/__tests__/output-length.test.ts`
- Create: `e2e/dimensions/output-length.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { outputLength } from '../output-length';
import type { EvalScenario } from '../../types';

const base: EvalScenario = {
  name: 'test', surface: 'test', tags: [], config: {},
  fixtures: {}, conversation: [], dimensions: ['output-length'],
};

describe('output-length', () => {
  it('has correct name', () => { expect(outputLength.name).toBe('output-length'); });

  it('passes for short response', () => {
    expect(outputLength.heuristic('Short response.', base).result).toBe('pass');
  });

  it('warns when word count exceeds max but not warn threshold', () => {
    const words = Array(600).fill('word').join(' ');
    const r = outputLength.heuristic(words, base);
    expect(r.result).toBe('warn');
    expect(r.details?.some(d => d.includes('word'))).toBe(true);
  });

  it('fails when word count exceeds warn threshold', () => {
    expect(outputLength.heuristic(Array(900).fill('word').join(' '), base).result).toBe('fail');
  });

  it('uses per-scenario overrides', () => {
    const s = { ...base, dimensionConfig: { 'output-length': { words: { max: 10, warn: 20 } } } };
    expect(outputLength.heuristic('one two three four five six seven eight nine ten eleven twelve', s).result).toBe('warn');
  });

  it('has a judgeRubric', () => { expect(outputLength.judgeRubric).toBeTruthy(); });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- e2e/dimensions/__tests__/output-length.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
import { EVAL_CONFIG } from '../eval-config';
import type { DimensionDefinition, EvalScenario, HeuristicResult } from '../types';

interface Thresholds { words?: { max: number; warn: number }; sentences?: { max: number; warn: number }; paragraphs?: { max: number; warn: number }; }

export const outputLength: DimensionDefinition = {
  name: 'output-length',
  description: 'Checks response length against configurable thresholds.',
  judgeRubric: 'Is the response length appropriate for this conversational context? Score 1-5.',
  heuristic(response: string, scenario: EvalScenario): HeuristicResult {
    const t = (scenario.dimensionConfig?.['output-length'] ?? EVAL_CONFIG.outputLength) as Thresholds;
    const details: string[] = [];
    let worst: 'pass' | 'warn' | 'fail' = 'pass';

    const words = response.split(/\s+/).filter(Boolean).length;
    const sentences = response.split(/[.!?]+/).filter(s => s.trim()).length;
    const paragraphs = response.split(/\n\s*\n/).filter(p => p.trim()).length;

    function check(metric: string, count: number, limits?: { max: number; warn: number }) {
      if (!limits) return;
      if (count > limits.warn) { worst = 'fail'; details.push(`${metric}: ${count} exceeds fail threshold ${limits.warn}`); }
      else if (count > limits.max) { if (worst !== 'fail') worst = 'warn'; details.push(`${metric}: ${count} exceeds warn threshold ${limits.max}`); }
    }

    check('words', words, t.words);
    check('sentences', sentences, t.sentences);
    check('paragraphs', paragraphs, t.paragraphs);
    return { result: worst, details: details.length > 0 ? details : undefined };
  },
};
```

**Step 4: Run test to verify it passes**

Run: `npm test -- e2e/dimensions/__tests__/output-length.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```
git add e2e/dimensions/output-length.ts e2e/dimensions/__tests__/output-length.test.ts
git commit -m "feat(eval): add output-length dimension with tests"
```

---

### ✅ Task 10: instruction-following dimension (TDD)

**Files:**
- Create: `e2e/dimensions/__tests__/instruction-following.test.ts`
- Create: `e2e/dimensions/instruction-following.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { instructionFollowing } from '../instruction-following';
import type { EvalScenario } from '../../types';

const base: EvalScenario = { name: 'test', surface: 'test', tags: [], config: {}, fixtures: {}, conversation: [], dimensions: [] };

describe('instruction-following', () => {
  it('has correct name', () => { expect(instructionFollowing.name).toBe('instruction-following'); });
  it('heuristic returns n/a', () => { expect(instructionFollowing.heuristic('Any.', base).result).toBe('n/a'); });
  it('has a judgeRubric', () => { expect(instructionFollowing.judgeRubric).toBeTruthy(); });
});
```

**Step 2: Run test to verify it fails, then write implementation**

```typescript
import type { DimensionDefinition, HeuristicResult } from '../types';

export const instructionFollowing: DimensionDefinition = {
  name: 'instruction-following',
  description: 'Whether the response follows explicit instructions from the system prompt.',
  judgeRubric: 'Does the response follow the explicit instructions in the system prompt? Consider format requirements, constraints, and behavioral directives. Score 1-5.',
  heuristic(): HeuristicResult { return { result: 'n/a' }; },
};
```

**Step 3: Run test to verify it passes**

Run: `npm test -- e2e/dimensions/__tests__/instruction-following.test.ts`
Expected: PASS

**Step 4: Commit**

```
git add e2e/dimensions/instruction-following.ts e2e/dimensions/__tests__/instruction-following.test.ts
git commit -m "feat(eval): add instruction-following dimension with tests"
```

---

### ✅ Task 11: voice dimension (TDD)

**Files:**
- Create: `e2e/dimensions/__tests__/voice.test.ts`
- Create: `e2e/dimensions/voice.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { voice } from '../voice';
import type { EvalScenario } from '../../types';

const base: EvalScenario = { name: 'test', surface: 'test', tags: [], config: {}, fixtures: {}, conversation: [], dimensions: [] };

describe('voice', () => {
  it('has correct name', () => { expect(voice.name).toBe('voice'); });

  it('returns n/a when no antiPatterns configured', () => {
    expect(voice.heuristic('Any response.', base).result).toBe('n/a');
  });

  it('fails when response contains an anti-pattern (case-insensitive)', () => {
    const s = { ...base, dimensionConfig: { voice: { antiPatterns: ['as an AI', 'studies show'] } } };
    const r = voice.heuristic('As an AI language model, I can help.', s);
    expect(r.result).toBe('fail');
    expect(r.details?.some(d => d.toLowerCase().includes('as an ai'))).toBe(true);
  });

  it('passes when no anti-patterns found', () => {
    const s = { ...base, dimensionConfig: { voice: { antiPatterns: ['as an AI'] } } };
    expect(voice.heuristic('The diagnosis here is clear.', s).result).toBe('pass');
  });

  it('detects multiple anti-patterns', () => {
    const s = { ...base, dimensionConfig: { voice: { antiPatterns: ['as an AI', 'studies show'] } } };
    expect(voice.heuristic('As an AI, studies show this works.', s).details).toHaveLength(2);
  });

  it('has a judgeRubric', () => { expect(voice.judgeRubric).toBeTruthy(); });
});
```

**Step 2: Run test to verify it fails, then write implementation**

```typescript
import type { DimensionDefinition, EvalScenario, HeuristicResult } from '../types';

export const voice: DimensionDefinition = {
  name: 'voice',
  description: 'Whether a persona-based response is distinctively voiced.',
  judgeRubric: 'Is this response unmistakably from this specific advisor, or could it be from anyone? Evaluate tone, vocabulary, and stylistic distinctiveness. Score 1-5.',
  heuristic(response: string, scenario: EvalScenario): HeuristicResult {
    const config = scenario.dimensionConfig?.voice as { antiPatterns?: string[] } | undefined;
    if (!config?.antiPatterns?.length) return { result: 'n/a' };

    const lower = response.toLowerCase();
    const matches = config.antiPatterns.filter(p => lower.includes(p.toLowerCase()));

    if (matches.length > 0) {
      return { result: 'fail', details: matches.map(m => `Anti-pattern found: "${m}"`) };
    }
    return { result: 'pass' };
  },
};
```

**Step 3: Run test to verify it passes**

Run: `npm test -- e2e/dimensions/__tests__/voice.test.ts`
Expected: PASS

**Step 4: Commit**

```
git add e2e/dimensions/voice.ts e2e/dimensions/__tests__/voice.test.ts
git commit -m "feat(eval): add voice dimension with anti-pattern detection and tests"
```

---

### ✅ Task 12: structured-output dimension (TDD)

**Files:**
- Create: `e2e/dimensions/__tests__/structured-output.test.ts`
- Create: `e2e/dimensions/structured-output.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { structuredOutput } from '../structured-output';
import type { EvalScenario } from '../../types';

const base: EvalScenario = { name: 'test', surface: 'test', tags: [], config: {}, fixtures: {}, conversation: [], dimensions: [] };

describe('structured-output', () => {
  it('has correct name', () => { expect(structuredOutput.name).toBe('structured-output'); });
  it('passes for valid JSON', () => { expect(structuredOutput.heuristic('{"key":"value"}', base).result).toBe('pass'); });
  it('fails for invalid JSON', () => { expect(structuredOutput.heuristic('not json', base).result).toBe('fail'); });

  it('extracts JSON from markdown code fences', () => {
    expect(structuredOutput.heuristic('Result:\n```json\n{"key":"value"}\n```', base).result).toBe('pass');
  });

  it('checks required fields when configured', () => {
    const s = { ...base, dimensionConfig: { 'structured-output': { requiredFields: ['name', 'type', 'content'] } } };
    const r = structuredOutput.heuristic('{"name":"test","type":"blog"}', s);
    expect(r.result).toBe('fail');
    expect(r.details?.some(d => d.includes('content'))).toBe(true);
  });

  it('passes when all required fields present', () => {
    const s = { ...base, dimensionConfig: { 'structured-output': { requiredFields: ['name'] } } };
    expect(structuredOutput.heuristic('{"name":"test"}', s).result).toBe('pass');
  });

  it('has a judgeRubric', () => { expect(structuredOutput.judgeRubric).toBeTruthy(); });
});
```

**Step 2: Run test to verify it fails, then write implementation**

```typescript
import type { DimensionDefinition, EvalScenario, HeuristicResult } from '../types';

function extractJson(response: string): string | null {
  try { JSON.parse(response); return response; } catch { /* continue */ }
  const match = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (match) { try { JSON.parse(match[1]); return match[1]; } catch { /* continue */ } }
  return null;
}

export const structuredOutput: DimensionDefinition = {
  name: 'structured-output',
  description: 'Whether LLM output is valid parseable JSON with expected fields.',
  judgeRubric: 'Are all required fields present with sensible values? Is the JSON structure well-formed and complete? Score 1-5.',
  heuristic(response: string, scenario: EvalScenario): HeuristicResult {
    const json = extractJson(response);
    if (!json) return { result: 'fail', details: ['Failed to parse JSON from response'] };
    const config = scenario.dimensionConfig?.['structured-output'] as { requiredFields?: string[] } | undefined;
    if (config?.requiredFields?.length) {
      const parsed = JSON.parse(json);
      const missing = config.requiredFields.filter(f => !(f in parsed));
      if (missing.length > 0) return { result: 'fail', details: missing.map(f => `Missing required field: "${f}"`) };
    }
    return { result: 'pass' };
  },
  // No skipJudge needed — the runner already skips judge calls when heuristic.result === 'fail'
};
```

**Step 3: Run test to verify it passes**

Run: `npm test -- e2e/dimensions/__tests__/structured-output.test.ts`
Expected: PASS

**Step 4: Commit**

```
git add e2e/dimensions/structured-output.ts e2e/dimensions/__tests__/structured-output.test.ts
git commit -m "feat(eval): add structured-output dimension with JSON parsing and tests"
```

---

### ✅ Task 13: Dimension registry (TDD)

**Files:**
- Create: `e2e/dimensions/__tests__/registry.test.ts`
- Create: `e2e/dimensions/index.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { getDimension, getAllDimensions } from '../index';

describe('dimension registry', () => {
  it('registers all 4 starter dimensions', () => { expect(getAllDimensions().size).toBe(4); });
  it('retrieves output-length', () => { expect(getDimension('output-length')).toBeDefined(); });
  it('retrieves instruction-following', () => { expect(getDimension('instruction-following')).toBeDefined(); });
  it('retrieves voice', () => { expect(getDimension('voice')).toBeDefined(); });
  it('retrieves structured-output', () => { expect(getDimension('structured-output')).toBeDefined(); });
  it('returns undefined for unknown', () => { expect(getDimension('nope')).toBeUndefined(); });
  it('every dimension has required fields', () => {
    for (const [, dim] of getAllDimensions()) {
      expect(dim.name).toBeTruthy();
      expect(typeof dim.heuristic).toBe('function');
      expect(dim.judgeRubric).toBeTruthy();
    }
  });
});
```

**Step 2: Run test to verify it fails, then write implementation**

```typescript
import type { DimensionDefinition } from '../types';
import { outputLength } from './output-length';
import { instructionFollowing } from './instruction-following';
import { voice } from './voice';
import { structuredOutput } from './structured-output';

const dimensions = new Map<string, DimensionDefinition>([
  [outputLength.name, outputLength],
  [instructionFollowing.name, instructionFollowing],
  [voice.name, voice],
  [structuredOutput.name, structuredOutput],
]);

export function getDimension(name: string): DimensionDefinition | undefined { return dimensions.get(name); }
export function getAllDimensions(): Map<string, DimensionDefinition> { return dimensions; }
export function registerDimension(dim: DimensionDefinition): void { dimensions.set(dim.name, dim); }
```

**Step 3: Run all eval tests**

Run: `npm test -- e2e/`
Expected: PASS (all tests)

**Step 4: Commit**

```
git add e2e/dimensions/index.ts e2e/dimensions/__tests__/registry.test.ts
git commit -m "feat(eval): add dimension registry with 4 starter dimensions"
```

---

### ✅ Task 14: Prompt adapter skeleton

**Files:**
- Create: `e2e/prompt-adapter.ts`

**Step 1: Write prompt adapter with example surface and fixture loader**

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import type { EvalScenario, PromptResult } from './types';

export function loadFixture(scenario: EvalScenario, key: string): unknown {
  const rel = scenario.fixtures[key];
  if (!rel) throw new Error(`Fixture "${key}" not found in scenario "${scenario.name}"`);
  const full = join(process.cwd(), 'e2e', rel);
  const raw = readFileSync(full, 'utf-8');
  return rel.endsWith('.txt') ? raw : JSON.parse(raw);
}

export async function buildPromptForScenario(scenario: EvalScenario): Promise<PromptResult> {
  switch (scenario.surface) {
    case 'example':
      return { systemPrompt: 'You are a helpful assistant.' };
    default:
      throw new Error(`Unknown surface: "${scenario.surface}" in scenario "${scenario.name}"`);
  }
}
```

**Step 2: Commit**

```
git add e2e/prompt-adapter.ts
git commit -m "feat(eval): add prompt adapter skeleton with example surface"
```

---

### ✅ Task 15: Eval runner CLI

**Files:**
- Create: `e2e/eval-runner.ts`

**Step 1: Write the eval runner**

The runner is the CLI orchestrator. Read the design doc at `docs/plans/2026-02-18-eval-infrastructure-design.md` lines 169-197 for execution flow. Full implementation:

```typescript
import { config } from 'dotenv';
config({ path: '.env.local' });

import { parseArgs } from 'node:util';
import { getAnthropic } from '@/lib/anthropic';
import { loadScenario, loadAllScenarios } from './eval-helpers/scenario-loader';
import { scopeScenarios, getChangedFiles } from './eval-helpers/trigger';
import { runJudge } from './eval-helpers/judge';
import { appendLog } from './eval-helpers/logger';
import { getDimension } from './dimensions';
import { buildPromptForScenario } from './prompt-adapter';
import { EVAL_CONFIG } from './eval-config';
import type { EvalScenario, ScenarioResult, DimensionScore, HeuristicResult, JudgeResult } from './types';

const { values } = parseArgs({
  options: {
    all: { type: 'boolean', default: false },
    scenario: { type: 'string' },
    tag: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
  strict: false,
});

async function main() {
  let scenarios: EvalScenario[];
  let trigger: 'auto' | 'manual';
  let changedFiles: string[] = [];
  let scopeReason: string;

  if (values.scenario) {
    scenarios = [loadScenario(values.scenario)];
    trigger = 'manual'; scopeReason = `--scenario ${values.scenario}`;
  } else if (values.tag) {
    scenarios = loadAllScenarios().filter(s => s.tags.includes(values.tag!));
    trigger = 'manual'; scopeReason = `--tag ${values.tag}`;
  } else if (values.all) {
    scenarios = loadAllScenarios();
    trigger = 'manual'; scopeReason = '--all';
  } else {
    changedFiles = getChangedFiles();
    scenarios = scopeScenarios(loadAllScenarios(), EVAL_CONFIG.llmSurfacePatterns, changedFiles);
    trigger = 'auto'; scopeReason = `auto-detect (${changedFiles.length} changed files)`;
  }

  console.log(`Eval scope: ${scopeReason}\nScenarios: ${scenarios.length}`);

  if (values['dry-run']) {
    scenarios.forEach(s => console.log(`  - ${s.name} [${s.surface}] tags=${s.tags.join(',')}`));
    return;
  }
  if (scenarios.length === 0) { console.log('No scenarios to run.'); return; }

  const results: ScenarioResult[] = [];
  const startTime = Date.now();
  let totalApiCalls = 0;

  for (const scenario of scenarios) {
    process.stdout.write(`\n> ${scenario.name} (${scenario.surface})... `);
    try {
      const result = await runScenario(scenario);
      results.push(result);
      totalApiCalls += result.apiCalls;
      console.log(result.result === 'pass' ? 'PASS' : result.result === 'warn' ? 'WARN' : 'FAIL');
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : err}`);
      results.push({ name: scenario.name, surface: scenario.surface, result: 'fail', dimensions: {}, apiCalls: 0 });
    }
  }

  const totals = {
    apiCalls: totalApiCalls, scenariosRun: results.length,
    passed: results.filter(r => r.result === 'pass').length,
    warned: results.filter(r => r.result === 'warn').length,
    failed: results.filter(r => r.result === 'fail').length,
    durationMs: Date.now() - startTime,
  };

  appendLog({ timestamp: new Date().toISOString(), trigger, changedFiles, scopeReason, scenarios: results, totals });
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${totals.passed} passed, ${totals.warned} warned, ${totals.failed} failed`);
  console.log(`Duration: ${(totals.durationMs / 1000).toFixed(1)}s | API calls: ${totals.apiCalls}`);
  if (totals.failed > 0) process.exit(1);
}

async function runScenario(scenario: EvalScenario): Promise<ScenarioResult> {
  for (const d of scenario.dimensions) {
    if (!getDimension(d)) throw new Error(`Unknown dimension "${d}" in scenario "${scenario.name}"`);
  }

  const promptResult = await buildPromptForScenario(scenario);
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (promptResult.userMessage) messages.push({ role: 'user', content: promptResult.userMessage });

  const dimScores = new Map<string, DimensionScore[]>();
  let apiCalls = 0;

  for (const turn of scenario.conversation) {
    if (turn.role === 'user') { messages.push({ role: 'user', content: turn.content! }); continue; }
    if (turn.role !== 'assistant' || !turn.evaluate) continue;

    const model = promptResult.model || process.env.ANTHROPIC_EVAL_MODEL || EVAL_CONFIG.defaultModel;
    const response = await getAnthropic().messages.create({
      model, max_tokens: EVAL_CONFIG.maxTokens,
      ...(promptResult.systemPrompt ? { system: promptResult.systemPrompt } : {}),
      messages: [...messages],
    });
    apiCalls++;

    const text = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text).join('');
    messages.push({ role: 'assistant', content: text });

    const turnIdx = messages.filter(m => m.role === 'assistant').length - 1;
    for (const dimName of scenario.dimensions) {
      const dim = getDimension(dimName)!;
      let heuristic: HeuristicResult = { result: 'n/a' };
      if (!dim.skipHeuristic?.(scenario, turnIdx)) heuristic = dim.heuristic(text, scenario);

      let judge: JudgeResult | undefined;
      if (heuristic.result !== 'fail') {
        judge = await runJudge({ rubric: dim.judgeRubric, systemPrompt: promptResult.systemPrompt || promptResult.userMessage || '', response: text, model: EVAL_CONFIG.judgeModel });
        apiCalls += 3;
      }

      if (!dimScores.has(dimName)) dimScores.set(dimName, []);
      dimScores.get(dimName)!.push({ result: combine(heuristic, judge), heuristic, judge });
    }
  }

  const dimensions: Record<string, DimensionScore> = {};
  for (const [name, scores] of dimScores) dimensions[name] = worst(scores);

  const overall = Object.values(dimensions).some(d => d.result === 'fail') ? 'fail'
    : Object.values(dimensions).some(d => d.result === 'warn') ? 'warn' : 'pass';

  return { name: scenario.name, surface: scenario.surface, result: overall, dimensions, apiCalls };
}

function combine(h: HeuristicResult, j?: JudgeResult): 'pass' | 'warn' | 'fail' | 'n/a' {
  if (h.result === 'fail') return 'fail';
  if (!j) return h.result;
  const jr = j.score >= EVAL_CONFIG.judgeThresholds.pass ? 'pass' : j.score >= EVAL_CONFIG.judgeThresholds.warn ? 'warn' : 'fail';
  const p = { fail: 0, warn: 1, 'n/a': 2, pass: 3 };
  return p[jr] < p[h.result] ? jr : h.result;
}

function worst(scores: DimensionScore[]): DimensionScore {
  const p = { fail: 0, warn: 1, 'n/a': 2, pass: 3 };
  return scores.reduce((w, c) => p[c.result] < p[w.result] ? c : w);
}

main().catch(err => { console.error('Eval runner failed:', err); process.exit(1); });
```

**Step 2: Commit**

```
git add e2e/eval-runner.ts
git commit -m "feat(eval): add eval runner CLI with all modes"
```

---

### ✅ Task 16: npm script, example scenario, and sample fixture

**Files:**
- Modify: `package.json` (add `"eval": "tsx e2e/eval-runner.ts"` to scripts)
- Create: `e2e/scenarios/example.json`
- Create: `e2e/fixtures/profiles/sample.md`

**Step 1: Add npm script**

Add to `"scripts"` in `package.json`:
```json
"eval": "tsx e2e/eval-runner.ts"
```

**Step 2: Create `e2e/scenarios/example.json`**

```json
{
  "name": "example-basic-assistant",
  "surface": "example",
  "tags": ["example"],
  "config": {},
  "fixtures": {},
  "conversation": [
    { "role": "user", "content": "Explain what a product-market fit is in 2-3 sentences." },
    { "role": "assistant", "evaluate": true }
  ],
  "dimensions": ["output-length"],
  "dimensionConfig": {
    "output-length": { "words": { "max": 100, "warn": 200 }, "sentences": { "max": 10, "warn": 20 } }
  }
}
```

**Step 3: Create `e2e/fixtures/profiles/sample.md`**

```markdown
# Sample Expertise Profile

This is a minimal fixture demonstrating the fixture format for eval scenarios.

## Domain Expertise
- Product strategy (depth: 8/10)
- Content marketing (depth: 7/10)
```

**Step 4: Test dry-run**

Run: `npm run eval -- --dry-run --scenario example`
Expected: Shows `example-basic-assistant [example]`

**Step 5: Commit**

```
git add package.json e2e/scenarios/example.json e2e/fixtures/profiles/sample.md
git commit -m "feat(eval): add npm eval script, example scenario, and sample fixture"
```

---

### ✅ Task 17: Build all fixture data files

**Files:**
- Create: `e2e/fixtures/sample-idea.json`
- Create: `e2e/fixtures/sample-analysis.json`
- Create: `e2e/fixtures/sample-seo-context-string.txt`
- Create: `e2e/fixtures/sample-analysis-context.json`
- Create: `e2e/fixtures/sample-content-context.json`
- Create: `e2e/fixtures/sample-foundation-docs.json`

All fixtures use SecondLook (AI-powered thrift store inventory analysis) as the representative product idea. Before writing each fixture, read the corresponding TypeScript interface to ensure field accuracy:

- `ProductIdea`: `src/types/index.ts:1-12`
- `ContentContext`: `src/lib/content-prompts.ts:3-27`
- Foundation chat context assembly: `src/app/api/foundation/[ideaId]/chat/route.ts:76-101`
- SEO scoring context format: `src/lib/research-agent.ts:381-424`

**Step 1: Create `e2e/fixtures/sample-idea.json`**

Must match `ProductIdea` interface. Include: `id`, `name`, `description`, `targetUser`, `problemSolved`, `url`, `createdAt`, `status`.

```json
{
  "id": "eval-secondlook",
  "name": "SecondLook",
  "description": "AI-powered inventory analysis tool for thrift store owners. Uses computer vision to identify, price, and categorize donations in real-time, reducing the manual sorting process from hours to minutes.",
  "targetUser": "Independent thrift store owners and managers processing 100+ donation items daily",
  "problemSolved": "Manual sorting and pricing of donated items is slow, inconsistent, and requires deep product knowledge that's hard to train.",
  "url": "https://secondlook.example.com",
  "createdAt": "2026-01-15T10:00:00.000Z",
  "status": "complete"
}
```

**Step 2: Create `e2e/fixtures/sample-analysis.json`**

Must include `scores` (matching `AnalysisScores` from `src/types/index.ts:14-21`), `summary`, `risks`, `competitors`, `topKeywords`, `serpValidated`, `contentStrategy`, `difficultyAssessment`, `expertiseProfile`.

```json
{
  "scores": { "seoOpportunity": 7, "competitiveLandscape": 6, "willingnessToPay": 8, "differentiationPotential": 7, "expertiseAlignment": 6, "overall": 7 },
  "summary": "SecondLook addresses a genuine pain point in thrift retail operations. AI-powered intake could significantly reduce labor costs while improving pricing accuracy.",
  "risks": ["CV accuracy for diverse thrift inventory may require extensive training data", "Thrift store owners are traditionally low-tech adopters", "Pricing data for secondhand items is highly regional and volatile", "Existing POS systems may add inventory AI features", "Customer acquisition cost may be high relative to subscription price"],
  "competitors": "**GoodSort** -- Manual sorting optimization SaaS ($49/mo), 200+ stores. No AI.\n**ThriftTech** -- POS with basic categorization. Checkout-focused.\n**Sortly** -- General inventory app. Not thrift-specific.\n**PoshAI** -- Reseller pricing tool for individuals, not retail ops.",
  "topKeywords": [
    { "keyword": "thrift store inventory management", "intentType": "informational", "estimatedVolume": "Medium", "estimatedCompetitiveness": "Low", "contentGapHypothesis": "No authoritative guides on modern thrift inventory workflows", "relevanceToMillionARR": "Direct buyer intent" },
    { "keyword": "AI pricing secondhand items", "intentType": "commercial", "estimatedVolume": "Low", "estimatedCompetitiveness": "Very Low", "contentGapHypothesis": "Emerging topic with minimal coverage", "relevanceToMillionARR": "Core product capability" },
    { "keyword": "donation processing efficiency", "intentType": "informational", "estimatedVolume": "Low", "estimatedCompetitiveness": "Low", "contentGapHypothesis": "Nonprofit and thrift operations underserved", "relevanceToMillionARR": "Adjacent use case" }
  ],
  "serpValidated": [
    { "keyword": "thrift store inventory management", "hasContentGap": true, "serpInsight": "Dominated by generic inventory articles", "peopleAlsoAsk": ["How do thrift stores organize inventory?", "What POS system do thrift stores use?"], "relatedSearches": ["thrift store software", "goodwill inventory system"] }
  ],
  "contentStrategy": { "topOpportunities": ["Comprehensive thrift store inventory guide", "AI pricing comparison for secondhand retail", "Donation processing benchmarks"], "recommendedAngle": "Position as the authority on modern thrift store operations." },
  "difficultyAssessment": { "dominantPlayers": ["Shopify Blog", "Square Guides"], "roomForNewEntrant": true, "reasoning": "Neither covers thrift-specific workflows." },
  "expertiseProfile": "## Expertise Profile\n\nDomain: Retail technology, inventory management, CV applications\nDepth: 7/10\nCredentials: Built 3 production CV systems, 2 years retail ops consulting"
}
```

**Step 3: Create `e2e/fixtures/sample-seo-context-string.txt`**

Format matches `buildSEOScoringContext()` output at `src/lib/research-agent.ts:381-424`:

```
Data sources: Claude Analysis, SERP Validation
Total keywords identified: 8 (Claude: 8, OpenAI: 0)

SERP Validated Keywords (1 of 3 validated):
Content gaps found: 1 of 1 (100%)
  - thrift store inventory management: GAP (No authoritative guides on modern thrift inventory workflows) [GREEN: underserved niche, no dominant authority]

Room for new entrant: Yes
Dominant players: Shopify Blog, Square Guides
```

**Step 4: Create `e2e/fixtures/sample-analysis-context.json`**

Mirrors what the foundation chat route builds at `src/app/api/foundation/[ideaId]/chat/route.ts:78-92`:

```json
{
  "ideaName": "SecondLook",
  "ideaDescription": "AI-powered inventory analysis tool for thrift store owners.",
  "targetUser": "Independent thrift store owners and managers processing 100+ donation items daily",
  "problemSolved": "Manual sorting and pricing of donated items is slow, inconsistent, and requires deep product knowledge.",
  "competitors": "**GoodSort** -- Manual sorting optimization SaaS ($49/mo), 200+ stores. No AI.\n**ThriftTech** -- POS with basic categorization.",
  "topKeywords": [
    { "keyword": "thrift store inventory management", "intentType": "informational", "estimatedCompetitiveness": "Low" },
    { "keyword": "AI pricing secondhand items", "intentType": "commercial", "estimatedCompetitiveness": "Very Low" },
    { "keyword": "donation processing efficiency", "intentType": "informational", "estimatedCompetitiveness": "Low" }
  ]
}
```

**Step 5: Create `e2e/fixtures/sample-content-context.json`**

Must match `ContentContext` interface at `src/lib/content-prompts.ts:3-27` exactly. Read the interface before writing. All 18+ fields. Empty arrays for `existingPieces`, `publishedPieces`, `rejectedPieces`.

```json
{
  "ideaName": "SecondLook",
  "ideaDescription": "AI-powered inventory analysis tool for thrift store owners. Uses computer vision to identify, price, and categorize donations in real-time.",
  "targetUser": "Independent thrift store owners and managers processing 100+ donation items daily",
  "problemSolved": "Manual sorting and pricing of donated items is slow, inconsistent, and requires deep product knowledge.",
  "url": "https://secondlook.example.com",
  "scores": { "seoOpportunity": 7, "competitiveLandscape": 6, "willingnessToPay": 8, "differentiationPotential": 7, "expertiseAlignment": 6, "overall": 7 },
  "summary": "SecondLook addresses a genuine pain point in thrift retail operations.",
  "risks": ["CV accuracy may require extensive training data", "Low-tech adopter base", "Regional pricing volatility"],
  "topKeywords": [
    { "keyword": "thrift store inventory management", "intentType": "informational", "estimatedVolume": "Medium", "estimatedCompetitiveness": "Low", "contentGapHypothesis": "No authoritative guides", "relevanceToMillionARR": "Direct buyer intent" },
    { "keyword": "AI pricing secondhand items", "intentType": "commercial", "estimatedVolume": "Low", "estimatedCompetitiveness": "Very Low", "contentGapHypothesis": "Emerging topic", "relevanceToMillionARR": "Core capability" }
  ],
  "serpValidated": [
    { "keyword": "thrift store inventory management", "hasContentGap": true, "serpInsight": "Generic inventory articles dominate", "peopleAlsoAsk": ["How do thrift stores organize inventory?"], "relatedSearches": ["thrift store software"] }
  ],
  "contentStrategy": { "topOpportunities": ["Thrift store inventory guide", "AI pricing comparison"], "recommendedAngle": "Authority on modern thrift store operations." },
  "difficultyAssessment": { "dominantPlayers": ["Shopify Blog", "Square Guides"], "roomForNewEntrant": true, "reasoning": "Neither covers thrift-specific workflows." },
  "competitors": "**GoodSort** -- Manual sorting SaaS ($49/mo).\n**ThriftTech** -- POS with basic categorization.",
  "expertiseProfile": "Domain: Retail technology, inventory management\nDepth: 7/10\nCredentials: Built 3 production CV systems",
  "existingPieces": [],
  "publishedPieces": [],
  "rejectedPieces": []
}
```

**Step 6: Create `e2e/fixtures/sample-foundation-docs.json`**

```json
{
  "strategy": {
    "type": "strategy",
    "content": "# SecondLook Strategy\n\n## Diagnosis\nThrift stores face a critical operational bottleneck: donated item intake requires identification, quality assessment, categorization, and pricing.\n\n## Guiding Policy\nBuild the definitive AI-powered intake system for secondhand retail, starting with clothing (highest volume).\n\n## Coherent Actions\n1. Launch with clothing categorization\n2. Price anchoring against eBay sold listings\n3. Partner with 5 pilot stores\n4. Expand to books and electronics in Q2",
    "lastUpdated": "2026-01-20T14:00:00.000Z"
  },
  "positioning": {
    "type": "positioning",
    "content": "# SecondLook Positioning\n\n## Category\nAI-powered inventory management for thrift retail\n\n## Competitive Alternatives\n- Manual sorting (status quo)\n- GoodSort (workflow optimization without AI)\n- Generic POS systems\n\n## Differentiators\n- Real-time CV identification (no manual data entry)\n- Regional pricing intelligence\n- Built for donation intake workflow",
    "lastUpdated": "2026-01-21T10:00:00.000Z"
  }
}
```

**Step 7: Commit**

```
git add e2e/fixtures/
git commit -m "feat(eval): add fixture data for all eval surfaces"
```

---

### ✅ Task 18: Prompt adapter -- advisor-chat surface

**Files:**
- Modify: `e2e/prompt-adapter.ts`

**Dependency:** Task 17 (fixtures). Tasks 18-21 all modify `e2e/prompt-adapter.ts` — execute sequentially.

> **TDD exception (Decision 5):** Tasks 18-21 do not include unit tests. The prompt adapter calls real production functions that read from disk. Testing is deferred to integration via `npm run eval -- --scenario <name>`. Error paths (e.g., unknown advisor ID) are exercised by the dry-run verification in Task 24.

This surface replicates system prompt assembly from `src/app/api/foundation/[ideaId]/chat/route.ts:59-119`. Read that file before implementing.

> **Note:** Production includes `last updated` timestamps in the foundation document headers. The fixture's `lastUpdated` field in `sample-foundation-docs.json` provides this data — use it in the header line when formatting foundation docs.

**Step 1: Add advisor-chat case before `default`**

```typescript
    case 'advisor-chat': {
      const { getAdvisorSystemPrompt } = await import('@/lib/advisors/prompt-loader');
      const advisorId = scenario.config.advisor as string;
      const docType = scenario.config.docType as string;
      const currentContent = (scenario.config.currentContent as string) || '';

      const advisorPrompt = getAdvisorSystemPrompt(advisorId);
      let contextSection = '';

      if (scenario.fixtures.analysis) {
        const ctx = loadFixture(scenario, 'analysis') as Record<string, unknown>;
        contextSection += '\nANALYSIS RESULTS:\n';
        contextSection += `Product: ${ctx.ideaName}\nDescription: ${ctx.ideaDescription}\n`;
        contextSection += `Target User: ${ctx.targetUser}\nProblem: ${ctx.problemSolved}\n`;
        if (ctx.competitors) contextSection += `\nCompetitors:\n${ctx.competitors}\n`;
        if (Array.isArray(ctx.topKeywords) && ctx.topKeywords.length > 0) {
          const kws = (ctx.topKeywords as Array<{ keyword: string; intentType: string; estimatedCompetitiveness: string }>).slice(0, 10);
          contextSection += `\nTop Keywords:\n${kws.map(k => `- ${k.keyword} (${k.intentType}, competition: ${k.estimatedCompetitiveness})`).join('\n')}\n`;
        }
      }

      if (scenario.fixtures.foundationDocs) {
        const docs = loadFixture(scenario, 'foundationDocs') as Record<string, { type: string; content: string; lastUpdated: string }>;
        contextSection += '\nRELATED FOUNDATION DOCUMENTS:\n';
        for (const doc of Object.values(docs)) {
          contextSection += `\n## ${doc.type.replace(/-/g, ' ').toUpperCase()} (last updated: ${doc.lastUpdated})\n${doc.content}\n`;
        }
      }

      const systemPrompt = `${advisorPrompt}\n\n---\n\nYou are helping the user refine their ${docType} document through conversation.\n${contextSection}\nCURRENT DOCUMENT (${docType.replace(/-/g, ' ')}):\n${currentContent}\n\nRULES:\n- When the user asks you to change the document, make ONLY the requested changes.\n- After making changes, include the full updated document between <updated_document> tags.\n- If the user asks a question without requesting changes, respond conversationally without tags.\n- Keep your conversational response brief.`;

      return { systemPrompt };
    }
```

**Step 2: Commit**

```
git add e2e/prompt-adapter.ts
git commit -m "feat(eval): add advisor-chat surface to prompt adapter"
```

---

### Task 19: Prompt adapter -- research-scoring surface

**Files:**
- Modify: `e2e/prompt-adapter.ts`

**Dependency:** Task 18 (sequential file modification).

This surface calls `createPrompt(idea, 'scoring', seoContext)` from `src/lib/research-agent-prompts.ts:37`. Production sends as user message with no system prompt (`src/lib/research-agent.ts:129-133`).

**Step 1: Add research-scoring case**

```typescript
    case 'research-scoring': {
      const { createPrompt } = await import('@/lib/research-agent-prompts');
      const idea = loadFixture(scenario, 'idea') as import('@/types').ProductIdea;
      const seoContext = scenario.fixtures.seoContext ? (loadFixture(scenario, 'seoContext') as string) : '';
      return { userMessage: createPrompt(idea, 'scoring', seoContext) };
    }
```

**Step 2: Commit**

```
git add e2e/prompt-adapter.ts
git commit -m "feat(eval): add research-scoring surface to prompt adapter"
```

---

### Task 20: Prompt adapter -- content-calendar surface

**Files:**
- Modify: `e2e/prompt-adapter.ts`

**Dependency:** Task 19 (sequential file modification).

This surface calls `buildCalendarPrompt(ctx)` from `src/lib/content-prompts.ts:62`. Production sends as user message with no system prompt (`src/lib/content-agent.ts:38-41`).

**Step 1: Add content-calendar case**

```typescript
    case 'content-calendar': {
      const { buildCalendarPrompt } = await import('@/lib/content-prompts');
      const ctx = loadFixture(scenario, 'contentContext') as import('@/lib/content-prompts').ContentContext;
      return { userMessage: buildCalendarPrompt(ctx) };
    }
```

**Step 2: Commit**

```
git add e2e/prompt-adapter.ts
git commit -m "feat(eval): add content-calendar surface to prompt adapter"
```

---

### Task 21: Prompt adapter -- framework-assembly surface

**Files:**
- Modify: `e2e/prompt-adapter.ts`

**Dependency:** Task 20 (sequential file modification).

Combines `getFrameworkPrompt(frameworkId)` + `getAdvisorSystemPrompt(advisorId)` as system prompt.

**Step 1: Add framework-assembly case**

```typescript
    case 'framework-assembly': {
      const { getAdvisorSystemPrompt } = await import('@/lib/advisors/prompt-loader');
      const { getFrameworkPrompt } = await import('@/lib/frameworks/framework-loader');
      const frameworkId = scenario.config.framework as string;
      const advisorId = scenario.config.advisor as string;
      const frameworkPrompt = getFrameworkPrompt(frameworkId);
      if (!frameworkPrompt) throw new Error(`Framework not found: ${frameworkId}`);
      return { systemPrompt: `${getAdvisorSystemPrompt(advisorId)}\n\n---\n\n${frameworkPrompt}` };
    }
```

**Step 2: Commit**

```
git add e2e/prompt-adapter.ts
git commit -m "feat(eval): add framework-assembly surface to prompt adapter"
```

---

### Task 22: scoring-accuracy dimension + add to registry (TDD)

**Files:**
- Create: `e2e/dimensions/__tests__/scoring-accuracy.test.ts`
- Create: `e2e/dimensions/scoring-accuracy.ts`
- Modify: `e2e/dimensions/index.ts`
- Modify: `e2e/dimensions/__tests__/registry.test.ts`

**Dependency:** Task 13 must be complete (registry + registry tests exist to modify).

The heuristic parses research agent scoring output (format at `src/lib/research-agent-prompts.ts:148-194`). Checks 5 dimensions, score range 1-10, recommendation tier, and confidence level.

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { scoringAccuracy } from '../scoring-accuracy';
import type { EvalScenario } from '../../types';

const base: EvalScenario = { name: 'test', surface: 'research-scoring', tags: [], config: {}, fixtures: {}, conversation: [], dimensions: [] };

const valid = `ONE-LINE SUMMARY: SecondLook is an AI-powered thrift inventory tool.

| Dimension | Score | Evidence-Based Reasoning |
|-----------|-------|--------------------------|
| SEO Opportunity | 7/10 | Low competition in thrift niche |
| Competitive Landscape | 6/10 | Few direct competitors |
| Willingness to Pay | 8/10 | Stores already pay for POS |
| Differentiation Potential | 7/10 | Unique CV approach |
| Expertise Alignment | 6/10 | Strong technical, moderate domain |

OVERALL RECOMMENDATION: Tier 2
CONFIDENCE: Medium

KEY RISKS:
- Training data acquisition
- Low-tech adopter base`;

describe('scoring-accuracy', () => {
  it('has correct name', () => { expect(scoringAccuracy.name).toBe('scoring-accuracy'); });
  it('passes for valid output', () => { expect(scoringAccuracy.heuristic(valid, base).result).toBe('pass'); });

  it('fails when dimension missing', () => {
    const r = scoringAccuracy.heuristic(valid.replace(/\| Expertise Alignment[^\n]*\n/, ''), base);
    expect(r.result).toBe('fail');
    expect(r.details?.some(d => d.includes('Expertise Alignment'))).toBe(true);
  });

  it('fails for out-of-range score', () => {
    const r = scoringAccuracy.heuristic(valid.replace('7/10 | Low competition', '15/10 | Low competition'), base);
    expect(r.result).toBe('fail');
  });

  it('fails when recommendation missing', () => {
    expect(scoringAccuracy.heuristic(valid.replace(/OVERALL RECOMMENDATION:[^\n]*/, ''), base).result).toBe('fail');
  });

  it('fails when confidence missing', () => {
    expect(scoringAccuracy.heuristic(valid.replace(/CONFIDENCE:[^\n]*/, ''), base).result).toBe('fail');
  });

  it('accepts all valid tiers', () => {
    for (const t of ['Tier 1', 'Tier 2', 'Tier 3']) {
      expect(scoringAccuracy.heuristic(valid.replace('Tier 2', t), base).result).toBe('pass');
    }
  });

  it('accepts all valid confidence levels', () => {
    for (const c of ['High', 'Medium', 'Low']) {
      expect(scoringAccuracy.heuristic(valid.replace('CONFIDENCE: Medium', `CONFIDENCE: ${c}`), base).result).toBe('pass');
    }
  });
});
```

**Step 2: Run test to verify it fails, then write implementation**

```typescript
import type { DimensionDefinition, EvalScenario, HeuristicResult } from '../types';

const DIMS = ['SEO Opportunity', 'Competitive Landscape', 'Willingness to Pay', 'Differentiation Potential', 'Expertise Alignment'];

export const scoringAccuracy: DimensionDefinition = {
  name: 'scoring-accuracy',
  description: 'Validates research agent scoring output structure.',
  judgeRubric: 'Are the individual dimension scores defensible? Is the recommendation tier consistent with scores? Score 1-5.',
  heuristic(response: string): HeuristicResult {
    const details: string[] = [];
    for (const dim of DIMS) {
      const m = response.match(new RegExp(`\\|\\s*${dim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|\\s*(\\d+)/10`, 'i'));
      if (!m) { details.push(`Missing dimension: ${dim}`); }
      else { const s = parseInt(m[1], 10); if (s < 1 || s > 10) details.push(`${dim}: score ${s} out of range 1-10`); }
    }
    if (!response.match(/OVERALL RECOMMENDATION:\s*Tier\s*[123]/i)) details.push('Missing or invalid OVERALL RECOMMENDATION');
    if (!response.match(/CONFIDENCE:\s*(High|Medium|Low)/i)) details.push('Missing CONFIDENCE');
    return details.length > 0 ? { result: 'fail', details } : { result: 'pass' };
  },
};
```

**Step 3: Run tests, then add to registry**

Add to `e2e/dimensions/index.ts`:
```typescript
import { scoringAccuracy } from './scoring-accuracy';
```
And add `[scoringAccuracy.name, scoringAccuracy]` to the Map.

Update `e2e/dimensions/__tests__/registry.test.ts`: change `toBe(4)` to `toBe(5)` and add a test for `'scoring-accuracy'`.

Run: `npm test -- e2e/`
Expected: PASS (all tests)

**Step 4: Commit**

```
git add e2e/dimensions/scoring-accuracy.ts e2e/dimensions/__tests__/scoring-accuracy.test.ts e2e/dimensions/index.ts e2e/dimensions/__tests__/registry.test.ts
git commit -m "feat(eval): add scoring-accuracy dimension for research agent validation"
```

---

### Task 23: Write all 6 scenario files

**Files:**
- Create: `e2e/scenarios/richard-rumelt-foundation-chat.json`
- Create: `e2e/scenarios/april-dunford-foundation-chat.json`
- Create: `e2e/scenarios/seo-expert-foundation-chat.json`
- Create: `e2e/scenarios/research-scoring-full.json`
- Create: `e2e/scenarios/content-calendar-generation.json`
- Create: `e2e/scenarios/value-metric-framework-assembly.json`

See design doc lines 278-333 for the scenario matrix and surface-specific notes. Each scenario JSON must include: `name`, `surface`, `tags`, `config`, `fixtures`, `conversation`, `dimensions`, `dimensionConfig`.

Key surface-specific notes:
- **advisor-chat**: `config` needs `advisor` (advisor ID), `docType`, `currentContent`. `fixtures` needs `analysis` and `foundationDocs`. DOC_ADVISOR_MAP at `src/lib/agent-tools/foundation.ts:15-22`: strategy=seth-godin, positioning=april-dunford, design-principles=richard-rumelt, seo-strategy=seo-expert.
- **research-scoring**: `fixtures` needs `idea` and `seoContext`. No `config` needed. Note: the scoring response is markdown (not JSON), so do NOT include `structured-output` dimension.
- **content-calendar**: `fixtures` needs `contentContext`. Response should be JSON with `strategySummary` and `pieces` fields.
- **framework-assembly**: `config` needs `advisor` and `framework`. No fixtures needed (reads prompts from disk). Available frameworks: `value-metric`, `forever-promise`, `content-inc-model`, `smallest-viable-audience`, `landing-page-assembly`.

Write all 6 scenario JSON files per the design doc specification. For voice dimension config, include `antiPatterns` (generic phrases the advisor should NOT use) and `signaturePhrases` (characteristic terms for the judge context).

> **Design doc errata:** The scenario table (line 285) lists `structured-output` as a dimension for `research-scoring-full`. The adapter notes (line 311) correctly say NOT to include it because the scoring response is markdown, not JSON. **Exclude `structured-output` from `research-scoring-full`** — the adapter notes take precedence.

**Step 1: Write `e2e/scenarios/richard-rumelt-foundation-chat.json`**

```json
{
  "name": "richard-rumelt-foundation-chat",
  "surface": "advisor-chat",
  "tags": ["advisor", "foundation"],
  "config": {
    "advisor": "richard-rumelt",
    "docType": "design-principles",
    "currentContent": "# SecondLook Design Principles\n\n## Core Principles\n1. Speed over perfection — fast intake matters more than perfect categorization\n2. Learn from corrections — every manual override trains the model\n3. Regional intelligence — pricing must reflect local market conditions"
  },
  "fixtures": {
    "analysis": "sample-analysis-context.json",
    "foundationDocs": "sample-foundation-docs.json"
  },
  "conversation": [
    { "role": "user", "content": "I think principle #1 is too dismissive of quality. Can you help me reframe it to balance speed AND accuracy?" },
    { "role": "assistant", "evaluate": true }
  ],
  "dimensions": ["voice", "output-length"],
  "dimensionConfig": {
    "voice": {
      "antiPatterns": ["synergy", "leverage", "best-in-class", "game-changer", "revolutionary"],
      "signaturePhrases": ["diagnosis", "guiding policy", "coherent action", "kernel", "proximate objectives", "bad strategy"]
    }
  }
}
```

**Step 2: Write `e2e/scenarios/april-dunford-foundation-chat.json`**

```json
{
  "name": "april-dunford-foundation-chat",
  "surface": "advisor-chat",
  "tags": ["advisor", "foundation"],
  "config": {
    "advisor": "april-dunford",
    "docType": "positioning",
    "currentContent": "# SecondLook Positioning\n\n## Category\nAI-powered inventory management for thrift retail\n\n## Competitive Alternatives\n- Manual sorting (status quo)\n- GoodSort (workflow optimization without AI)\n- Generic POS systems"
  },
  "fixtures": {
    "analysis": "sample-analysis-context.json",
    "foundationDocs": "sample-foundation-docs.json"
  },
  "conversation": [
    { "role": "user", "content": "Our competitive alternatives section feels incomplete. What are we missing and how should we think about framing our category?" },
    { "role": "assistant", "evaluate": true }
  ],
  "dimensions": ["voice", "output-length"],
  "dimensionConfig": {
    "voice": {
      "antiPatterns": ["disrupt", "innovative solution", "cutting-edge", "world-class"],
      "signaturePhrases": ["competitive alternatives", "market category", "differentiated value", "best customer", "positioning"]
    }
  }
}
```

**Step 3: Write `e2e/scenarios/seo-expert-foundation-chat.json`**

```json
{
  "name": "seo-expert-foundation-chat",
  "surface": "advisor-chat",
  "tags": ["advisor", "foundation"],
  "config": {
    "advisor": "seo-expert",
    "docType": "seo-strategy",
    "currentContent": "# SecondLook SEO Strategy\n\n## Target Keywords\n- thrift store inventory management\n- AI pricing secondhand items\n\n## Content Pillars\n1. Thrift store operations guides\n2. Pricing intelligence articles"
  },
  "fixtures": {
    "analysis": "sample-analysis-context.json",
    "foundationDocs": "sample-foundation-docs.json"
  },
  "conversation": [
    { "role": "user", "content": "Should we be targeting broader inventory management keywords or stay focused on thrift-specific terms?" },
    { "role": "assistant", "evaluate": true }
  ],
  "dimensions": ["voice", "output-length"],
  "dimensionConfig": {
    "voice": {
      "antiPatterns": ["amazing results", "skyrocket your traffic", "guaranteed rankings", "secret trick"],
      "signaturePhrases": ["search intent", "content gap", "SERP", "topical authority", "long-tail", "domain authority"]
    }
  }
}
```

**Step 4: Write `e2e/scenarios/research-scoring-full.json`**

```json
{
  "name": "research-scoring-full",
  "surface": "research-scoring",
  "tags": ["research"],
  "config": {},
  "fixtures": {
    "idea": "sample-idea.json",
    "seoContext": "sample-seo-context-string.txt"
  },
  "conversation": [
    { "role": "assistant", "evaluate": true }
  ],
  "dimensions": ["scoring-accuracy"],
  "dimensionConfig": {}
}
```

> Note: `structured-output` is excluded — research scoring output is markdown, not JSON.

**Step 5: Write `e2e/scenarios/content-calendar-generation.json`**

```json
{
  "name": "content-calendar-generation",
  "surface": "content-calendar",
  "tags": ["content"],
  "config": {},
  "fixtures": {
    "contentContext": "sample-content-context.json"
  },
  "conversation": [
    { "role": "assistant", "evaluate": true }
  ],
  "dimensions": ["structured-output"],
  "dimensionConfig": {
    "structured-output": {
      "requiredFields": ["strategySummary", "pieces"]
    }
  }
}
```

**Step 6: Write `e2e/scenarios/value-metric-framework-assembly.json`**

```json
{
  "name": "value-metric-framework-assembly",
  "surface": "framework-assembly",
  "tags": ["framework", "advisor"],
  "config": {
    "advisor": "patrick-campbell",
    "framework": "value-metric"
  },
  "fixtures": {},
  "conversation": [
    { "role": "user", "content": "Help me identify the right value metric for SecondLook, our AI-powered thrift store inventory tool." },
    { "role": "assistant", "evaluate": true }
  ],
  "dimensions": ["voice", "instruction-following"],
  "dimensionConfig": {
    "voice": {
      "antiPatterns": ["game-changer", "revolutionary", "best-in-class", "synergy"],
      "signaturePhrases": ["value metric", "willingness to pay", "price sensitivity", "monetization", "feature differentiation"]
    }
  }
}
```

**Step 7: Commit**

```
git add e2e/scenarios/
git commit -m "feat(eval): add 6 initial eval scenarios for all surfaces"
```

---

### Task 24: Dry-run and integration verification

**Step 1: Run dry-run with all scenarios**

Run: `npm run eval -- --dry-run --all`
Expected: Lists 7 scenarios (1 example + 6 project-specific) without errors.

**Step 2: Run dry-run with tag filter**

Run: `npm run eval -- --dry-run --tag advisor`
Expected: Lists 3 advisor scenarios.

**Step 3: Run all eval unit tests**

Run: `npm test -- e2e/`
Expected: PASS

**Step 4: Run the example scenario live**

Run: `npm run eval -- --scenario example`
Expected: Scenario runs, generates a response, scores output-length dimension, prints PASS/WARN/FAIL, writes to eval-log.jsonl.

**Step 5: Verify eval log is gitignored**

Run: `git status` — `e2e/eval-log.jsonl` should NOT appear.

**Step 6: Commit if fixes needed**

```
git add e2e/
git commit -m "fix(eval): address integration verification issues"
```

---

## Manual Steps (Post-Automation)

> Complete these after all automated tasks finish.

- [ ] Run full eval suite: `npm run eval -- --all`. The example scenario should pass. Project-specific scenarios may need tuning — use `/aligned:eval-failure-triage` to classify failures.
- [ ] Run `/aligned:eval-audit` to record the first eval coverage baseline.

---

## Decision Log

### Summary

| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Plan scope | epch-projects only | Include kickstart skill update |
| 2 | Env loading | dotenv import | Node --env-file flag |
| 3 | Dimension registry | Explicit imports | Auto-discovery via readdirSync |
| 4 | Fixture data | Synthetic from interfaces | Export real data from Redis |
| 5 | Prompt adapter testing | Integration via eval run | Unit tests with mocked imports |

### Appendix: Decision Details

#### Decision 1: Scope limited to epch-projects instantiation
**Chose:** Build eval infrastructure directly in epch-projects. Skip kickstart skill update.
**Why:** The kickstart skill lives in `~/.claude/` (a different git repo). The writing-plans cross-repo guard prohibits writing plans for repo B into repo A. The two deliverables are independent. Building directly is faster and the kickstart update can extract patterns from this implementation later.
**Alternatives rejected:**
- Include kickstart update: Violates cross-repo guard, adds coordination overhead.

#### Decision 2: dotenv for environment loading
**Chose:** `import { config } from 'dotenv'; config({ path: '.env.local' });` at top of eval-runner.ts.
**Why:** The writing-plans skill recommends this for standalone scripts. `tsx` does not load `.env.local` automatically. dotenv is explicit and reliable regardless of `.env.local` format.
**Alternatives rejected:**
- `node --env-file`: Next.js `.env.local` files don't use `export` syntax, so shell-based alternatives fail.

#### Decision 3: Explicit imports for dimension registry
**Chose:** Each dimension explicitly imported and registered in `dimensions/index.ts`.
**Why:** Simpler, type-checked, testable without filesystem mocking. Adding a new dimension is a 2-line change (import + Map entry).
**Alternatives rejected:**
- Auto-discovery via `readdirSync`: Loses type safety, harder to test, masks registration errors.

#### Decision 4: Synthetic fixture data
**Chose:** Construct fixtures from TypeScript interfaces using synthetic SecondLook data.
**Why:** Fixtures match interface shapes exactly, are version-controlled, portable, and designed to exercise threshold boundaries.
**Alternatives rejected:**
- Redis export: Couples to live data, harder to reproduce, includes noise.

#### Decision 5: No unit tests for prompt adapter (explicit TDD exception)
**Chose:** Test via running eval scenarios end-to-end.
**Why:** The adapter is a thin integration layer that calls real production functions (`getAdvisorSystemPrompt`, `createPrompt`, `buildCalendarPrompt`, `getFrameworkPrompt`). These functions read from disk at runtime. Unit tests would either mock the disk reads (defeating the purpose of testing real prompt assembly) or require the real filesystem (making them integration tests). The eval scenario dry-run and live-run in Task 24 serves as the integration test. This is a deliberate exception to the TDD-first pattern documented in CLAUDE.md.
**Alternatives rejected:**
- Dedicated unit tests with mocked imports: Adds test code without testing what matters (real prompt assembly). The existing production functions already have no unit tests themselves (they're filesystem-dependent loaders), so adapter unit tests would mock-on-mock.
