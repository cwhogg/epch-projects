import type { FoundationDocType } from '@/types';
import type { AdvisorEntry } from './advisors/registry';
import { advisorRegistry } from './advisors/registry';
import { getAnthropic } from './anthropic';
import { CLAUDE_MODEL } from './config';
import { parseLLMJson } from './llm-utils';

export interface ContentRecipe {
  contentType: string;
  authorAdvisor: string;
  authorFramework?: string;
  authorContextDocs: FoundationDocType[];
  namedCritics?: string[];
  evaluationNeeds: string;
  evaluationEmphasis?: string;
  minAggregateScore: number;
  maxRevisionRounds: number;
}

export const recipes: Record<string, ContentRecipe> = {
  website: {
    contentType: 'website',
    authorAdvisor: 'julian-shapiro',
    authorFramework: 'landing-page-assembly',
    authorContextDocs: ['positioning', 'brand-voice', 'seo-strategy'],
    namedCritics: ['oli-gardner', 'joanna-wiebe', 'shirin-oreizy', 'copywriter'],
    evaluationNeeds:
      'This is website landing page copy. Needs review for: conversion-centered design ' +
      '(attention ratio, page focus, directional cues), conversion copywriting quality ' +
      '(headline effectiveness, CTA clarity, voice-of-customer alignment), behavioral science ' +
      '(CTA friction, cognitive load, conversion psychology), and brand voice consistency.',
    evaluationEmphasis:
      'Focus especially on the hero section — does it communicate the "why now" ' +
      'and competitive differentiation within the first viewport? Are CTAs ' +
      'low-friction and high-clarity?',
    minAggregateScore: 4,
    maxRevisionRounds: 3,
  },
  'blog-post': {
    contentType: 'blog-post',
    authorAdvisor: 'copywriter',
    authorContextDocs: ['positioning', 'brand-voice', 'seo-strategy'],
    evaluationNeeds:
      'This is a blog post. Needs review for: positioning consistency ' +
      '(reinforces brand positioning without being a sales pitch), SEO ' +
      'optimization (keyword placement, heading structure, PAA coverage), ' +
      'and narrative quality (compelling arc, opens with a shift not a pitch).',
    evaluationEmphasis:
      'Focus on whether the post reinforces market category positioning ' +
      'without reading like marketing copy. The narrative should educate, ' +
      'not sell.',
    minAggregateScore: 4,
    maxRevisionRounds: 3,
  },
  'social-post': {
    contentType: 'social-post',
    authorAdvisor: 'copywriter',
    authorContextDocs: ['positioning', 'brand-voice', 'social-media-strategy'],
    evaluationNeeds:
      'This is a social media post. Needs review for: positioning consistency ' +
      'and hook effectiveness.',
    minAggregateScore: 4,
    maxRevisionRounds: 2,
  },
};

/**
 * Select critics for a recipe from the advisor registry using LLM-based loose matching.
 * Throws on selection failure (distinct from legitimate zero matches).
 */
export async function selectCritics(
  recipe: ContentRecipe,
  registry: AdvisorEntry[] = advisorRegistry,
): Promise<AdvisorEntry[]> {
  const candidates = registry.filter(
    (a) => a.evaluationExpertise && a.id !== recipe.authorAdvisor,
  );

  if (candidates.length === 0) return [];

  const advisorDescriptions = candidates
    .map(
      (a) =>
        `- ${a.id}: EVALUATES: ${a.evaluationExpertise} DOES NOT EVALUATE: ${a.doesNotEvaluate || 'N/A'}`,
    )
    .join('\n');

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    system:
      'You select which advisors should review content. Return only a JSON array of advisor IDs.',
    messages: [
      {
        role: 'user',
        content:
          `Content type: ${recipe.contentType}\n` +
          `Evaluation needs: ${recipe.evaluationNeeds}\n\n` +
          `Available advisors:\n${advisorDescriptions}\n\n` +
          `Select the advisors whose expertise matches these evaluation needs. ` +
          `Exclude advisors whose "does not evaluate" conflicts with the needs. ` +
          `Return a JSON array of advisor IDs, e.g. ["april-dunford", "seo-expert"].`,
      },
    ],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '[]';
  try {
    const selectedIds: string[] = parseLLMJson(text);
    return candidates.filter((a) => selectedIds.includes(a.id));
  } catch {
    throw new Error(
      'Critic selection failed: could not parse LLM response as JSON array',
    );
  }
}
