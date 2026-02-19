import type { FoundationDocType } from '@/types';

/** Upstream dependency: which doc types must exist before generating this one */
export const DOC_DEPENDENCIES: Record<FoundationDocType, FoundationDocType[]> = {
  'strategy': [],
  'positioning': ['strategy'],
  'brand-voice': ['positioning'],
  'design-principles': ['positioning', 'strategy'],
  'seo-strategy': ['positioning'],
  'social-media-strategy': ['positioning', 'brand-voice'],
  'visual-identity': ['positioning', 'brand-voice'],
};
