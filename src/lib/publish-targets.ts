import { ContentType } from '@/types';

export interface PublishTarget {
  id: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  siteUrl: string;
  pathMap: Record<ContentType, string>;
}

export const PUBLISH_TARGETS: Record<string, PublishTarget> = {
  secondlook: {
    id: 'secondlook',
    repoOwner: 'cwhogg',
    repoName: 'secondlook',
    branch: 'main',
    siteUrl: 'https://secondlook.vercel.app',
    pathMap: {
      'blog-post': 'content/blog',
      'comparison': 'content/comparison',
      'faq': 'content/faq',
    },
  },
  'study-platform': {
    id: 'study-platform',
    repoOwner: 'cwhogg',
    repoName: 'study-platform',
    branch: 'main',
    siteUrl: 'https://nofone.us',
    pathMap: {
      'blog-post': 'content/blog',
      'comparison': 'content/comparison',
      'faq': 'content/faq',
    },
  },
};

export async function getPublishTarget(targetId: string): Promise<PublishTarget> {
  // Check hardcoded targets first
  const target = PUBLISH_TARGETS[targetId];
  if (target) return target;

  // Fall back to dynamic targets in Redis
  const { getDynamicPublishTarget } = await import('./painted-door-db');
  const dynamic = await getDynamicPublishTarget(targetId);
  if (dynamic) return dynamic;

  throw new Error(`Unknown publish target: ${targetId}`);
}

export async function getAllPublishTargets(): Promise<PublishTarget[]> {
  const staticTargets = Object.values(PUBLISH_TARGETS);
  try {
    const { getAllDynamicPublishTargets } = await import('./painted-door-db');
    const dynamicTargets = await getAllDynamicPublishTargets();
    return [...staticTargets, ...dynamicTargets];
  } catch {
    // Redis not configured — return static targets only
    return staticTargets;
  }
}
