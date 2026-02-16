# Design Principles

EPCH Project Research is a product concept testing pipeline — a dark editorial dashboard where two power users track ideas from inception through SEO validation. The interface is bold, data-forward, and unapologetically technical.

## Design Direction

**Personality:** Boldness & Clarity meets Data & Analysis
- Dark-first with automatic light mode via `prefers-color-scheme`
- Data-forward with comfortable spacing — density where it earns it (tables, score comparisons), breathing room where it helps (section headers, card padding)
- Typography-driven hierarchy — Fraunces headlines bring editorial warmth to an otherwise technical interface. The serif-meets-data tension is the personality.
- Coral (#ff6b5b) as the primary action color. Stage identity colors are decorative, not informational.

**Emotional Job:** Momentum. Two collaborators deciding which product ideas to pursue need every screen to answer "what's the state of things, and what do I do next?" The interface should make progress feel inevitable — not by being minimal, but by making the next action obvious.

## Color Foundation

Dark charcoal base with coral accent. Light mode adapts automatically using cool zinc neutrals.

### Dark Mode (default)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#0d0d0f` | Page background |
| `--bg-secondary` | `#16161a` | Section backgrounds |
| `--bg-card` | `#1c1c21` | Card surfaces |
| `--bg-elevated` | `#232329` | Inputs, tooltips, elevated surfaces |
| `--text-primary` | `#f4f4f5` | Headlines, primary content |
| `--text-secondary` | `#a1a1aa` | Body text, descriptions |
| `--text-muted` | `#71717a` | Labels, placeholders, metadata (see contrast note below) |
| `--border-subtle` | `rgba(255,255,255,0.06)` | Card borders, dividers |
| `--border-default` | `rgba(255,255,255,0.1)` | Input borders, table rules |

### Light Mode

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#fafafa` | Page background |
| `--bg-secondary` | `#f4f4f5` | Section backgrounds |
| `--bg-card` | `#ffffff` | Card surfaces |
| `--bg-elevated` | `#ffffff` | Elevated surfaces |
| `--text-primary` | `#18181b` | Headlines, primary content |
| `--text-secondary` | `#52525b` | Body text |
| `--text-muted` | `#a1a1aa` | Labels, metadata |
| `--border-subtle` | `rgba(0,0,0,0.04)` | Card borders |
| `--border-default` | `rgba(0,0,0,0.08)` | Input borders |

### Accent & Semantic Colors

Colors fall into three tiers. Users should only need to internalize the first two.

**Tier 1 — Action** (the only color that means "do something"):

| Token | Value | Usage |
|-------|-------|-------|
| `--accent-coral` | `#ff6b5b` | Primary accent — buttons, active states, focus rings, selection, ranks |
| `--accent-coral-soft` | `rgba(255,107,91,0.15)` | Coral tint backgrounds, inline tags |

**Tier 2 — Semantic** (traffic-light mental model: green/amber/red + blue for info):

| Token | Value | Usage |
|-------|-------|-------|
| `--accent-emerald` | `#10b981` | Good — success, positive performance, high scores, "Getting clicks" |
| `--accent-amber` | `#f59e0b` | Caution — warnings, medium confidence, "Impressions only" |
| `--color-danger` | `#f87171` | Bad — errors, negative performance, declining metrics, low scores |
| `--color-info` | `#60a5fa` | Neutral info — "Published" state, informational badges |

**Tier 3 — Stage identity** (decorative — not informational, just visual variety):

| Token | Value | Usage |
|-------|-------|-------|
| `--accent-violet` | `#8b5cf6` | Analytics, secondary chart series |
| `--color-sky` | `#38bdf8` | Website stage header glow |
| `--color-purple-light` | `#a78bfa` | Content stage header glow, keyword tags |
| `--color-pink` | `#f472b6` | Optimization stage header glow |

Stage identity colors appear in header gradient blurs and inline tags. They never carry meaning a user needs to decode — removing them would lose aesthetics, not information.

### Contrast Notes

`--text-muted` (#71717a) on `--bg-card` (#1c1c21) yields ~3.2:1 contrast — passes WCAG AA for large text (18px+) but fails for body text. This is acceptable for its current usage (labels, placeholders, timestamps, metadata captions) which are supplementary, never primary content. Do not use `--text-muted` for body text or anything a user needs to read to complete a task. If muted text must appear at small sizes in critical contexts, use `--text-secondary` instead.

In light mode, `--accent-coral` (#ff6b5b) on white (#ffffff) yields ~3.3:1. Coral should be used for interactive elements (buttons with white text, focus rings, borders) not as text color on white backgrounds. In light mode, coral text is acceptable on `--bg-secondary` (#f4f4f5) or darker.

## Typography

- **Display:** Fraunces (serif via `next/font/google`) — page titles, section headers, metric numbers, rank indicators
- **Body:** DM Sans (sans-serif via `next/font/google`) — body text, buttons, labels, table content

```css
--font-display: var(--font-fraunces), Georgia, serif;
--font-body: var(--font-dm-sans), system-ui, sans-serif;
```

### Hierarchy

| Element | Font | Weight | Size | Tracking |
|---------|------|--------|------|----------|
| Page title | Fraunces | 500 | 24-30px (`text-2xl`/`text-3xl`) | -0.02em |
| Section header | Fraunces | 500 | 18px (`text-lg`) | -0.02em |
| Card header | Fraunces | 500 | 16px (`text-base`) | -0.02em |
| Metric number | Fraunces | 600 | 30px (`text-3xl`) | — |
| Body text | DM Sans | 400 | 14-15px | — |
| Table header | DM Sans | 500 | 12px | 0.05em uppercase |
| Label/caption | DM Sans | 500 | 13px | 0.05em uppercase |
| Badge | DM Sans | 600 | 11px | 0.05em uppercase |
| Small data | DM Sans | 400 | 12-13px | — |

### Data Typography

Use `tabular-nums` for all numeric columns in tables. Monospace styling for IDs, codes, and timestamps.

## Spacing

4px base grid:
- `4px` — micro (icon gaps, badge internal)
- `8px` — tight (within components, between inline elements)
- `12px` — standard (between related elements)
- `16px` — comfortable (card padding on mobile, 20px on desktop)
- `20-24px` — generous (card padding desktop `p-5`/`p-6`, section gaps)
- `32-48px` — major separation (between page sections: `space-y-8`/`space-y-12`)

Card padding follows responsive pattern: `p-4` on mobile, `p-5 sm:p-6` on desktop.

## Border Radius

```css
--radius-sm: 0.5rem;   /* 8px — buttons, inputs, small tags */
--radius-md: 0.75rem;  /* 12px — button containers, tooltips */
--radius-lg: 1rem;     /* 16px — cards (primary card radius) */
--radius-xl: 1.5rem;   /* 24px — large containers */
--radius-full: 9999px; /* pills, badges, avatar circles */
```

Cards use `--radius-lg` (16px). Badges use `--radius-full`. Inputs and buttons use `--radius-md`.

## Depth & Elevation

Borders + shadows together. Dark mode relies more on border definition; shadows add atmosphere.

```css
/* Card shadow */
--shadow-card: 0 4px 24px rgba(0, 0, 0, 0.4);       /* dark */
--shadow-card: 0 4px 24px rgba(0, 0, 0, 0.06);      /* light */

/* Elevated shadow */
--shadow-elevated: 0 8px 32px rgba(0, 0, 0, 0.5);   /* dark */
--shadow-elevated: 0 8px 32px rgba(0, 0, 0, 0.1);   /* light */
```

### Card Hover Behavior

Interactive cards (`.card`) lift on hover with coral glow:
```css
.card:hover {
  border-color: var(--border-default);
  box-shadow: var(--shadow-elevated), 0 0 0 1px rgba(255, 107, 91, 0.1);
  transform: translateY(-3px);
}
```

Static cards (`.card-static`) have no hover — used for tables, charts, and content containers.

## Component Patterns

### Cards

Two types:
- **`.card`** — interactive, clickable. Has hover lift + coral glow ring. Used for analysis cards, pipeline cards, leaderboard rows on mobile.
- **`.card-static`** — non-interactive container. No hover. Used for tables, charts, form sections, empty states.

Both share: `background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg)`.

### Buttons

```css
.btn-primary   /* Coral gradient (135deg #ff6b5b → #ff8f6b), white text, coral glow shadow */
.btn-secondary /* bg-elevated, border-default, hover: lighter bg + stronger border */
.btn-ghost     /* Transparent, secondary text, hover: elevated bg */
.btn-danger    /* Transparent, red text, red border, hover: red tint bg */
```

### Badges

Two patterns:
- **Pill badges** (`.badge-*`): Gradient backgrounds with colored borders, uppercase, full-round. For tier/status indicators (Tier 1, Tier 2, Tier 3).
- **Inline tags**: Flat `rgba()` tint backgrounds, no border, smaller. For feature indicators (Competitors, Keywords, Content, Analytics).

### Inputs

`bg-elevated` background, `border-default` border. Focus state: coral border + coral soft ring (`0 0 0 3px var(--accent-coral-soft)`). Labels are uppercase, muted, 13px with tracking.

### Tables

- Desktop: full table with sortable headers (active sort column highlighted in coral)
- Mobile: card-based fallback — each row becomes a stacked card with grid layout
- Table headers: uppercase, muted, xs font, wider tracking
- Row borders: `border-subtle`; header border: `border-default`

### Score Rings

SVG circular progress indicators for analysis scores (Competition, WTP, Differentiation, SEO). Color-coded by value: emerald (7+), amber (4-6), danger (<4). Glow effect on high scores. Hover: scale(1.1).

### Status Colors

Uses the Tier 1 + Tier 2 color system. A user scanning the screen should be able to read status with a traffic-light mental model:
- **Green** (emerald): good — success, positive, high scores, "Getting clicks"
- **Amber**: caution — medium confidence, "Impressions only"
- **Red** (danger): bad — errors, declining, low scores
- **Blue** (info): neutral information — "Published"
- **Coral**: active/in-progress — generating, selected, processing
- **Gray**: nothing yet — "No data", pending, not started

## Responsive Breakpoints

Two breakpoints drive layout changes:

| Breakpoint | Tailwind | Layout behavior |
|------------|----------|-----------------|
| < 640px | default | Mobile: vertical stacks, bottom tab nav, card-based table fallbacks |
| 640-1023px | `sm:` | Tablet: multi-column grids (e.g. 3-col pipeline), top nav visible, tables appear |
| 1024px+ | `lg:` | Desktop: full horizontal layouts (e.g. pipeline row with arrows), all columns visible |

Pipeline-specific: Mobile = vertical stack with down-arrows. Tablet = 3-col grid, no arrows. Desktop = horizontal row with right-arrows.

## Navigation

### Desktop (sm+)
Sticky top nav with glassmorphism: `backdrop-blur(16px)`, semi-transparent background, subtle bottom border. Logo left, 6 text nav links right. Active link: coral text color.

### Mobile (< sm)
Fixed bottom tab bar with the same glassmorphism treatment, top border instead of bottom. Icon + label for each of the 6 pipeline stages. Active tab: coral color. Desktop nav links hidden.

### Section Headers
Each page uses a header pattern with: Fraunces title, secondary text description, and a subtle colored radial gradient blur behind (Tier 3 stage identity color, decorative only).

## Animations

- **Entrance:** `slide-up` — 0.6s ease, translateY(20px) → 0, with staggered delays (0.05s increments)
- **Hover transitions:** 0.2-0.3s cubic-bezier(0.4, 0, 0.2, 1)
- **Loading:** shimmer effect — gradient sweep across skeleton elements
- **Idle/processing:** float (translateY oscillation), glow-pulse (coral shadow oscillation)
- **Micro-interactions:** 150ms for button presses, checkbox toggles

No spring or bouncy effects. No page transitions.

## Texture

Noise overlay at 2% opacity over the entire viewport (SVG feTurbulence filter, fixed position). Adds subtle tactile quality to the dark surfaces without being visible on light mode.

## Anti-Patterns

Never:
- Warm foundation colors (creams, warm grays) — this is a cool/neutral palette
- Tier 3 colors carrying meaning — stage identity colors are decorative only
- New accent colors without clear Tier 2 semantic purpose
- Decorative gradients (the coral button gradient is the only one)
- `--text-muted` for body text or critical content (contrast too low)
- `--accent-coral` as text on white backgrounds in light mode
- Border radius > 24px on anything except pills/badges
- Heavy asymmetric padding
- Spring/bouncy animations

## Questions to Ask

When designing new components:
1. Can I read this at a glance, or do I have to study it?
2. Does this use color for meaning (status, action, performance) or decoration?
3. Does this have a mobile-responsive fallback? (Tables → card stacks)
4. Am I using `var(--token)` or hardcoding colors?
5. Is the hover/interaction pattern consistent with `.card` or `.card-static`?
6. Does numeric data use `tabular-nums`?
