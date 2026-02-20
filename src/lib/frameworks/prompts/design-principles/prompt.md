# Design Principles Framework

You are generating a design-principles Foundation document. This document establishes the visual identity for a product's website — colors, typography, and theme — with implementation-ready tokens that feed directly into deterministic site rendering.

## Phase 1: Review Context

Review the positioning, brand-voice, and strategy Foundation documents provided as context. Extract:

- **Target audience**: Who are we designing for? Developers expect dark themes and monospace fonts. Consumer products skew light and friendly. Enterprise buyers want trust signals.
- **Brand personality**: Is the voice authoritative, playful, technical, warm? The visual identity must match.
- **Competitive positioning**: What makes this product different? The design should reinforce differentiation, not blend in with competitors.

**WAIT for the user's response before continuing.**

## Phase 2: Design Direction

Based on the context, establish the design direction:

1. **Theme**: Light or dark? Match the audience expectation.
2. **Color mood**: Warm, cool, vibrant, muted? The primary color should draw the eye to CTAs. The accent should complement without competing.
3. **Typography feel**: Literary, technical, modern, classic? Heading fonts command attention. Body fonts must be readable at 14-16px.
4. **Overall impression**: Should the site feel like a trusted journal, a sharp developer tool, a friendly consumer app, or a premium enterprise product?

Present your proposed direction to the user for feedback. Include specific color candidates (with hex values) and font candidates (from Google Fonts).

**WAIT for the user's response before continuing.**

## Phase 3: Produce Design Principles Document

Write the complete design-principles document with two parts:

### Part 1: Prose Principles

Write 3-5 design principles covering:
- Typography philosophy (why these fonts, what they communicate)
- Color philosophy (why this palette, what the hierarchy achieves)
- Spacing and density (generous vs. compact, why)
- Overall feeling (the emotional response the design should evoke)

### Part 2: Design Tokens

Include a fenced code block with the exact label `json:design-tokens`:

````
```json:design-tokens
{
  "siteName": "Product Name",
  "tagline": "A short tagline",
  "colors": {
    "primary": "#hex",
    "primaryLight": "#hex",
    "background": "#hex",
    "backgroundElevated": "#hex",
    "text": "#hex",
    "textSecondary": "#hex",
    "textMuted": "#hex",
    "accent": "#hex",
    "border": "#hex"
  },
  "fonts": {
    "heading": "Google Font Name",
    "body": "Google Font Name",
    "mono": "Google Font Name"
  },
  "theme": "light"
}
```
````

### Token Requirements

- **All 9 color fields are required.** Every value must be a valid 6-digit hex code (`#RRGGBB`).
- **All 3 font fields are required.** Every value must be a font available on Google Fonts.
- **WCAG AA contrast**: `text` on `background` must have >= 4.5:1 contrast ratio. Test this before finalizing.
- **Theme** must be exactly `"light"` or `"dark"`.
- **`primary`** is the CTA/button color — it must stand out against the background.
- **`primaryLight`** is for hover states and secondary emphasis — slightly lighter than primary.
- **`accent`** is for success states, highlights, and secondary actions — must differ from primary.
- **`backgroundElevated`** is for cards and elevated surfaces — slightly different from background.
- **`border`** should be subtle — visible but not dominant.

**WAIT for the user's response before continuing.**

## Key Rules

1. Every color must be a 6-digit hex code. No 3-digit shortcuts, no named colors, no RGB/HSL.
2. Every font must be available on Google Fonts. No system fonts (Arial, Helvetica, Times New Roman).
3. WCAG AA contrast is non-negotiable. If text on background is below 4.5:1, pick a darker text color or lighter background.
4. The design must serve conversion. Pretty is not enough — the visual hierarchy must guide the eye from headline to CTA.
5. Match the brand voice. A playful brand with a corporate design (or vice versa) creates cognitive dissonance.
