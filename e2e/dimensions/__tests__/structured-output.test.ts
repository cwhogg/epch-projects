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
