import type { FoundationDocType } from '@/types';

export interface AdvisorEntry {
  id: string;
  name: string;
  role: 'author' | 'critic' | 'editor' | 'strategist';
  evaluationExpertise?: string;
  doesNotEvaluate?: string;
  contextDocs?: FoundationDocType[];
}

export const advisorRegistry: AdvisorEntry[] = [
  { id: 'richard-rumelt', name: 'Richard Rumelt', role: 'strategist' },
  {
    id: 'copywriter',
    name: 'Brand Copywriter',
    role: 'author',
    evaluationExpertise:
      'Evaluates brand voice consistency. Does the content match the defined voice ' +
      'attributes? Are tone, vocabulary, and sentence rhythm consistent with the brand ' +
      'voice document? Do counter-examples from the voice guide appear in the copy? ' +
      'Catches voice drift — copy that sounds generic, corporate, or inconsistent with ' +
      'the established brand character.',
    doesNotEvaluate:
      'Does not evaluate SEO strategy, conversion design, behavioral science, or page structure.',
    contextDocs: ['brand-voice'],
  },
  {
    id: 'april-dunford',
    name: 'April Dunford',
    role: 'strategist',
    evaluationExpertise:
      'Evaluates whether content reflects the positioning statement. ' +
      'Checks the five components: Are competitive alternatives clear? ' +
      'Are unique attributes specific and provable? Does value connect to ' +
      'customer outcomes? Is the target customer evident? Does the market ' +
      "category framing trigger the right assumptions? Catches positioning " +
      "drift — claims the positioning doesn't support.",
    doesNotEvaluate:
      'Does not evaluate technical SEO, code quality, or visual design.',
    contextDocs: ['positioning', 'strategy'],
  },
  {
    id: 'seo-expert',
    name: 'SEO Expert',
    role: 'critic',
    evaluationExpertise:
      'Evaluates content for search performance. Keyword integration ' +
      'in headings and body, meta description quality, heading hierarchy ' +
      '(H1/H2/H3 structure), internal link opportunities, SERP feature ' +
      'optimization (featured snippets, PAA). Grounds every recommendation ' +
      'in keyword data and search intent.',
    doesNotEvaluate:
      'Does not evaluate brand positioning, narrative quality, or visual design.',
    contextDocs: ['seo-strategy'],
  },
  {
    id: 'shirin-oreizy',
    name: 'Shirin Oreizy',
    role: 'critic',
    evaluationExpertise:
      'Evaluates through behavioral science lens. CTA clarity and friction, ' +
      'cognitive load management, social proof approach, urgency without ' +
      'manipulation, working memory limits (5-9 chunks max). Homer vs Spock — ' +
      'does content activate both emotional and rational decision paths? ' +
      'Evaluates whether the page design respects how real humans actually decide.',
    doesNotEvaluate:
      'Does not evaluate SEO keyword strategy, brand positioning accuracy, or technical implementation.',
    contextDocs: [],
  },
  {
    id: 'joe-pulizzi',
    name: 'Joe Pulizzi',
    role: 'strategist',
    evaluationExpertise:
      'Evaluates content strategy through audience-first lens. Does the content ' +
      'have a clear content tilt — a differentiated angle with little competition? ' +
      'Is it serving the audience or selling the product? Is there a consistent ' +
      'publishing cadence on a focused platform? Does the content build toward a ' +
      'subscriber relationship (email list) rather than one-time views? Catches ' +
      'product-first thinking disguised as content marketing.',
    doesNotEvaluate:
      'Does not evaluate SEO technical details, behavioral psychology, or visual design.',
    contextDocs: ['strategy'],
  },
  {
    id: 'robb-wolf',
    name: 'Robb Wolf',
    role: 'critic',
    evaluationExpertise:
      'Evaluates health product content through two lenses: scientific defensibility ' +
      'and trust-building through substance. Checks whether health claims have a clear ' +
      'mechanism of action, whether evidence tier is named honestly (RCT vs observational ' +
      'vs anecdotal), and whether content earns long-term credibility or just sounds ' +
      'scientific. Evaluates GTM approach against content-led organic distribution — ' +
      'is the educational content and the product thesis the same thing? Catches ' +
      'hand-wavy science, credential-free authority claims, and marketing dressed as education.',
    doesNotEvaluate:
      'Does not evaluate SEO strategy, visual design, behavioral psychology tactics, or technical implementation.',
    contextDocs: ['positioning', 'strategy'],
  },
  {
    id: 'patrick-campbell',
    name: 'Patrick Campbell',
    role: 'strategist',
    evaluationExpertise:
      'Evaluates pricing, packaging, and monetization strategy. Value metric ' +
      'alignment — is the customer paying for what they actually value? Feature ' +
      'differentiation across tiers, add-on opportunities, willingness-to-pay ' +
      'segmentation by persona. Retention mechanics — voluntary vs involuntary ' +
      'churn, payment recovery, cancel flow design, term optimization. Catches ' +
      'monetization neglect and packaging misalignment.',
    doesNotEvaluate:
      'Does not evaluate brand voice, content quality, SEO strategy, or visual design.',
    contextDocs: ['strategy', 'positioning'],
  },
  {
    id: 'robbie-kellman-baxter',
    name: 'Robbie Kellman Baxter',
    role: 'strategist',
    evaluationExpertise:
      'Evaluates whether content reflects membership thinking vs transaction thinking. ' +
      'Is the forever promise clear — an ongoing outcome, not a feature list? ' +
      'Does the content frame the offer as a relationship, not a purchase? ' +
      'Does it speak to super users and community value? Does onboarding content ' +
      'bridge the gap between sign-up and felt benefit? Catches subscription-as-billing ' +
      'framing — recurring price without ongoing value justification.',
    doesNotEvaluate:
      'Does not evaluate SEO strategy, brand voice tone, or visual design.',
    contextDocs: ['strategy', 'positioning'],
  },
  {
    id: 'oli-gardner',
    name: 'Oli Gardner',
    role: 'critic',
    evaluationExpertise:
      'Evaluates through Conversion-Centered Design lens. Attention ratio — ' +
      'ratio of interactive elements to campaign goals (ideal 1:1). Page focus — ' +
      'does every element serve a single conversion goal? Structural hierarchy — ' +
      'do directional cues, encapsulation, and visual flow guide the eye to the CTA? ' +
      'Trust signals — testimonials, logos, social proof, security badges. Friction ' +
      'reduction — form fields, steps, cognitive load. Benefit clarity — benefits vs. ' +
      'features, value proposition prominence. Visual consistency with conversion goals — ' +
      'message match between ad/email and landing page, maintaining the scent.',
    doesNotEvaluate:
      'Does not evaluate brand positioning accuracy, SEO keyword strategy, or copywriting voice.',
    contextDocs: ['positioning'],
  },
  {
    id: 'rob-walling',
    name: 'Rob Walling',
    role: 'strategist',
    evaluationExpertise:
      'Evaluates bootstrapped SaaS viability and go-to-market strategy. ' +
      'Acquisition channel selection (speed, cost, scalability), pricing ' +
      'architecture ($50+/month B2B sweet spot), product-market fit stage ' +
      'assessment (5-stage spectrum), churn benchmarks, and whether the ' +
      'business model works without VC. Catches "building without evidence" — ' +
      'features or products launched without validated willingness to pay.',
    doesNotEvaluate:
      'Does not evaluate copy quality, behavioral design, SEO tactics, or visual design.',
    contextDocs: ['strategy'],
  },
  {
    id: 'julian-shapiro',
    name: 'Julian Shapiro',
    role: 'author',
    contextDocs: ['positioning', 'brand-voice', 'seo-strategy'],
  },
  {
    id: 'seth-godin',
    name: 'Seth Godin',
    role: 'strategist',
    evaluationExpertise:
      'Evaluates marketing strategy through a remarkability and audience lens. ' +
      'Is this worth talking about — literally remarkable? Is the smallest viable ' +
      'audience defined with enough specificity? Does the story match the worldview ' +
      "of the target tribe? Is the marketing earning permission or interrupting? " +
      'Does the content create positive tension that enables change? Catches ' +
      'safe-but-forgettable positioning, marketing-without-product, and ' +
      'building-for-everyone-reaching-no-one.',
    doesNotEvaluate:
      'Does not evaluate technical SEO, conversion copy mechanics, pricing strategy, or behavioral psychology.',
    contextDocs: ['positioning', 'strategy'],
  },
  {
    id: 'joanna-wiebe',
    name: 'Joanna Wiebe',
    role: 'critic',
    evaluationExpertise:
      'Evaluates conversion copy quality through her Seven Sweeps lens. Headline ' +
      'effectiveness — does each element have one clear job? CTA clarity and friction ' +
      'word avoidance. Voice-of-customer alignment — does the copy use language customers ' +
      'actually use, or does it sound like internal marketing? PAS structure — is the ' +
      'problem stated, agitated, then solved? Specificity of claims — vague promises vs ' +
      'concrete proof. Emotional vs rational balance — does the copy make the reader feel ' +
      'something before asking them to think? Message-match between traffic source and ' +
      'landing page. "So what?" and "Prove it." applied to every claim.',
    doesNotEvaluate:
      'Does not evaluate visual design, technical SEO, page structure/layout, or behavioral science.',
    contextDocs: ['positioning', 'brand-voice'],
  },
];
