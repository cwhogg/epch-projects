export interface AdvisorEntry {
  id: string;
  name: string;
  role: 'author' | 'critic' | 'editor' | 'strategist';
}

export const advisorRegistry: AdvisorEntry[] = [
  { id: 'richard-rumelt', name: 'Richard Rumelt', role: 'strategist' },
  { id: 'april-dunford', name: 'April Dunford', role: 'strategist' },
  { id: 'copywriter', name: 'Brand Copywriter', role: 'author' },
  { id: 'seo-expert', name: 'SEO Expert', role: 'critic' },
];
