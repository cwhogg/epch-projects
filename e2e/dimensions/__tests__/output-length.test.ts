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
