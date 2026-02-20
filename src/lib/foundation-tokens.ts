import { contrastRatio } from './contrast-utils';

// New BrandIdentity shape — Task 4 updates @/types to match this.
// Once that's done, this local type will be replaced with an import.
export interface ExtractedBrand {
  siteName: string;
  tagline: string;
  siteUrl: string;
  colors: {
    primary: string;
    primaryLight: string;
    background: string;
    backgroundElevated: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    border: string;
  };
  fonts: {
    heading: string;
    body: string;
    mono: string;
  };
  theme: 'light' | 'dark';
}

type ExtractionResult =
  | { ok: true; brand: ExtractedBrand }
  | { ok: false; error: string };

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;
const REQUIRED_COLOR_FIELDS = [
  'primary', 'primaryLight', 'background', 'backgroundElevated',
  'text', 'textSecondary', 'textMuted', 'accent', 'border',
] as const;
const REQUIRED_FONT_FIELDS = ['heading', 'body', 'mono'] as const;

export function extractBrandFromDesignPrinciples(
  docContent: string,
  siteUrl: string,
): ExtractionResult {
  // 1. Find json:design-tokens block
  const blockRegex = /```json:design-tokens\s*\n([\s\S]*?)\n```/;
  const match = docContent.match(blockRegex);
  if (!match) {
    return { ok: false, error: 'No ```json:design-tokens``` block found in design-principles document.' };
  }

  // 2. Parse JSON
  let tokens: Record<string, unknown>;
  try {
    tokens = JSON.parse(match[1]);
  } catch (e) {
    return { ok: false, error: `Failed to parse json:design-tokens block: ${e instanceof Error ? e.message : String(e)}` };
  }

  // 3. Validate required top-level strings
  if (typeof tokens.siteName !== 'string' || !tokens.siteName) {
    return { ok: false, error: 'siteName is missing or not a string' };
  }
  if (typeof tokens.tagline !== 'string' || !tokens.tagline) {
    return { ok: false, error: 'tagline is missing or not a string' };
  }

  // 4. Validate colors
  const colors = tokens.colors as Record<string, unknown> | undefined;
  if (!colors || typeof colors !== 'object') {
    return { ok: false, error: 'colors object is missing' };
  }
  const missingColors = REQUIRED_COLOR_FIELDS.filter((f) => typeof colors[f] !== 'string');
  if (missingColors.length > 0) {
    return { ok: false, error: `colors missing fields: ${missingColors.join(', ')}` };
  }
  const invalidHex = REQUIRED_COLOR_FIELDS.filter((f) => !HEX_REGEX.test(colors[f] as string));
  if (invalidHex.length > 0) {
    return { ok: false, error: `Invalid hex values for: ${invalidHex.join(', ')}` };
  }

  // 5. Validate fonts
  const fonts = tokens.fonts as Record<string, unknown> | undefined;
  if (!fonts || typeof fonts !== 'object') {
    return { ok: false, error: 'fonts object is missing' };
  }
  const invalidFonts = REQUIRED_FONT_FIELDS.filter((f) => typeof fonts[f] !== 'string' || !fonts[f]);
  if (invalidFonts.length > 0) {
    return { ok: false, error: `Invalid or missing font values for: ${invalidFonts.join(', ')}` };
  }

  // 6. Validate theme
  if (tokens.theme !== 'light' && tokens.theme !== 'dark') {
    return { ok: false, error: `theme must be 'light' or 'dark', got '${tokens.theme}'` };
  }

  // 7. WCAG AA contrast check (text on background >= 4.5:1)
  const textColor = colors.text as string;
  const bgColor = colors.background as string;
  const ratio = contrastRatio(textColor, bgColor);
  if (ratio < 4.5) {
    return { ok: false, error: `WCAG AA contrast check failed: text (${textColor}) on background (${bgColor}) has ratio ${ratio.toFixed(1)}:1, minimum is 4.5:1` };
  }

  return {
    ok: true,
    brand: {
      siteName: tokens.siteName as string,
      tagline: tokens.tagline as string,
      siteUrl,
      colors: {
        primary: colors.primary as string,
        primaryLight: colors.primaryLight as string,
        background: colors.background as string,
        backgroundElevated: colors.backgroundElevated as string,
        text: colors.text as string,
        textSecondary: colors.textSecondary as string,
        textMuted: colors.textMuted as string,
        accent: colors.accent as string,
        border: colors.border as string,
      },
      fonts: {
        heading: fonts.heading as string,
        body: fonts.body as string,
        mono: fonts.mono as string,
      },
      theme: tokens.theme as 'light' | 'dark',
    },
  };
}
