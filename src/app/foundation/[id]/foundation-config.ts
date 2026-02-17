import type { FoundationDocType } from '@/types';

export interface DocConfigEntry {
  type: FoundationDocType;
  label: string;
  advisor: string;
  requires: string | null;
}

export const DOC_CONFIG: DocConfigEntry[] = [
  { type: 'strategy', label: 'Strategy', advisor: 'Seth Godin', requires: null },
  { type: 'positioning', label: 'Positioning Statement', advisor: 'April Dunford', requires: 'Strategy' },
  { type: 'brand-voice', label: 'Brand Voice', advisor: 'Brand Copywriter', requires: 'Positioning' },
  { type: 'design-principles', label: 'Design Principles', advisor: 'Derived', requires: 'Positioning + Strategy' },
  { type: 'seo-strategy', label: 'SEO Strategy', advisor: 'SEO Expert', requires: 'Positioning' },
  { type: 'social-media-strategy', label: 'Social Media Strategy', advisor: 'TBD', requires: 'Brand Voice' },
];
