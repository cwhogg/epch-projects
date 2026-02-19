import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EvalScenario, SurfacePattern } from '../../types';

// Mock child_process for getChangedFiles tests
const { mockExecSync } = vi.hoisted(() => ({ mockExecSync: vi.fn() }));
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, default: { ...actual, execSync: mockExecSync }, execSync: mockExecSync };
});

import { getTriggeredTags, filterScenariosByTags, getChangedFiles } from '../trigger';

const patterns: SurfacePattern[] = [
  { glob: 'src/lib/advisors/prompts/*.md', tags: ['advisor'] },
  { glob: 'src/lib/frameworks/prompts/*/prompt.md', tags: ['framework'] },
  { glob: 'src/lib/research-agent-prompts.ts', tags: ['research'] },
  { glob: 'src/lib/content-prompts.ts', tags: ['content'] },
  { glob: 'src/app/api/painted-door/*/chat/route.ts', tags: ['website-chat', 'painted-door'] },
  { glob: 'src/app/api/foundation/*/chat/route.ts', tags: ['foundation'] },
  { glob: 'src/lib/seo-analysis.ts', tags: ['research', 'seo'] },
  { glob: 'src/lib/content-agent-v2.ts', tags: ['content'] },
  { glob: 'src/lib/foundation-agent.ts', tags: ['foundation'] },
  { glob: 'src/lib/content-critique-agent.ts', tags: ['content'] },
  { glob: 'src/lib/analytics-agent.ts', tags: ['analytics'] },
  { glob: 'src/lib/validation-canvas.ts', tags: ['validation'] },
  { glob: 'src/lib/content-recipes.ts', tags: ['content'] },
  { glob: 'src/lib/painted-door-agent.ts', tags: ['painted-door'] },
];

function makeScenario(name: string, tags: string[]): EvalScenario {
  return { name, surface: 'test', tags, config: {}, fixtures: {}, conversation: [], dimensions: [] };
}

describe('getTriggeredTags', () => {
  it('matches advisor prompt changes', () => {
    expect(getTriggeredTags(['src/lib/advisors/prompts/richard-rumelt.md'], patterns)).toContain('advisor');
  });

  it('matches framework prompt changes', () => {
    expect(getTriggeredTags(['src/lib/frameworks/prompts/value-metric/prompt.md'], patterns)).toContain('framework');
  });

  it('matches exact file paths', () => {
    expect(getTriggeredTags(['src/lib/research-agent-prompts.ts'], patterns)).toContain('research');
  });

  it('returns empty for unmatched files', () => {
    expect(getTriggeredTags(['src/app/page.tsx'], patterns)).toHaveLength(0);
  });

  it('deduplicates tags', () => {
    const tags = getTriggeredTags([
      'src/lib/advisors/prompts/a.md',
      'src/lib/advisors/prompts/b.md',
    ], patterns);
    expect(tags.filter(t => t === 'advisor')).toHaveLength(1);
  });

  it('collects tags from multiple patterns', () => {
    const tags = getTriggeredTags([
      'src/lib/advisors/prompts/a.md',
      'src/lib/content-prompts.ts',
    ], patterns);
    expect(tags).toContain('advisor');
    expect(tags).toContain('content');
  });

  it('matches website builder chat route', () => {
    expect(getTriggeredTags(
      ['src/app/api/painted-door/abc/chat/route.ts'],
      patterns
    )).toContain('website-chat');
  });

  it('matches foundation chat route', () => {
    expect(getTriggeredTags(
      ['src/app/api/foundation/abc/chat/route.ts'],
      patterns
    )).toContain('foundation');
  });
});

describe('filterScenariosByTags', () => {
  const scenarios = [
    makeScenario('a', ['advisor']),
    makeScenario('f', ['framework']),
    makeScenario('w', ['*']),
  ];

  it('filters matching tags', () => {
    const result = filterScenariosByTags(scenarios, ['advisor']);
    expect(result.map(s => s.name)).toContain('a');
    expect(result.map(s => s.name)).not.toContain('f');
  });

  it('includes wildcard scenarios', () => {
    expect(filterScenariosByTags(scenarios, ['advisor']).map(s => s.name)).toContain('w');
  });

  it('returns empty when no tags triggered', () => {
    expect(filterScenariosByTags(scenarios, [])).toHaveLength(0);
  });
});

describe('getChangedFiles', () => {
  beforeEach(() => { mockExecSync.mockReset(); });

  it('returns changed files from git diff', () => {
    mockExecSync.mockReturnValue('src/lib/test.ts\nREADME.md\n');
    expect(getChangedFiles()).toEqual(['src/lib/test.ts', 'README.md']);
  });

  it('returns empty array when no changes', () => {
    mockExecSync.mockReturnValue('');
    expect(getChangedFiles()).toEqual([]);
  });

  it('returns empty array when git command fails', () => {
    mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });
    expect(getChangedFiles()).toEqual([]);
  });
});
