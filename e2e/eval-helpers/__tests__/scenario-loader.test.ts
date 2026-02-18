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
