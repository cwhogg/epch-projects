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
