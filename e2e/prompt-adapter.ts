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
