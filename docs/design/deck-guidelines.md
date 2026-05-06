# Deck Design Guidelines

Extends the EPCH design system (`design-principles.md`) for presentation and slide deck contexts. Use this reference when building any EPCH-branded deck — pitch, workshop, or internal.

---

## Slide Dimensions

- **Aspect ratio:** 16:9
- **Reference resolution:** 1280 × 720px (scales to any 16:9 display)
- **Safe area:** 80px inset from all edges — keep all content within this zone
- **Content max-width:** 1080px centered — prevents text from running edge-to-edge

---

## Typography Scale

Slides are viewed at a distance or as thumbnails — sizes run larger than the dashboard type scale.

| Element | Font | Weight | Size | Tracking | Color |
|---------|------|--------|------|----------|-------|
| Slide headline | Fraunces | 500 | 32–40px | -0.02em | `--text-primary` (#1C1917) |
| Subhead / description | DM Sans | 400 | 18–20px | normal | `--text-secondary` (#57534E) |
| Body / bullets | DM Sans | 400 | 16px | normal | `--text-secondary` (#57534E) |
| Bold emphasis in body | DM Sans | 600 | 16px | normal | `--text-primary` (#1C1917) |
| Step numbers / callout numbers | Fraunces | 600 | 24–28px | normal | `--accent-coral` (#ff6b5b) |
| Diagram node labels | DM Sans | 500 | 14–16px | normal | `--text-primary` (#1C1917) |
| Diagram group labels | DM Sans | 500 | 13px | 0.05em uppercase | `--text-muted` (#94918C) |
| Captions / source text | DM Sans | 400 | 12px | normal | `--text-muted` (#94918C) |
| Chart axis labels | DM Sans | 400 | 11–12px | normal | `--text-muted` (#94918C) |
| Chart title | DM Sans | 700 | 16px | normal | `--text-primary` (#1C1917) |

### Line Height

- Headlines: 1.2
- Body/bullets: 1.5
- Diagram labels: 1.3

---

## Color Usage on Slides

All colors from `design-principles.md` apply. Slide-specific guidance:

| Element | Treatment |
|---------|-----------|
| Slide background | `--bg-primary` (#FAF9F7) warm off-white |
| Content card / panel | `--bg-card` (#FFFFFF) with `--shadow-card` and `--radius-lg` |
| Content boxes / columns | `--bg-secondary` (#F3F2EF) or white with `--border-subtle`, `--radius-lg` |
| Headline text | `--text-primary` (#1C1917) |
| Body / bullet text | `--text-secondary` (#57534E) |
| Accent numbers & arrows | `--accent-coral` (#ff6b5b) |
| Muted / de-emphasized items | Dashed `--border-default` border, `--text-muted` text |
| Elevated / emphasized items | Solid `--accent-coral` left border or border, `--shadow-elevated` |
| Placeholder boxes | Dashed `--border-default` border, `--bg-secondary` fill, centered muted label |

### Comparison Pattern (Generic vs. Personalized)

- **Generic / "before":** Dashed border, flat, `--text-muted` label, no shadow
- **Personalized / "after":** Solid coral left border or coral border, `--shadow-elevated`, full-color text

---

## Slide Layout Templates

### Title Slide

- Center-aligned vertically and horizontally
- EPCH logo mark (coral circle) above or integrated with title
- Title: Fraunces 48–56px, weight 500
- Subtitle: DM Sans 20–24px, `--text-secondary`
- Generous whitespace — no other elements

### Text + Description

- Headline top-left
- 1–2 paragraphs of body text below
- Lower 40% of slide left empty — breathing room signals confidence

### Two-Column (Text + Visual)

- Left: headline + bullet list (50–55% width)
- Right: diagram, chart, or placeholder (45–50% width)
- Vertical center alignment between columns
- 32–48px gap between columns

### Three-Column

- Equal-width columns with 24px gap
- Each column: `--bg-secondary` card with `--radius-lg`, 24px padding
- Column header in DM Sans 500, body bullets below
- Optional: header bar at top spanning all columns (parent label)

### Numbered Steps

- Vertical stack of steps, each with a number circle + description
- Number circles: 48px diameter, `--bg-secondary` fill, `--border-default` border, Fraunces 600 number
- Coral accent on numbers or connecting lines
- Optional feedback arrow from last step back to first (iteration loop)

### Diagram / Architecture

- See "Diagram Styling" section below
- Center the diagram in the slide content area
- Allow 60–80px vertical padding above and below the diagram

### Timeline / Process

- Horizontal chevron arrows or connected phase cards
- Equal-width phase columns
- Phase header: colored bar or chevron shape
- Bullet list below each phase
- Arrow/chevron connectors between phases

### Comparison (Side-by-Side)

- Two equal cards side-by-side
- "Before" card: muted treatment (dashed border, flat)
- "After" card: elevated treatment (coral border, shadow)
- Caption below the pair

---

## Diagram Styling

### Nodes

- **Shape:** Rounded rectangles, `--radius-lg` (16px)
- **Fill:** `--bg-card` (white) or `--bg-secondary` (#F3F2EF)
- **Border:** 1px solid `--border-default`
- **Label:** DM Sans 500, 14–16px, `--text-primary`, centered
- **Padding:** 12–16px vertical, 20–24px horizontal
- **Min-width:** 140px for readability

### Connectors & Arrows

- **Line color:** `--accent-coral` (#ff6b5b) or `--text-muted` (#94918C) for secondary flows
- **Line width:** 2px
- **Arrow heads:** Filled triangles, 8–10px, matching line color
- **Style:** Straight lines preferred; use right-angle bends when routing around nodes

### Grouping Containers

- **Border:** 2px dashed `--border-default`
- **Radius:** `--radius-xl` (24px)
- **Label:** DM Sans 500 uppercase, `--text-muted`, positioned top-center outside or straddling the border
- **Internal padding:** 20–24px
- **Fill:** transparent or very faint `--bg-secondary` at 50% opacity

### Flow Direction

- Top-to-bottom for hierarchies and pipeline flows
- Left-to-right for timelines and sequences
- Consistent within a single diagram

---

## Placeholder / Mockup Treatment

For slides that reference future visuals (e.g., "Generic Deck", "Fake Dashboard"):

- Dashed border (2px dashed `--border-default`)
- `--bg-secondary` fill
- Centered label in DM Sans 400, `--text-muted`, 16–18px
- `--radius-lg` corners
- No shadow — these should feel intentionally unfinished

---

## Spacing Rules

### Slide Internal Spacing

| Zone | Value |
|------|-------|
| Top of slide to headline | 60–80px |
| Headline to subhead | 12–16px |
| Subhead to body content | 24–32px |
| Between bullet items | 12–16px |
| Between content sections | 32–48px |
| Content to bottom edge | 60–80px |

### Bullet Formatting

- Bullet character: `•` (filled circle) in `--accent-coral` or `--text-muted`
- Indent: 24px from left edge of content area
- Line spacing: 1.5 within items, 12–16px between items
- No nested bullets — keep flat for slide readability

---

## Chart Styling

When recreating data charts on slides:

- **Background:** transparent (inherits slide background)
- **Axis lines:** 1px `--border-default`
- **Axis labels:** DM Sans 400, 11–12px, `--text-muted`
- **Grid lines:** 1px `--border-subtle`, horizontal only
- **Data lines:** 2–3px stroke weight
  - Primary series: `--accent-coral` (#ff6b5b)
  - Secondary series: `--text-muted` (#94918C)
  - Tertiary series: `--border-default` with dashed stroke
- **Chart title:** DM Sans 700, 16px, `--text-primary`
- **Legend labels:** DM Sans 400, 12px, `--text-secondary`
- **Source text:** DM Sans 400, 11px, `--text-muted`, bottom of chart

---

## What to Avoid

- Cool-toned backgrounds (slate, zinc, blue-gray) — use warm stone palette only
- Dark slide backgrounds — light-only, `#FAF9F7` base
- Decorative gradients on slides (coral button gradient is the only permitted gradient in the system)
- Heavy drop shadows — keep elevation subtle
- Coral text on white backgrounds without sufficient size/weight (contrast ~3.3:1)
- More than 6 bullet points per slide — split into two slides if needed
- Font sizes below 14px for anything a viewer needs to read (captions/source text excepted)
- Centered body text — left-align bullets and paragraphs; center only titles and single-line callouts
- Clip art or stock icons — use typography and layout to communicate, not decoration

---

## References

- **Colors, fonts, tokens:** `docs/design/design-principles.md`
- **Logo mark, brand spec:** `docs/design/brand-identity-spec.md`
- **Anti-patterns:** Both documents above — all anti-patterns apply to slides too
