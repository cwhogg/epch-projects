import { ProductIdea } from '@/types';

// ---------- Verticals ----------

export type Vertical = 'b2b-saas' | 'healthcare-consumer' | 'general-niche';

// ---------- Keyword Pattern Templates ----------

export interface KeywordPattern {
  category: string;
  patterns: string[];
  description: string;
}

const KEYWORD_PATTERNS: Record<Vertical, KeywordPattern[]> = {
  'b2b-saas': [
    {
      category: 'Problem-Aware',
      patterns: [
        'how to automate [process]',
        'why is [process] so slow',
        '[process] keeps failing',
        'how to reduce [metric] errors',
        '[department] workflow bottleneck',
      ],
      description: 'Queries from people who have the problem but may not know a solution exists',
    },
    {
      category: 'Solution-Aware',
      patterns: [
        '[solution type] software',
        '[solution type] tool for [team size]',
        '[solution type] platform for [industry]',
        'best [solution type] for startups',
        '[solution type] that integrates with [tool]',
      ],
      description: 'Queries from people actively looking for a category of solution',
    },
    {
      category: 'Comparison',
      patterns: [
        '[competitor] alternative',
        '[competitor] vs [competitor]',
        '[competitor] alternative for small teams',
        'cheaper alternative to [competitor]',
        '[competitor] pricing too expensive',
      ],
      description: 'Queries from people evaluating options against known players',
    },
    {
      category: 'Buyer-Journey',
      patterns: [
        '[solution type] pricing',
        '[solution type] ROI calculator',
        'is [solution type] worth it',
        '[solution type] implementation guide',
        '[solution type] case study [industry]',
      ],
      description: 'Queries from people moving toward purchase',
    },
    {
      category: 'Community-Signal',
      patterns: [
        'reddit [solution type] recommendation',
        'what [solution type] do you use',
        '[solution type] self-hosted',
        'open source [solution type]',
        'anyone tried [competitor]',
      ],
      description: 'Queries that mirror community/forum language',
    },
  ],
  'healthcare-consumer': [
    {
      category: 'Problem-Aware',
      patterns: [
        'why do I [symptom]',
        'how to stop [symptom]',
        '[condition] getting worse',
        'natural remedy for [condition]',
        '[symptom] at night',
      ],
      description: 'People experiencing symptoms or health concerns',
    },
    {
      category: 'Solution-Aware',
      patterns: [
        'best [product type] for [condition]',
        '[product type] app',
        '[product type] tracker',
        '[product type] without subscription',
        'free [product type]',
      ],
      description: 'People looking for health/wellness products',
    },
    {
      category: 'Comparison',
      patterns: [
        '[app] vs [app]',
        'best [product type] apps [year]',
        '[app] alternative free',
        '[product type] app review',
        'is [app] worth it',
      ],
      description: 'People comparing health apps or products',
    },
    {
      category: 'Buyer-Journey',
      patterns: [
        '[product type] pricing',
        '[product type] subscription worth it',
        '[product type] premium vs free',
        '[product type] before and after',
        '[product type] results how long',
      ],
      description: 'People evaluating whether to pay',
    },
    {
      category: 'Community-Signal',
      patterns: [
        'reddit [condition] what helps',
        '[condition] support group',
        'anyone else struggle with [symptom]',
        '[product type] recommendation reddit',
        'what helped your [condition]',
      ],
      description: 'Community discussions about health topics',
    },
  ],
  'general-niche': [
    {
      category: 'Problem-Aware',
      patterns: [
        'how to [solve problem]',
        'why is [task] so hard',
        '[frustration] when [activity]',
        'help with [task]',
        '[task] for beginners',
      ],
      description: 'General problem-aware queries',
    },
    {
      category: 'Solution-Aware',
      patterns: [
        'best [product type]',
        '[product type] tool',
        '[product type] app',
        '[product type] for [specific audience]',
        'free [product type] online',
      ],
      description: 'General solution-seeking queries',
    },
    {
      category: 'Comparison',
      patterns: [
        '[product] alternative',
        '[product] vs [product]',
        'best [product type] [year]',
        'top [product type] compared',
        '[product] review honest',
      ],
      description: 'General comparison queries',
    },
    {
      category: 'Buyer-Journey',
      patterns: [
        '[product type] pricing',
        'is [product] worth it',
        '[product type] free trial',
        '[product] discount code',
        '[product type] lifetime deal',
      ],
      description: 'General purchase-intent queries',
    },
    {
      category: 'Community-Signal',
      patterns: [
        'reddit [product type] recommendation',
        'what [product type] do you use',
        '[product type] tips',
        'best way to [task]',
        '[product type] for [specific use case]',
      ],
      description: 'General community queries',
    },
  ],
};

// ---------- SERP Analysis Criteria ----------

export interface SERPCriteria {
  greenFlags: string[];
  redFlags: string[];
  genericDomains: string[];
  authorityDomains: string[];
}

const SERP_CRITERIA: Record<Vertical, SERPCriteria> = {
  'b2b-saas': {
    greenFlags: [
      'Reddit or forum threads ranking in top 10',
      'Content older than 2 years in top positions',
      'Thin listicles (< 800 words) ranking well',
      'Low Domain Rating sites (DR < 30) in top 5',
      'People Also Ask boxes present (content gap signal)',
      'Missing featured snippets for question queries',
      'Individual blog posts outranking vendor pages',
    ],
    redFlags: [
      'G2, Capterra, or Gartner dominating all top 5',
      'Major SaaS vendors (Salesforce, HubSpot, Microsoft) occupying all positions',
      'All top results are well-funded competitors with dedicated SEO teams',
      'SERP features dominated by ads and knowledge panels',
      'Top results have 100+ referring domains',
    ],
    genericDomains: ['wikipedia.org', 'youtube.com', 'reddit.com', 'quora.com', 'medium.com', 'forbes.com', 'linkedin.com'],
    authorityDomains: ['g2.com', 'capterra.com', 'gartner.com', 'trustradius.com', 'getapp.com'],
  },
  'healthcare-consumer': {
    greenFlags: [
      'Reddit health threads ranking in top 10',
      'Content older than 2 years in top positions',
      'Thin content (< 500 words) ranking well',
      'Low Domain Rating sites (DR < 30) in top 5',
      'People Also Ask boxes present',
      'Patient forums or support groups ranking',
      'App store results not dominating SERP',
    ],
    redFlags: [
      'WebMD, Mayo Clinic, Cleveland Clinic in all top 5',
      'NHS, CDC, or government health sites dominating',
      'All top content is comprehensive medical reference (3000+ words)',
      'SERP features dominated by knowledge panels with medical info',
      'YMYL content heavily favoring established health authorities',
    ],
    genericDomains: ['wikipedia.org', 'youtube.com', 'reddit.com', 'quora.com', 'medium.com'],
    authorityDomains: ['webmd.com', 'mayoclinic.org', 'clevelandclinic.org', 'healthline.com', 'medicalnewstoday.com', 'nih.gov'],
  },
  'general-niche': {
    greenFlags: [
      'Forums (Reddit, Quora) ranking in top 10',
      'Content older than 2 years in top positions',
      'Thin content (< 500 words) ranking well',
      'Low Domain Rating sites (DR < 30) in top 5',
      'People Also Ask boxes present',
      'Missing featured snippets for question queries',
    ],
    redFlags: [
      'Major brands (Amazon, etc.) in all top 5 positions',
      'Top results have 100+ referring domains',
      'All top content is comprehensive (3000+ words, well-structured)',
      'SERP features dominated by ads and knowledge panels',
      'Results are homogeneous (all same type/angle)',
    ],
    genericDomains: ['wikipedia.org', 'youtube.com', 'reddit.com', 'quora.com', 'medium.com', 'forbes.com'],
    authorityDomains: ['amazon.com', 'nytimes.com', 'cnet.com', 'pcmag.com', 'techcrunch.com'],
  },
};

// ---------- Content Gap Types ----------

export interface ContentGapType {
  type: string;
  description: string;
  detectionSignals: string[];
}

const CONTENT_GAP_TYPES: ContentGapType[] = [
  {
    type: 'Format',
    description: 'All results are guides/articles, but a tool, calculator, or template would serve better',
    detectionSignals: [
      'All top results are text-based articles',
      'Query implies interactive need (calculator, generator, checker)',
      'No tools or interactive content in top 10',
    ],
  },
  {
    type: 'Freshness',
    description: 'Top content is 2+ years old with outdated information',
    detectionSignals: [
      'Top results published 2+ years ago',
      'Industry has changed since content was published',
      'Comments mention outdated info',
    ],
  },
  {
    type: 'Depth',
    description: 'Top content is thin, lacks detail users need',
    detectionSignals: [
      'Top results are under 800 words',
      'Snippets are generic and surface-level',
      'People Also Ask questions go unanswered in results',
    ],
  },
  {
    type: 'Angle',
    description: 'All content takes the same approach, alternative perspective unrepresented',
    detectionSignals: [
      'All results target same audience',
      'No content from practitioner perspective',
      'Missing comparison or "vs" content',
    ],
  },
  {
    type: 'Audience',
    description: 'Content exists but not for specific audience (e.g., "for startups", "for beginners")',
    detectionSignals: [
      'Results are generic, not audience-specific',
      'No content for specific company size or role',
      'Query includes audience qualifier not reflected in results',
    ],
  },
];

// ---------- Scoring Framework ----------

export interface ScoringWeight {
  dimension: string;
  weight: number;
  description: string;
}

const SCORING_WEIGHTS: ScoringWeight[] = [
  { dimension: 'SEO Opportunity', weight: 0.30, description: 'Keyword volume, difficulty, content gaps, SERP signals' },
  { dimension: 'Competitive Landscape', weight: 0.20, description: 'Room to differentiate, market maturity, competitor weaknesses' },
  { dimension: 'Willingness to Pay', weight: 0.25, description: 'Evidence users pay for solutions, price points, purchase signals' },
  { dimension: 'Differentiation Potential', weight: 0.20, description: 'Unique angle available, underserved segments, feature gaps' },
  { dimension: 'Expertise Alignment', weight: 0.05, description: 'Owner ability to execute, domain knowledge, technical fit' },
];

export interface IntentWeight {
  intent: string;
  weight: number;
}

const INTENT_WEIGHTS: IntentWeight[] = [
  { intent: 'Transactional', weight: 1.5 },
  { intent: 'Commercial', weight: 1.2 },
  { intent: 'Informational', weight: 1.0 },
  { intent: 'Navigational', weight: 0.5 },
];

export interface VolumeClassification {
  label: string;
  range: string;
  b2bRange: string;
  notes: string;
}

const VOLUME_CLASSIFICATIONS: VolumeClassification[] = [
  { label: 'High', range: '10,000+', b2bRange: '2,000+', notes: 'Usually high competition. Rarely worth targeting directly.' },
  { label: 'Medium', range: '2,000-10,000', b2bRange: '500-2,000', notes: 'Good if low difficulty. Long-tail variations often better.' },
  { label: 'Sweet Spot', range: '200-2,000', b2bRange: '50-200', notes: 'Ideal for niche. Enough traffic to matter, low enough to rank.' },
  { label: 'Long-tail', range: '50-200', b2bRange: '20-50', notes: 'Good if high intent. Multiple long-tails add up.' },
  { label: 'Very Low', range: '< 50', b2bRange: '< 20', notes: 'Only for extremely high-intent commercial keywords.' },
];

// ---------- Community/Forum Mapping ----------

export interface CommunityMapping {
  subreddits: string[];
  forums: string[];
  reviewSites: string[];
  social: string[];
}

const COMMUNITY_MAPPINGS: Record<Vertical, CommunityMapping> = {
  'b2b-saas': {
    subreddits: ['r/SaaS', 'r/startups', 'r/Entrepreneur', 'r/smallbusiness', 'r/devops', 'r/sysadmin', 'r/webdev'],
    forums: ['Hacker News', 'Indie Hackers', 'Product Hunt discussions', 'Stack Overflow'],
    reviewSites: ['G2', 'Capterra', 'TrustRadius', 'GetApp', 'Product Hunt'],
    social: ['Twitter/X (tech)', 'LinkedIn', 'Discord (dev communities)'],
  },
  'healthcare-consumer': {
    subreddits: ['r/health', 'r/HealthAnxiety', 'r/fitness', 'r/nutrition', 'r/sleep', 'r/mentalhealth', 'r/loseit'],
    forums: ['HealthBoards', 'Patient.info', 'MyFitnessPal forums', 'WebMD communities'],
    reviewSites: ['App Store reviews', 'Google Play reviews', 'Trustpilot'],
    social: ['Instagram (wellness)', 'TikTok (health)', 'Facebook groups'],
  },
  'general-niche': {
    subreddits: ['r/productivity', 'r/selfimprovement', 'r/technology', 'r/apps'],
    forums: ['Product Hunt', 'Indie Hackers', 'relevant niche forums'],
    reviewSites: ['App Store', 'Google Play', 'Trustpilot', 'Product Hunt'],
    social: ['Twitter/X', 'Reddit', 'relevant Discord servers'],
  },
};

// ---------- Vertical Detection ----------

export function detectVertical(idea: ProductIdea): Vertical {
  const text = `${idea.name} ${idea.description || ''} ${idea.targetUser || ''} ${idea.problemSolved || ''}`.toLowerCase();

  // B2B SaaS signals
  const b2bSignals = [
    'b2b', 'saas', 'enterprise', 'team', 'workflow', 'automation',
    'integration', 'api', 'dashboard', 'analytics', 'crm', 'erp',
    'project management', 'collaboration', 'devops', 'infrastructure',
    'business', 'company', 'organization', 'employee', 'manager',
    'startup', 'agency', 'consulting', 'operations', 'pipeline',
  ];

  // Healthcare consumer signals
  const healthSignals = [
    'health', 'medical', 'patient', 'symptom', 'diagnosis', 'treatment',
    'wellness', 'fitness', 'nutrition', 'diet', 'exercise', 'sleep',
    'mental health', 'anxiety', 'depression', 'therapy', 'medication',
    'chronic', 'condition', 'doctor', 'clinical', 'healthcare',
    'supplement', 'vitamin', 'meditation', 'mindfulness',
  ];

  const b2bScore = b2bSignals.filter((s) => text.includes(s)).length;
  const healthScore = healthSignals.filter((s) => text.includes(s)).length;

  if (b2bScore > healthScore && b2bScore >= 2) return 'b2b-saas';
  if (healthScore > b2bScore && healthScore >= 2) return 'healthcare-consumer';
  return 'general-niche';
}

// ---------- Prompt Builders ----------

export function buildClaudeKnowledgeContext(idea: ProductIdea): string {
  const vertical = detectVertical(idea);
  const patterns = KEYWORD_PATTERNS[vertical];
  const criteria = SERP_CRITERIA[vertical];
  const communities = COMMUNITY_MAPPINGS[vertical];

  const patternSection = patterns
    .map((p) => `**${p.category}:** ${p.patterns.slice(0, 3).join(', ')}`)
    .join('\n');

  const gapSection = CONTENT_GAP_TYPES
    .map((g) => `- ${g.type}: ${g.description}`)
    .join('\n');

  return `## SEO Knowledge Context (${vertical})

### Keyword Patterns to Explore
${patternSection}

### SERP Evaluation Framework
**Green flags (opportunity):** ${criteria.greenFlags.slice(0, 4).join('; ')}
**Red flags (avoid):** ${criteria.redFlags.slice(0, 3).join('; ')}

### Content Gap Types to Identify
${gapSection}

### Community Sources for Keyword Ideas
Subreddits: ${communities.subreddits.slice(0, 4).join(', ')}
Forums: ${communities.forums.slice(0, 3).join(', ')}
Review sites: ${communities.reviewSites.slice(0, 3).join(', ')}

### Volume Context
${vertical === 'b2b-saas' ? 'For B2B SaaS: 50-200 monthly searches is the sweet spot. Do not dismiss low-volume keywords — in B2B, 20 searches/month with high intent can drive significant ARR.' : 'For consumer products: 200-2,000 monthly searches is the sweet spot for niche sites.'}`;
}

export function buildOpenAIKnowledgeContext(idea: ProductIdea): string {
  const vertical = detectVertical(idea);
  const patterns = KEYWORD_PATTERNS[vertical];
  const communities = COMMUNITY_MAPPINGS[vertical];

  const painPointPatterns = patterns
    .filter((p) => p.category === 'Problem-Aware' || p.category === 'Community-Signal')
    .map((p) => p.patterns.slice(0, 3).join(', '))
    .join('\n');

  return `## Pain-Point Keyword Context (${vertical})

### Focus Patterns
${painPointPatterns}

### Community Language Sources
Mine these for real phrasing: ${communities.subreddits.slice(0, 3).join(', ')}, ${communities.forums.slice(0, 2).join(', ')}

### What to Prioritize
- Frustration queries people type at 2am
- "[competitor] sucks" and "[competitor] alternative" patterns
- Long-tail queries big companies ignore because they're "too niche"
- Questions phrased in natural language, not marketing speak
${vertical === 'b2b-saas' ? '- B2B: focus on workflow pain, integration frustration, pricing complaints about incumbents' : '- Consumer: focus on symptom searches, "does X actually work", comparison queries'}`;
}

export function buildScoringGuidelines(): string {
  const weightsSection = SCORING_WEIGHTS
    .map((w) => `- **${w.dimension}** (${(w.weight * 100).toFixed(0)}%): ${w.description}`)
    .join('\n');

  const intentSection = INTENT_WEIGHTS
    .map((i) => `- ${i.intent}: ${i.weight}x`)
    .join('\n');

  return `## Scoring Framework

### Dimension Weights
${weightsSection}

### Formula
Overall = (SEO × 0.30) + (Competitive × 0.20) + (WTP × 0.25) + (Differentiation × 0.20) + (Expertise × 0.05)

### Intent Value Multipliers
${intentSection}

### Opportunity Score Factors
1. Estimated search volume (classified by vertical)
2. Estimated competitiveness (SERP observation)
3. Content gap presence and type
4. Intent alignment with purchase behavior
5. Community signal strength

### Recommendation Thresholds
- **Tier 1** (Test First): Overall score >= 7, High or Medium confidence
- **Tier 2** (Test Later): Score 5-7, or high score with Low confidence
- **Tier 3** (Don't Test): Score < 5, or major red flags`;
}

// ---------- Exports for SERP Detection ----------

export { SERP_CRITERIA, CONTENT_GAP_TYPES, KEYWORD_PATTERNS, SCORING_WEIGHTS, COMMUNITY_MAPPINGS, VOLUME_CLASSIFICATIONS, INTENT_WEIGHTS };
