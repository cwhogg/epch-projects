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
