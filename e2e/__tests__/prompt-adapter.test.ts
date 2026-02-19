import { describe, it, expect } from 'vitest';
import { loadFixture, buildPromptForScenario } from '../prompt-adapter';
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

describe('buildPromptForScenario', () => {
  describe('website-chat surface', () => {
    const scenario: EvalScenario = {
      name: 'test-website-chat',
      surface: 'website-chat',
      tags: ['website-chat'],
      config: { mode: 'autonomous' },
      fixtures: {
        analysis: 'sample-analysis-context.json',
        foundationDocs: 'sample-foundation-docs.json',
      },
      conversation: [
        { role: 'user', content: 'Continue. Now work on stage 2: Write Hero.' },
        { role: 'assistant', evaluate: true },
      ],
      dimensions: ['instruction-following'],
    };

    it('returns system prompt with autonomous mode instruction', async () => {
      const result = await buildPromptForScenario(scenario);
      expect(result.systemPrompt).toContain('Complete ONLY the current stage');
    });

    it('includes advisor roster', async () => {
      const result = await buildPromptForScenario(scenario);
      expect(result.systemPrompt).toContain('Available Advisors for Consultation');
    });

    it('includes foundation documents from fixture', async () => {
      const result = await buildPromptForScenario(scenario);
      expect(result.systemPrompt).toContain('SecondLook Strategy');
    });

    it('includes content quality rules', async () => {
      const result = await buildPromptForScenario(scenario);
      expect(result.systemPrompt).toContain('Never suggest, request, or generate social proof');
    });

    it('uses interactive mode instruction when config.mode is interactive', async () => {
      const interactiveScenario = {
        ...scenario,
        config: { mode: 'interactive' },
      };
      const result = await buildPromptForScenario(interactiveScenario);
      expect(result.systemPrompt).toContain('Mode: Interactive');
      expect(result.systemPrompt).not.toContain('Complete ONLY the current stage');
    });
  });
});
