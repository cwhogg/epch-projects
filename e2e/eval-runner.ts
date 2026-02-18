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
    scenarios = [loadScenario(values.scenario as string)];
    trigger = 'manual'; scopeReason = `--scenario ${values.scenario}`;
  } else if (values.tag) {
    scenarios = loadAllScenarios().filter(s => s.tags.includes(values.tag as string));
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
