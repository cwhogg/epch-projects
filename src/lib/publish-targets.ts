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
      'landing-page': 'content/landing-page',
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
      'landing-page': 'content/landing-page',
      'comparison': 'content/comparison',
      'faq': 'content/faq',
    },
  },
};

export function getPublishTarget(targetId: string): PublishTarget {
  const target = PUBLISH_TARGETS[targetId];
  if (!target) {
    throw new Error(`Unknown publish target: ${targetId}`);
  }
  return target;
}
