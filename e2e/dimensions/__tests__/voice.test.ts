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
