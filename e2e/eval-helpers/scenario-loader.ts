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
