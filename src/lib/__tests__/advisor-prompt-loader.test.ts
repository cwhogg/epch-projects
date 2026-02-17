import { describe, it, expect, beforeEach } from 'vitest';
import { getAdvisorSystemPrompt, clearAdvisorCache } from '@/lib/advisors/prompt-loader';
import { advisorRegistry } from '@/lib/advisors/registry';

describe('Advisor prompt loader', () => {
  beforeEach(() => {
    clearAdvisorCache();
  });

  it('loads Richard Rumelt prompt', () => {
    const prompt = getAdvisorSystemPrompt('richard-rumelt');
    expect(prompt).toContain('Richard Rumelt');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('loads April Dunford prompt', () => {
    const prompt = getAdvisorSystemPrompt('april-dunford');
    expect(prompt).toContain('April Dunford');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('loads Copywriter prompt', () => {
    const prompt = getAdvisorSystemPrompt('copywriter');
    expect(prompt).toContain('copywriter');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('loads SEO Expert prompt', () => {
    const prompt = getAdvisorSystemPrompt('seo-expert');
    expect(prompt).toContain('SEO');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('throws for unknown advisor', () => {
    expect(() => getAdvisorSystemPrompt('nonexistent')).toThrow('Unknown advisor: nonexistent');
  });

  it('registry contains entries for all advisors with prompts', () => {
    expect(advisorRegistry.length).toBeGreaterThanOrEqual(4);
    for (const entry of advisorRegistry) {
      expect(() => getAdvisorSystemPrompt(entry.id)).not.toThrow();
    }
  });

  it('registry entries have required fields', () => {
    for (const entry of advisorRegistry) {
      expect(entry.id).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(['author', 'critic', 'editor', 'strategist']).toContain(entry.role);
    }
  });

  it('clearAdvisorCache resets cached prompts', () => {
    const first = getAdvisorSystemPrompt('richard-rumelt');
    expect(first).toContain('Richard Rumelt');

    clearAdvisorCache();

    const second = getAdvisorSystemPrompt('richard-rumelt');
    expect(second).toContain('Richard Rumelt');
    expect(second).toBe(first);
  });
});
