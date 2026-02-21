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

Write the complete design-principles document:

### Design Principles (3-5)
Each principle should cover one of:
- Typography philosophy (why these fonts, what they communicate)
- Color philosophy (why this palette, what the hierarchy achieves)
- Spacing and density (generous vs. compact, why)
- Overall feeling (the emotional response the design should evoke)

### Color Palette
Describe the complete color palette with hex values inline (e.g., "a warm coral `#FF6B5B` for primary actions"):
- **Primary color** (CTAs, buttons) and a lighter variant for hover states
- **Background** and an elevated surface color (for cards)
- **Text colors**: primary, secondary, and muted
- **Accent color** (highlights, success states — distinct from primary)
- **Border color** (subtle, visible but not dominant)

All colors must be 6-digit hex codes (`#RRGGBB`). No 3-digit shortcuts, no named colors.

### Typography
Specify three fonts from Google Fonts:
- **Heading font**: What it communicates, why it fits the brand
- **Body font**: Readability and personality
- **Monospace font**: For code or technical content

### Theme
State whether the site uses a **light** or **dark** theme and explain why it fits the audience and brand personality.

### Contrast
Ensure that the primary text color on the background color has sufficient contrast for readability (WCAG AA: at least 4.5:1 contrast ratio).

**WAIT for the user's response before continuing.**

## Key Rules

1. Every color must be a 6-digit hex code. No 3-digit shortcuts, no named colors, no RGB/HSL.
2. Every font must be available on Google Fonts. No system fonts (Arial, Helvetica, Times New Roman).
3. Text on background should meet WCAG AA contrast (4.5:1). If it doesn't, adjust.
4. The design must serve conversion. The visual hierarchy must guide the eye from headline to CTA.
5. Match the brand voice. A playful brand with a corporate design creates cognitive dissonance.
