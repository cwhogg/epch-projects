// ---- Per-section copy types ----

export interface HeroCopy {
  headline: string;    // 3-8 words
  subheadline: string; // max 30 words
  ctaText: string;     // 2-5 words
}

export interface ProblemCopy {
  headline: string;
  body: string;        // 2-3 sentences
}

export interface FeaturesCopy {
  sectionHeadline: string;
  features: { title: string; description: string }[]; // 3-6 items
}

export interface HowItWorksCopy {
  sectionHeadline: string;
  steps: { label: string; description: string }[];    // 3-5 steps
}

export interface AudienceCopy {
  sectionHeadline: string;
  body: string;
}

export interface ObjectionsCopy {
  sectionHeadline: string;
  objections: { question: string; answer: string }[];
}

export interface FinalCtaCopy {
  headline: string;
  body: string;
  ctaText: string;
}

export interface FaqCopy {
  sectionHeadline: string;
  faqs: { question: string; answer: string }[];
}

// ---- Discriminated union ----

export type PageSection =
  | { type: 'hero'; copy: HeroCopy }
  | { type: 'problem'; copy: ProblemCopy }
  | { type: 'features'; copy: FeaturesCopy }
  | { type: 'how-it-works'; copy: HowItWorksCopy }
  | { type: 'audience'; copy: AudienceCopy }
  | { type: 'objections'; copy: ObjectionsCopy }
  | { type: 'final-cta'; copy: FinalCtaCopy }
  | { type: 'faq'; copy: FaqCopy };

export type SectionType = PageSection['type'];

export interface PageSpec {
  sections: PageSection[];
  metaTitle: string;
  metaDescription: string;
  ogDescription: string;
}

// ---- All valid section types ----

const ALL_SECTION_TYPES: SectionType[] = [
  'hero', 'problem', 'features', 'how-it-works',
  'audience', 'objections', 'final-cta', 'faq',
];

export function getAllSectionTypes(): SectionType[] {
  return [...ALL_SECTION_TYPES];
}

export function getMissingSectionTypes(sections: PageSection[]): SectionType[] {
  const present = new Set(sections.map((s) => s.type));
  return ALL_SECTION_TYPES.filter((t) => !present.has(t));
}

// ---- Validation ----

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function requireString(obj: Record<string, unknown>, field: string, errors: string[]): boolean {
  if (typeof obj[field] !== 'string' || !obj[field]) {
    errors.push(`${field} is required and must be a non-empty string`);
    return false;
  }
  return true;
}

function requireArray(obj: Record<string, unknown>, field: string, min: number, max: number, errors: string[]): boolean {
  const arr = obj[field];
  if (!Array.isArray(arr)) {
    errors.push(`${field} is required and must be an array`);
    return false;
  }
  if (arr.length < min || arr.length > max) {
    errors.push(`${field} must have ${min}-${max} items, got ${arr.length}`);
    return false;
  }
  return true;
}

export function validateSectionCopy(type: SectionType, copy: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  switch (type) {
    case 'hero': {
      requireString(copy, 'headline', errors);
      requireString(copy, 'subheadline', errors);
      requireString(copy, 'ctaText', errors);
      if (typeof copy.headline === 'string') {
        const wc = wordCount(copy.headline);
        if (wc < 3 || wc > 8) errors.push(`headline must be 3-8 words, got ${wc}`);
      }
      if (typeof copy.subheadline === 'string') {
        const wc = wordCount(copy.subheadline);
        if (wc > 30) errors.push(`subheadline must be max 30 words, got ${wc}`);
      }
      if (typeof copy.ctaText === 'string') {
        const wc = wordCount(copy.ctaText);
        if (wc < 2 || wc > 5) errors.push(`ctaText must be 2-5 words, got ${wc}`);
      }
      break;
    }
    case 'problem':
      requireString(copy, 'headline', errors);
      requireString(copy, 'body', errors);
      break;
    case 'features':
      requireString(copy, 'sectionHeadline', errors);
      if (requireArray(copy, 'features', 3, 6, errors)) {
        for (const f of copy.features as { title?: string; description?: string }[]) {
          if (!f.title || !f.description) errors.push('Each feature must have title and description');
        }
      }
      break;
    case 'how-it-works':
      requireString(copy, 'sectionHeadline', errors);
      if (requireArray(copy, 'steps', 3, 5, errors)) {
        for (const s of copy.steps as { label?: string; description?: string }[]) {
          if (!s.label || !s.description) errors.push('Each step must have label and description');
        }
      }
      break;
    case 'audience':
      requireString(copy, 'sectionHeadline', errors);
      requireString(copy, 'body', errors);
      break;
    case 'objections':
      requireString(copy, 'sectionHeadline', errors);
      if (requireArray(copy, 'objections', 1, 10, errors)) {
        for (const o of copy.objections as { question?: string; answer?: string }[]) {
          if (!o.question || !o.answer) errors.push('Each objection must have question and answer');
        }
      }
      break;
    case 'final-cta':
      requireString(copy, 'headline', errors);
      requireString(copy, 'body', errors);
      requireString(copy, 'ctaText', errors);
      break;
    case 'faq':
      requireString(copy, 'sectionHeadline', errors);
      if (requireArray(copy, 'faqs', 1, 20, errors)) {
        for (const f of copy.faqs as { question?: string; answer?: string }[]) {
          if (!f.question || !f.answer) errors.push('Each FAQ must have question and answer');
        }
      }
      break;
    default:
      errors.push(`Unknown section type: ${type}`);
  }

  return { valid: errors.length === 0, errors };
}

export function validatePageMeta(meta: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  requireString(meta, 'metaTitle', errors);
  requireString(meta, 'metaDescription', errors);
  requireString(meta, 'ogDescription', errors);
  return { valid: errors.length === 0, errors };
}
