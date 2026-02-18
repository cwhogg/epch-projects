import { describe, it, expect } from 'vitest';
import { getDimension, getAllDimensions } from '../index';

describe('dimension registry', () => {
  it('registers all 5 dimensions', () => { expect(getAllDimensions().size).toBe(5); });
  it('retrieves output-length', () => { expect(getDimension('output-length')).toBeDefined(); });
  it('retrieves instruction-following', () => { expect(getDimension('instruction-following')).toBeDefined(); });
  it('retrieves voice', () => { expect(getDimension('voice')).toBeDefined(); });
  it('retrieves structured-output', () => { expect(getDimension('structured-output')).toBeDefined(); });
  it('retrieves scoring-accuracy', () => { expect(getDimension('scoring-accuracy')).toBeDefined(); });
  it('returns undefined for unknown', () => { expect(getDimension('nope')).toBeUndefined(); });
  it('every dimension has required fields', () => {
    for (const [, dim] of getAllDimensions()) {
      expect(dim.name).toBeTruthy();
      expect(typeof dim.heuristic).toBe('function');
      expect(dim.judgeRubric).toBeTruthy();
    }
  });
});
