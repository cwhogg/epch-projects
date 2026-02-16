import type { FoundationDocType } from '@/types';

export interface AdvisorEntry {
  id: string;
  name: string;
  role: 'author' | 'critic' | 'editor' | 'strategist';
  evaluationExpertise?: string;
  doesNotEvaluate?: string;
  contextDocs?: FoundationDocType[];
}

export const advisorRegistry: AdvisorEntry[] = [
  { id: 'richard-rumelt', name: 'Richard Rumelt', role: 'strategist' },
  { id: 'copywriter', name: 'Brand Copywriter', role: 'author' },
  {
    id: 'april-dunford',
    name: 'April Dunford',
    role: 'strategist',
    evaluationExpertise:
      'Evaluates whether content reflects the positioning statement. ' +
      'Checks the five components: Are competitive alternatives clear? ' +
      'Are unique attributes specific and provable? Does value connect to ' +
      'customer outcomes? Is the target customer evident? Does the market ' +
      "category framing trigger the right assumptions? Catches positioning " +
      "drift — claims the positioning doesn't support.",
    doesNotEvaluate:
      'Does not evaluate technical SEO, code quality, or visual design.',
    contextDocs: ['positioning', 'strategy'],
  },
  {
    id: 'seo-expert',
    name: 'SEO Expert',
    role: 'critic',
    evaluationExpertise:
      'Evaluates content for search performance. Keyword integration ' +
      'in headings and body, meta description quality, heading hierarchy ' +
      '(H1/H2/H3 structure), internal link opportunities, SERP feature ' +
      'optimization (featured snippets, PAA). Grounds every recommendation ' +
      'in keyword data and search intent.',
    doesNotEvaluate:
      'Does not evaluate brand positioning, narrative quality, or visual design.',
    contextDocs: ['seo-strategy'],
  },
  {
    id: 'shirin-oreizy',
    name: 'Shirin Oreizy',
    role: 'critic',
    evaluationExpertise:
      'Evaluates through behavioral science lens. CTA clarity and friction, ' +
      'cognitive load management, social proof approach, urgency without ' +
      'manipulation, working memory limits (5-9 chunks max). Homer vs Spock — ' +
      'does content activate both emotional and rational decision paths? ' +
      'Evaluates whether the page design respects how real humans actually decide.',
    doesNotEvaluate:
      'Does not evaluate SEO keyword strategy, brand positioning accuracy, or technical implementation.',
    contextDocs: [],
  },
];
