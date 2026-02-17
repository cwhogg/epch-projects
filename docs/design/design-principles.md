# Design Principles

EPCH Project Research is a product concept testing pipeline — a warm editorial dashboard where two power users track ideas from inception through SEO validation. The interface is approachable, data-forward, and typographically rich.

## Design Direction

**Personality:** Warmth & Approachability meets Data & Analysis
- Warm white with stone-tinted neutrals (not cool zinc/slate). No dark mode.
- Data-forward with comfortable spacing — density where it earns it (tables, score comparisons), breathing room where it helps (section headers, card padding)
- Typography-driven hierarchy — Fraunces headlines bring editorial warmth that shines on the warm white foundation. The serif-meets-data tension is the personality.
- Coral (#ff6b5b) as the primary action color. Vibrant and alive on warm white.

**Emotional Job:** Momentum. Two collaborators deciding which product ideas to pursue need every screen to answer "what's the state of things, and what do I do next?" The interface should make progress feel inevitable — not by being minimal, but by making the next action obvious.

## Color Foundation

Warm off-white base with coral accent. No dark mode — light only.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#FAF9F7` | Page background — warm off-white with stone undertone |
| `--bg-secondary` | `#F3F2EF` | Section backgrounds — warm light gray |
| `--bg-card` | `#FFFFFF` | Card surfaces — pure white |
| `--bg-elevated` | `#FFFFFF` | Inputs, tooltips, elevated surfaces |
| `--text-primary` | `#1C1917` | Headlines, primary content — stone-900 |
| `--text-secondary` | `#57534E` | Body text, descriptions — stone-600 |
| `--text-muted` | `#94918C` | Labels, placeholders, metadata — warm gray |
| `--border-subtle` | `rgba(28, 25, 23, 0.06)` | Card borders, dividers |
| `--border-default` | `rgba(28, 25, 23, 0.10)` | Input borders, table rules |

### Accent & Semantic Colors

Colors fall into three tiers. Users should only need to internalize the first two.

**Tier 1 — Action** (the only color that means "do something"):

| Token | Value | Usage |
|-------|-------|-------|
| `--accent-coral` | `#ff6b5b` | Primary accent — buttons, active states, focus rings, selection, ranks |
| `--accent-coral-soft` | `rgba(255, 107, 91, 0.12)` | Coral tint backgrounds, inline tags |

**Tier 2 — Semantic** (traffic-light mental model: green/amber/red + blue for info):

| Token | Value | Usage |
|-------|-------|-------|
| `--accent-emerald` | `#10b981` | Good — success, positive performance, high scores |
| `--accent-amber` | `#f59e0b` | Caution — warnings, medium confidence |
| `--color-danger` | `#ef4444` | Bad — errors, negative performance, low scores |
| `--color-info` | `#3b82f6` | Neutral info — "Published" state, informational badges |

**Tier 3 — Stage identity** (decorative — not informational, just visual variety):

| Token | Value | Usage |
|-------|-------|-------|
| `--accent-violet` | `#8b5cf6` | Analytics, secondary chart series |
| `--color-sky` | `#38bdf8` | Website stage header glow |
| `--color-purple-light` | `#a78bfa` | Content stage header glow, keyword tags |
| `--color-pink` | `#f472b6` | Optimization stage header glow |

Stage identity colors appear in header gradient blurs and inline tags. They never carry meaning a user needs to decode — removing them would lose aesthetics, not information.

### Contrast Notes

`--text-muted` (#94918C) on `--bg-card` (#FFFFFF) yields ~3.5:1 contrast — passes WCAG AA for large text (18px+) and is comfortable for supplementary content at smaller sizes. Still not recommended for body text or primary content. If muted text must appear in critical contexts, use `--text-secondary` instead.

`--accent-coral` (#ff6b5b) on `--bg-card` (#FFFFFF) yields ~3.3:1. Coral should be used for interactive elements (buttons with white text, focus rings, borders) not as text color on white backgrounds. For coral text, use on `--bg-secondary` (#F3F2EF) or darker, or increase font weight/size.

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

Subtle single shadows on warm white. Cards sit gently on the page — lift, not float. The warm stone-tinted page background provides natural surface contrast against white cards, so shadows can stay light.

```css
--shadow-card: 0 1px 3px rgba(28, 25, 23, 0.06), 0 1px 2px rgba(28, 25, 23, 0.04);
--shadow-elevated: 0 4px 12px rgba(28, 25, 23, 0.08), 0 1px 3px rgba(28, 25, 23, 0.06);
```

### Card Hover Behavior

Interactive cards (`.card`) lift subtly on hover with a coral accent:
```css
.card:hover {
  border-color: var(--border-default);
  box-shadow: var(--shadow-elevated), 0 0 0 1px rgba(255, 107, 91, 0.12);
  transform: translateY(-2px);
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
.btn-secondary /* bg-elevated, border-default, hover: slightly darker bg */
.btn-ghost     /* Transparent, secondary text, hover: elevated bg */
.btn-danger    /* Transparent, red text, red border, hover: red tint bg */
```

### Badges

Two patterns:
- **Pill badges** (`.badge-*`): Flat tint backgrounds with colored borders, uppercase, full-round. For tier/status indicators.
- **Inline tags**: Flat `rgba()` tint backgrounds, no border, smaller. For feature indicators.

### Inputs

`bg-elevated` background (white), `border-default` border. Focus state: coral border + coral soft ring (`0 0 0 3px var(--accent-coral-soft)`). Labels are uppercase, muted, 13px with tracking.

### Tables

- Desktop: full table with sortable headers (active sort column highlighted in coral)
- Mobile: card-based fallback — each row becomes a stacked card with grid layout
- Table headers: uppercase, muted, xs font, wider tracking
- Row borders: `border-subtle`; header border: `border-default`

### Score Rings

SVG circular progress indicators for analysis scores. Color-coded by value: emerald (7+), amber (4-6), danger (<4). Glow effect on high scores. Hover: scale(1.1).

### Status Colors

Uses the Tier 1 + Tier 2 color system. A user scanning the screen should be able to read status with a traffic-light mental model:
- **Green** (emerald): good — success, positive, high scores
- **Amber**: caution — medium confidence
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
Sticky top nav with translucent glass: warm off-white at 92% opacity, `backdrop-blur(16px)`, subtle bottom border. Logo left, nav links right. Active link: coral text color.

### Mobile (< sm)
Fixed bottom tab bar with the same glassmorphism treatment, top border instead of bottom. Icon + label for each pipeline stage. Active tab: coral color. Desktop nav links hidden.

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

No noise texture overlay. The warm off-white background and white card contrast provide sufficient visual interest without synthetic texture.

## Anti-Patterns

Never:
- Cool foundation colors (zinc, slate, blue-gray) as base neutrals — this is a warm/stone palette
- Tier 3 colors carrying meaning — stage identity colors are decorative only
- New accent colors without clear Tier 2 semantic purpose
- Decorative gradients (the coral button gradient is the only one)
- `--text-muted` for body text or critical content (contrast too low)
- `--accent-coral` as text on pure white backgrounds (use on --bg-secondary or darker)
- Border radius > 24px on anything except pills/badges
- Heavy asymmetric padding
- Spring/bouncy animations
- Heavy drop shadows — this is a light, gentle depth strategy

## Questions to Ask

When designing new components:
1. Can I read this at a glance, or do I have to study it?
2. Does this use color for meaning (status, action, performance) or decoration?
3. Does this have a mobile-responsive fallback? (Tables → card stacks)
4. Am I using `var(--token)` or hardcoding colors?
5. Is the hover/interaction pattern consistent with `.card` or `.card-static`?
6. Does numeric data use `tabular-nums`?
