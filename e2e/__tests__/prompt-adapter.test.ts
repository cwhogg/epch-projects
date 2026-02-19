import { describe, it, expect } from 'vitest';
import { loadFixture } from '../prompt-adapter';
import type { EvalScenario } from '../types';

function makeScenario(fixtures: Record<string, string>): EvalScenario {
  return {
    name: 'test', surface: 'test', tags: [], config: {},
    fixtures, conversation: [], dimensions: [],
  };
}

describe('loadFixture', () => {
  it('loads a JSON fixture from e2e/fixtures/', () => {
    const scenario = makeScenario({ idea: 'sample-idea.json' });
    const result = loadFixture(scenario, 'idea') as Record<string, unknown>;
    expect(result).toHaveProperty('name', 'SecondLook');
  });

  it('loads a text fixture from e2e/fixtures/', () => {
    const scenario = makeScenario({ seo: 'sample-seo-context-string.txt' });
    const result = loadFixture(scenario, 'seo');
    expect(typeof result).toBe('string');
  });

  it('throws for missing fixture key', () => {
    const scenario = makeScenario({});
    expect(() => loadFixture(scenario, 'missing')).toThrow(/not found/i);
  });

  it('throws for nonexistent fixture file', () => {
    const scenario = makeScenario({ bad: 'does-not-exist.json' });
    expect(() => loadFixture(scenario, 'bad')).toThrow();
  });
});
