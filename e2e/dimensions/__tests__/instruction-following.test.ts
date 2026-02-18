import { describe, it, expect } from 'vitest';
import { instructionFollowing } from '../instruction-following';
import type { EvalScenario } from '../../types';

const base: EvalScenario = { name: 'test', surface: 'test', tags: [], config: {}, fixtures: {}, conversation: [], dimensions: [] };

describe('instruction-following', () => {
  it('has correct name', () => { expect(instructionFollowing.name).toBe('instruction-following'); });
  it('heuristic returns n/a', () => { expect(instructionFollowing.heuristic('Any.', base).result).toBe('n/a'); });
  it('has a judgeRubric', () => { expect(instructionFollowing.judgeRubric).toBeTruthy(); });
});
