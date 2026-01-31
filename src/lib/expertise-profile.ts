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
  /** Core domains of expertise */
  domains: string[];
  /** Technical skills relevant to building products */
  technicalSkills: string[];
  /** Years of relevant experience (approximate) */
  yearsExperience: number;
  /** Notable achievements or credentials */
  credentials: string[];
  /** Areas where you have limited expertise */
  gaps: string[];
}

export const EXPERTISE_PROFILE: ExpertiseProfile = {
  summary: 'Solo technical founder with full-stack engineering background and experience shipping AI-powered products',
  domains: [
    'Software engineering (full-stack web)',
    'AI/ML application development',
    'Healthcare technology',
    'Developer tools',
    'Data analysis and visualization',
  ],
  technicalSkills: [
    'TypeScript / React / Next.js',
    'AI/LLM integration (Claude, OpenAI)',
    'Cloud deployment (Vercel, AWS)',
    'Database design',
    'API development',
  ],
  yearsExperience: 10,
  credentials: [
    'Shipped multiple production web applications',
    'Experience building AI-powered tools',
  ],
  gaps: [
    'No medical/clinical credentials',
    'Limited sales and marketing experience',
    'No regulatory (FDA, HIPAA) experience',
    'Solo — no team for design, growth, or ops',
  ],
};

/**
 * Build a prompt section describing expertise for the scoring LLM.
 */
export function buildExpertiseContext(): string {
  const p = EXPERTISE_PROFILE;
  return `EXPERTISE PROFILE (use this to score Expertise Alignment accurately — do NOT default to 5/10):
- Background: ${p.summary}
- Domains: ${p.domains.join(', ')}
- Technical: ${p.technicalSkills.join(', ')}
- Experience: ~${p.yearsExperience} years
- Credentials: ${p.credentials.join('; ')}
- Gaps: ${p.gaps.join('; ')}

Score Expertise Alignment based on how well this profile matches the product's requirements. High (8-10) if strong domain + technical fit. Low (1-3) if major domain gaps or missing critical non-technical skills.`;
}
