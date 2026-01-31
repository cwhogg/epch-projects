/**
 * Expertise profile for the product owner/team.
 * Used in scoring prompts to provide accurate Expertise Alignment scores
 * instead of defaulting to 5/10.
 *
 * Edit this file to match your actual expertise.
 */

export interface ExpertiseProfile {
  /** Short summary of who you are / your team */
  summary: string;
  /** Core domains of expertise with depth ratings */
  domains: { name: string; depth: string }[];
  /** Technical skills relevant to building products */
  technicalSkills: string[];
  /** Years of relevant experience (approximate) */
  yearsExperience: number;
  /** Notable achievements or credentials */
  credentials: string[];
  /** Areas where you have limited expertise */
  gaps: string[];
  /** Product categories with high expertise overlap (8-10 score) */
  highOverlapCategories: string[];
  /** Product categories with medium expertise overlap (5-7 score) */
  mediumOverlapCategories: string[];
  /** Product categories with lower expertise overlap (2-4 score) */
  lowerOverlapCategories: string[];
}

export const EXPERTISE_PROFILE: ExpertiseProfile = {
  summary:
    'Digital health entrepreneur and executive with 20+ years spanning molecular biology, pharma commercial strategy, healthcare investment banking, data science, and founding/scaling healthcare technology companies. Rock Health Top 50 in Digital Health (2023).',
  domains: [
    { name: 'Virtual care & telehealth', depth: 'Expert (10/10)' },
    { name: 'Chronic disease management', depth: 'Expert (10/10)' },
    { name: 'Digital therapeutics & connected devices', depth: 'Expert (10/10)' },
    { name: 'Pharma/biotech commercial strategy', depth: 'Expert (9/10)' },
    { name: 'Healthcare data science & analytics', depth: 'Expert (9/10)' },
    { name: 'Go-to-market strategy (health systems, payers, pharma)', depth: 'Expert (9/10)' },
    { name: 'Healthcare startup founding & operations', depth: 'Expert (9/10)' },
    { name: 'Behavior change & patient engagement', depth: 'Expert (9/10)' },
    { name: 'Remote patient monitoring (RPM)', depth: 'Expert (9/10)' },
    { name: 'EMR/EHR integration & health IT', depth: 'Strong (8/10)' },
    { name: 'Healthcare investment banking & financing', depth: 'Moderate (7/10)' },
    { name: 'GLP-1 / metabolic health', depth: 'Moderate-Strong (7/10)' },
    { name: 'Healthcare AI applications', depth: 'Growing (6/10)' },
    { name: 'Life sciences / molecular biology', depth: 'Foundational (6/10)' },
  ],
  technicalSkills: [
    'Product strategy (expert)',
    'Data analytics & data products (expert)',
    'Clinical trial design — pragmatic (strong)',
    'Regulatory strategy — FDA, digital health (strong)',
    'API integrations / health IT (moderate)',
    'Rapid prototyping — V0, Vercel (growing)',
    'AI/LLM applications (growing)',
  ],
  yearsExperience: 20,
  credentials: [
    'Rock Health Top 50 in Digital Health (2023)',
    'Co-founded Marley Medical ($9M seed led by a16z, CRV) — virtual-first primary care',
    'COO/CCO at Propeller Health through $225M acquisition by ResMed — FDA-cleared digital therapeutics',
    'Head of Data Science & Data Products at Practice Fusion (80M+ patient EMR database)',
    'Founded 100Plus (acquired by Practice Fusion)',
    'Director of Commercial Strategy at Gilead Sciences (cardiovascular)',
    'Associate Director, Healthcare at UBS Investment Bank',
    'TEDx Silicon Valley speaker; published in TechCrunch, MobiHealthNews',
    'Investor network: a16z (Julie Yoo), CRV (Kristin Baker Spohn), Rock Health ecosystem',
  ],
  gaps: [
    'AI/LLM application development — growing but not expert',
    'Rapid prototyping / frontend engineering — growing',
    'Solo operator currently — no team for engineering, design, or growth',
    'No deep expertise in surgical/procedural tech, genomics, medical imaging, hospital ops, or insurance/benefits admin',
  ],
  highOverlapCategories: [
    'Virtual care platforms for chronic conditions',
    'Digital therapeutics / connected devices',
    'Pharma patient engagement tools',
    'Healthcare data products',
    'RPM solutions',
    'Medication adherence platforms',
  ],
  mediumOverlapCategories: [
    'Healthcare AI/LLM applications',
    'Provider workflow tools',
    'Health system analytics',
    'Consumer health apps (non-chronic)',
    'GLP-1 / metabolic health platforms',
  ],
  lowerOverlapCategories: [
    'Surgical/procedural technology',
    'Genomics / precision medicine',
    'Medical imaging',
    'Hospital operations',
    'Insurance/benefits administration',
  ],
};

/**
 * Build a prompt section describing expertise for the scoring LLM.
 */
export function buildExpertiseContext(): string {
  const p = EXPERTISE_PROFILE;
  const topDomains = p.domains
    .slice(0, 8)
    .map((d) => `${d.name} — ${d.depth}`)
    .join('\n  ');
  const growingDomains = p.domains
    .filter((d) => d.depth.includes('Growing') || d.depth.includes('Foundational'))
    .map((d) => `${d.name} — ${d.depth}`)
    .join('; ');

  return `EXPERTISE PROFILE (use this to score Expertise Alignment accurately — do NOT default to 5/10):

Background: ${p.summary}

Top domains:
  ${topDomains}

Growing areas: ${growingDomains}

Key credentials: ${p.credentials.slice(0, 5).join('; ')}

Gaps: ${p.gaps.join('; ')}

HIGH-OVERLAP product categories (score 8-10): ${p.highOverlapCategories.join(', ')}
MEDIUM-OVERLAP product categories (score 5-7): ${p.mediumOverlapCategories.join(', ')}
LOWER-OVERLAP product categories (score 2-4): ${p.lowerOverlapCategories.join(', ')}

Score Expertise Alignment by matching the product idea against these categories and domain strengths. A virtual care chronic disease product = 9-10. A healthcare AI tool = 6-7. A surgical tech product = 2-3.`;
}
