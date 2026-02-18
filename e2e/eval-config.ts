import type { SurfacePattern } from './types';

export const EVAL_CONFIG = {
  defaultModel: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  judgeModel: 'claude-haiku-4-5-20251001',
  judgeThresholds: {
    pass: 4,  // >= 4
    warn: 3,  // == 3
    // < 3 = fail
  },
  outputLength: {
    words: { max: 500, warn: 800 },
    sentences: { max: 30, warn: 50 },
    paragraphs: { max: 10, warn: 15 },
  },
  llmSurfacePatterns: [
    { glob: 'src/lib/advisors/prompts/*.md', tags: ['advisor'] },
    { glob: 'src/lib/frameworks/prompts/*/prompt.md', tags: ['framework'] },
    { glob: 'src/lib/research-agent-prompts.ts', tags: ['research'] },
    { glob: 'src/lib/content-prompts.ts', tags: ['content'] },
    { glob: 'src/lib/painted-door-prompts.ts', tags: ['painted-door'] },
    { glob: 'src/lib/agent-tools/*.ts', tags: ['agent-tools'] },
    { glob: 'src/lib/expertise-profile.ts', tags: ['research'] },
    { glob: 'src/lib/seo-knowledge.ts', tags: ['research', 'seo'] },
    { glob: 'src/lib/critique-service.ts', tags: ['content'] },
    { glob: 'src/lib/frameworks/framework-loader.ts', tags: ['framework'] },
  ] as SurfacePattern[],
};
