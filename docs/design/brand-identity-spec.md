# EPCH Project Research — Brand Identity Specification

This document provides complete specifications for recreating the EPCH brand identity, logo, and design system. It serves as both a design principles reference and a prompt for AI code generation.

---

## Brand Overview

**Product:** EPCH Project Research — a product concept testing pipeline
**Users:** Two power users (collaborators) tracking product ideas from inception through SEO validation
**Personality:** Bold, data-forward, unapologetically technical
**Emotional Job:** Momentum. Every screen answers "what's the state of things, and what do I do next?"

---

## Logo & Logo Mark

### Logo Mark (Icon)

The EPCH logo mark is a coral circle containing the text "EPCH" framed by curly braces, evoking code syntax and technical precision.

**SVG Specification:**

```svg
<svg width="200" height="200" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="100" fill="#F07563"/>
  <text x="100" y="65" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-weight="800" font-size="48" fill="white" opacity="0.65">{</text>
  <text x="100" y="118" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-weight="700" font-size="39" fill="white" letter-spacing="3">EPCH</text>
  <text x="100" y="162" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-weight="800" font-size="48" fill="white" opacity="0.65">}</text>
</svg>
```

**Construction Details:**

| Element | Value |
|---------|-------|
| Canvas | 200×200px viewBox |
| Background | Circle, r=100, fill `#F07563` (warm coral) |
| Opening brace `{` | y=65, font-size=48, font-weight=800, opacity=0.65 |
| "EPCH" text | y=118, font-size=39, font-weight=700, letter-spacing=3 |
| Closing brace `}` | y=162, font-size=48, font-weight=800, opacity=0.65 |
| Font | `ui-monospace, SFMono-Regular, monospace` (system monospace) |
| Text color | White (`#FFFFFF`) |

**Size Variants:**
- Navigation: 36×36px
- Favicon: 32×32px, 16×16px
- Social/OG: 200×200px or larger

### Full Logo (Lockup)

Logo mark + wordmark displayed together:

```
[Logo Mark]  EPCH Project Research
```

- Wordmark font: Fraunces (serif), font-weight 500, text-lg (18px)
- Gap between mark and text: 12px (gap-3)
- Mobile: Wordmark truncates to "EPCH"

### Logo Colors

| Context | Logo Mark Fill | Text Color |
|---------|---------------|------------|
| Dark backgrounds | `#F07563` | White on mark, `--text-primary` for wordmark |
| Light backgrounds | `#F07563` | White on mark, `--text-primary` for wordmark |

The coral circle provides consistent recognition across both modes.

---

## Color System

### Design Philosophy

Dark-first with automatic light mode via `prefers-color-scheme`. Cool neutral base with warm coral accent. Three-tier color system:

1. **Tier 1 — Action:** Coral. The only color meaning "do something"
2. **Tier 2 — Semantic:** Traffic-light model (green/amber/red + blue for info)
3. **Tier 3 — Stage Identity:** Decorative only, no meaning to decode

### Dark Mode (Default)

```css
:root {
  /* Backgrounds */
  --bg-primary: #0d0d0f;      /* Page background */
  --bg-secondary: #16161a;    /* Section backgrounds */
  --bg-card: #1c1c21;         /* Card surfaces */
  --bg-elevated: #232329;     /* Inputs, tooltips, elevated surfaces */

  /* Text */
  --text-primary: #f4f4f5;    /* Headlines, primary content */
  --text-secondary: #a1a1aa;  /* Body text, descriptions */
  --text-muted: #71717a;      /* Labels, placeholders, metadata */

  /* Borders */
  --border-subtle: rgba(255, 255, 255, 0.06);   /* Card borders, dividers */
  --border-default: rgba(255, 255, 255, 0.1);   /* Input borders, table rules */

  /* Shadows */
  --shadow-card: 0 4px 24px rgba(0, 0, 0, 0.4);
  --shadow-elevated: 0 8px 32px rgba(0, 0, 0, 0.5);
}
```

### Light Mode

```css
@media (prefers-color-scheme: light) {
  :root {
    --bg-primary: #fafafa;
    --bg-secondary: #f4f4f5;
    --bg-card: #ffffff;
    --bg-elevated: #ffffff;

    --text-primary: #18181b;
    --text-secondary: #52525b;
    --text-muted: #a1a1aa;

    --border-subtle: rgba(0, 0, 0, 0.04);
    --border-default: rgba(0, 0, 0, 0.08);

    --shadow-card: 0 4px 24px rgba(0, 0, 0, 0.06);
    --shadow-elevated: 0 8px 32px rgba(0, 0, 0, 0.1);
  }
}
```

### Accent Colors

```css
:root {
  /* Tier 1 — Action */
  --accent-coral: #ff6b5b;
  --accent-coral-soft: rgba(255, 107, 91, 0.15);

  /* Tier 2 — Semantic */
  --accent-emerald: #10b981;   /* Good — success, high scores */
  --accent-amber: #f59e0b;     /* Caution — warnings, medium confidence */
  --color-danger: #f87171;     /* Bad — errors, low scores */
  --color-info: #60a5fa;       /* Neutral info — "Published" state */

  /* Tier 3 — Stage Identity (decorative) */
  --accent-violet: #8b5cf6;    /* Analytics */
  --color-sky: #38bdf8;        /* Website stage */
  --color-purple-light: #a78bfa; /* Content stage */
  --color-pink: #f472b6;       /* Optimization stage */
}
```

---

## Typography

### Font Stack

```css
:root {
  --font-display: var(--font-fraunces), Georgia, serif;
  --font-body: var(--font-dm-sans), system-ui, sans-serif;
}
```

**Loading (Next.js):**

```typescript
import { Fraunces, DM_Sans } from 'next/font/google';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fraunces',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});
```

### Type Scale

| Element | Font | Weight | Size | Tracking |
|---------|------|--------|------|----------|
| Page title | Fraunces | 500 | 24-30px | -0.02em |
| Section header | Fraunces | 500 | 18px | -0.02em |
| Card header | Fraunces | 500 | 16px | -0.02em |
| Metric number | Fraunces | 600 | 30px | — |
| Body text | DM Sans | 400 | 14-15px | — |
| Table header | DM Sans | 500 | 12px | 0.05em uppercase |
| Label/caption | DM Sans | 500 | 13px | 0.05em uppercase |
| Badge | DM Sans | 600 | 11px | 0.05em uppercase |

### Heading Styles

```css
h1, h2, h3 {
  font-family: var(--font-display);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
```

---

## Spacing & Layout

### Base Grid

4px base unit:
- `4px` — micro (icon gaps, badge internal)
- `8px` — tight (within components)
- `12px` — standard (between related elements)
- `16px` — comfortable (card padding mobile)
- `20-24px` — generous (card padding desktop)
- `32-48px` — major (page sections)

### Border Radius

```css
:root {
  --radius-sm: 0.5rem;    /* 8px — buttons, inputs */
  --radius-md: 0.75rem;   /* 12px — button containers, tooltips */
  --radius-lg: 1rem;      /* 16px — cards (primary) */
  --radius-xl: 1.5rem;    /* 24px — large containers */
  --radius-full: 9999px;  /* pills, badges */
}
```

### Container

```css
.container-app {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

@media (min-width: 640px) {
  .container-app { padding: 0 1.5rem; }
}
```

---

## Components

### Cards

Two types:

**Interactive Card (`.card`):**
```css
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.card:hover {
  border-color: var(--border-default);
  box-shadow: var(--shadow-elevated), 0 0 0 1px rgba(255, 107, 91, 0.1);
  transform: translateY(-3px);
}
```

**Static Card (`.card-static`):**
```css
.card-static {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  /* No hover effects */
}
```

### Buttons

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: var(--radius-md);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  border: none;
}

.btn-primary {
  background: linear-gradient(135deg, #ff6b5b 0%, #ff8f6b 100%);
  color: white;
  box-shadow: 0 4px 14px rgba(255, 107, 91, 0.4);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(255, 107, 91, 0.5);
}

.btn-secondary {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  padding: 0.5rem 0.75rem;
}

.btn-danger {
  background: transparent;
  color: var(--color-danger);
  border: 1px solid rgba(239, 68, 68, 0.3);
}
```

### Badges

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border-radius: var(--radius-full);
}

.badge-success {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(52, 211, 153, 0.1) 100%);
  color: var(--accent-emerald);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.badge-warning {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(251, 191, 36, 0.1) 100%);
  color: var(--accent-amber);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.badge-danger {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(248, 113, 113, 0.1) 100%);
  color: var(--color-danger);
  border: 1px solid rgba(239, 68, 68, 0.3);
}
```

### Inputs

```css
.input {
  width: 100%;
  padding: 0.875rem 1rem;
  font-family: var(--font-body);
  font-size: 1rem;
  color: var(--text-primary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
}

.input:focus {
  outline: none;
  border-color: var(--accent-coral);
  box-shadow: 0 0 0 3px var(--accent-coral-soft);
}

.input-label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

---

## Navigation

### Desktop (sm+)

Sticky top nav with glassmorphism:

```css
.nav-blur {
  background: rgba(13, 13, 15, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border-subtle);
}

@media (prefers-color-scheme: light) {
  .nav-blur {
    background: rgba(250, 250, 250, 0.9);
  }
}
```

**Navigation Items:**
- Ideation, Analysis, Foundation, Website, Content, Testing, Optimization
- Active link: coral text color (`--accent-coral`)
- Style: `.btn-ghost` with rounded-lg

### Mobile

Fixed bottom tab bar with same glassmorphism, top border instead of bottom.

---

## Animations

```css
@keyframes slide-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 20px rgba(255, 107, 91, 0.3); }
  50% { box-shadow: 0 0 40px rgba(255, 107, 91, 0.5); }
}

.animate-slide-up {
  animation: slide-up 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  opacity: 0;
}

/* Staggered entrance */
.stagger-1 { animation-delay: 0.05s; }
.stagger-2 { animation-delay: 0.1s; }
.stagger-3 { animation-delay: 0.15s; }
```

---

## Texture

Noise overlay for dark mode atmosphere:

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  opacity: 0.02;
  pointer-events: none;
  z-index: 40;
}
```

---

## Anti-Patterns

Never use:
- Warm foundation colors (creams, warm grays) — this is a cool/neutral palette
- Tier 3 colors carrying meaning — decorative only
- `--text-muted` for body text (contrast too low)
- `--accent-coral` as text on white in light mode
- Border radius > 24px except pills/badges
- Spring/bouncy animations
- Decorative gradients (only the coral button gradient is allowed)

---

## Responsive Breakpoints

| Breakpoint | Tailwind | Layout |
|------------|----------|--------|
| < 640px | default | Mobile: vertical stacks, bottom nav, card tables |
| 640-1023px | `sm:` | Tablet: multi-column grids, top nav |
| 1024px+ | `lg:` | Desktop: full horizontal layouts |

---

## Claude Code Recreation Prompt

Use this prompt to instruct another Claude Code instance to recreate the design system:

```
Create a Next.js application with the EPCH Project Research design system:

LOGO:
- 200x200 SVG circle, fill #F07563 (coral)
- Monospace text inside: opening brace "{" at y=65 (opacity 0.65), "EPCH" at y=118 (letter-spacing 3), closing brace "}" at y=162 (opacity 0.65)
- All text white, font-weight 700-800
- Display at 36x36px in navigation with "EPCH Project Research" wordmark (Fraunces font)

COLORS:
- Dark mode default: #0d0d0f page bg, #1c1c21 cards, #232329 elevated
- Light mode via prefers-color-scheme: #fafafa page bg, #ffffff cards
- Primary accent: #ff6b5b (coral) — buttons, focus states, active nav
- Semantic: #10b981 success, #f59e0b warning, #f87171 danger, #60a5fa info
- Text: #f4f4f5 primary, #a1a1aa secondary, #71717a muted (dark mode)

TYPOGRAPHY:
- Display: Fraunces serif (next/font/google), weight 500, tracking -0.02em
- Body: DM Sans sans-serif (next/font/google), weight 400-600
- Headlines use Fraunces, body uses DM Sans

COMPONENTS:
- Cards: bg-card, 1px border-subtle, radius 16px, shadow. Interactive cards lift on hover with coral glow.
- Primary buttons: coral gradient (135deg #ff6b5b to #ff8f6b), white text, coral shadow
- Inputs: bg-elevated, focus shows coral border + coral-soft ring
- Badges: full-round pills, gradient backgrounds with colored borders

NAVIGATION:
- Sticky top nav with glassmorphism (backdrop-blur-xl, 85% opacity bg)
- Mobile: fixed bottom tab bar
- Active links: coral text color

ANIMATIONS:
- Entrance: slide-up 0.6s with staggered delays
- Hover transitions: 0.2-0.3s cubic-bezier(0.4, 0, 0.2, 1)
- Loading: shimmer gradient sweep
- No spring/bouncy effects

TEXTURE:
- 2% opacity noise overlay on body (SVG feTurbulence)

Use Tailwind CSS 4 with @import 'tailwindcss' syntax. Define CSS custom properties in globals.css for all tokens.
```

---

*Last updated: February 2026*
