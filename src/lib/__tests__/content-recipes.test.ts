import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({ messages: { create: mockCreate } }),
}));

vi.mock('@/lib/config', () => ({
  CLAUDE_MODEL: 'claude-test-model',
}));

import { selectCritics, recipes } from '@/lib/content-recipes';
import type { AdvisorEntry } from '@/lib/advisors/registry';

const testRegistry: AdvisorEntry[] = [
  { id: 'richard-rumelt', name: 'Richard Rumelt', role: 'strategist' },
  { id: 'copywriter', name: 'Brand Copywriter', role: 'author' },
  {
    id: 'april-dunford',
    name: 'April Dunford',
    role: 'strategist',
    evaluationExpertise: 'Evaluates positioning accuracy.',
    doesNotEvaluate: 'Does not evaluate SEO.',
    contextDocs: ['positioning', 'strategy'],
  },
  {
    id: 'seo-expert',
    name: 'SEO Expert',
    role: 'critic',
    evaluationExpertise: 'Evaluates SEO performance.',
    doesNotEvaluate: 'Does not evaluate brand positioning.',
    contextDocs: ['seo-strategy'],
  },
  {
    id: 'shirin-oreizy',
    name: 'Shirin Oreizy',
    role: 'critic',
    evaluationExpertise: 'Evaluates behavioral science.',
    doesNotEvaluate: 'Does not evaluate SEO.',
    contextDocs: [],
  },
  {
    id: 'julian-shapiro',
    name: 'Julian Shapiro',
    role: 'author',
    evaluationExpertise: 'Evaluates landing page copy structure.',
  },
];

describe('selectCritics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns advisors matching LLM selection', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '["april-dunford", "seo-expert"]' }],
    });

    const result = await selectCritics(recipes.website, testRegistry);

    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual(['april-dunford', 'seo-expert']);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('excludes the recipe author from candidates', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '["april-dunford"]' }],
    });

    await selectCritics(recipes.website, testRegistry);

    const callArgs = mockCreate.mock.calls[0][0];
    const userMessage = callArgs.messages[0].content;
    // julian-shapiro has evaluationExpertise but is the author — should be excluded
    expect(userMessage).not.toContain('- julian-shapiro:');
    // april-dunford should still be there as a candidate
    expect(userMessage).toContain('- april-dunford:');
  });

  it('returns empty array when no advisors have evaluationExpertise', async () => {
    const noExpertise: AdvisorEntry[] = [
      { id: 'richard-rumelt', name: 'Richard Rumelt', role: 'strategist' },
      { id: 'copywriter', name: 'Brand Copywriter', role: 'author' },
    ];

    const result = await selectCritics(recipes.website, noExpertise);

    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns empty array when registry is empty', async () => {
    const result = await selectCritics(recipes.website, []);

    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('throws when LLM returns malformed JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json at all' }],
    });

    await expect(selectCritics(recipes.website, testRegistry)).rejects.toThrow(
      'Critic selection failed',
    );
  });

  it('throws when LLM API call fails', async () => {
    mockCreate.mockRejectedValue(new Error('API rate limit'));

    await expect(selectCritics(recipes.website, testRegistry)).rejects.toThrow(
      'API rate limit',
    );
  });

  it('handles LLM response wrapped in markdown code fence', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '```json\n["april-dunford", "shirin-oreizy"]\n```',
        },
      ],
    });

    const result = await selectCritics(recipes.website, testRegistry);

    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual([
      'april-dunford',
      'shirin-oreizy',
    ]);
  });

  it('filters out IDs returned by LLM that are not in candidates', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: '["april-dunford", "nonexistent-advisor"]' },
      ],
    });

    const result = await selectCritics(recipes.website, testRegistry);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('april-dunford');
  });
});

describe('recipes', () => {
  it('website recipe has correct structure', () => {
    const r = recipes.website;
    expect(r.contentType).toBe('website');
    expect(r.authorAdvisor).toBe('julian-shapiro');
    expect(r.authorFramework).toBe('landing-page-assembly');
    expect(r.authorContextDocs).toContain('positioning');
    expect(r.namedCritics).toEqual([
      'oli-gardner',
      'joanna-wiebe',
      'shirin-oreizy',
      'copywriter',
    ]);
    expect(r.evaluationNeeds).toContain('conversion-centered design');
    expect(r.evaluationEmphasis).toBeTruthy();
    expect(r.minAggregateScore).toBe(4);
    expect(r.maxRevisionRounds).toBe(3);
  });

  it('all three recipes are defined', () => {
    expect(Object.keys(recipes)).toEqual(['website', 'blog-post', 'social-post']);
  });
});
