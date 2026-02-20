import type { FrameworkEntry } from './types';

export const FRAMEWORK_REGISTRY: FrameworkEntry[] = [
  {
    id: 'value-metric',
    displayName: 'Value Metric Framework',
    advisors: ['patrick-campbell'],
    description:
      'Identify the single most important pricing decision — how your customer pays and what they pay for. Brainstorm proxy metrics, test against four criteria, and validate with customers.',
    contextDocs: ['strategy', 'positioning'],
  },
  {
    id: 'content-inc-model',
    displayName: 'Content Inc. Model',
    advisors: ['joe-pulizzi'],
    description:
      'Build an audience-first business in 6 steps: Sweet Spot, Content Tilt, Build the Base, Harvest Audience, Diversification, Monetization. Reverses the typical product-first approach.',
    contextDocs: ['strategy'],
  },
  {
    id: 'forever-promise',
    displayName: 'Forever Promise Framework',
    advisors: ['robbie-kellman-baxter'],
    description:
      'Define the ongoing value commitment that turns a subscription into a real membership relationship. Test whether your promise justifies ongoing payment, sharpen it for specificity, and design the first 30 days.',
    contextDocs: ['strategy', 'positioning'],
  },
  {
    id: 'smallest-viable-audience',
    displayName: 'Smallest Viable Audience',
    advisors: ['seth-godin'],
    description:
      'Find the smallest group of people you could serve so well they would recruit others. Define your tribe by worldview, articulate the change you make, and test for remarkability.',
    contextDocs: ['positioning', 'strategy'],
  },
  {
    id: 'landing-page-assembly',
    displayName: 'Landing Page Assembly',
    advisors: ['julian-shapiro'],
    description:
      'Build conversion-focused landing pages in 4 phases: Extract Core Ingredients, Write the Hero (50% of effort), Assemble Full Page, and Pressure-Test. Treats landing page copy as an engineering problem where Purchase Rate = Desire − (Labor + Confusion).',
    contextDocs: ['positioning', 'brand-voice', 'seo-strategy'],
  },
  {
    id: 'design-principles',
    displayName: 'Design Principles',
    advisors: ['oli-gardner'],
    description:
      'Generate visual design principles with implementation-ready tokens for deterministic site rendering.',
    contextDocs: ['positioning', 'brand-voice', 'strategy'],
  },
];

export function getFrameworkEntry(id: string): FrameworkEntry | undefined {
  return FRAMEWORK_REGISTRY.find((f) => f.id === id);
}

export function getFrameworkDisplayName(id: string): string | undefined {
  return getFrameworkEntry(id)?.displayName;
}

export function getFrameworksForAdvisor(advisorId: string): string[] {
  return FRAMEWORK_REGISTRY.filter(
    (f) => f.enabled !== false && f.advisors.includes(advisorId)
  ).map((f) => f.id);
}

export function getAdvisorFrameworkEntries(
  advisorId: string
): FrameworkEntry[] {
  return FRAMEWORK_REGISTRY.filter(
    (f) => f.enabled !== false && f.advisors.includes(advisorId)
  );
}

export function getEnabledFrameworks(): FrameworkEntry[] {
  return FRAMEWORK_REGISTRY.filter((f) => f.enabled !== false);
}
