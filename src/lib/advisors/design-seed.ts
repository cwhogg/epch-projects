export const designPrinciplesSeed = `# Design Principles

Virtual Board of Advisors follows a "Warm Journal" design aesthetic — personal, reflective, and inviting rather than corporate or clinical.

## Design Direction

**Personality:** Warmth & Approachability
- Generous spacing for focused reflection
- Soft shadows that feel gentle, not clinical
- Colors that invite rather than demand
- Typography that feels literary, not corporate

**Inspiration:** Notion, Day One, Bear — apps that feel human and thoughtful.

**Emotional Job:** This app helps people access difficult emotions and receive guidance. The interface should feel like a trusted journal, not a tech product.

## Color Foundation

Warm neutrals with forest green accent:

| Token | Hex | Usage |
|-------|-----|-------|
| \`cream-50\` | \`#FDFCFA\` | Card backgrounds, inputs |
| \`cream-100\` | \`#FAF8F5\` | Page backgrounds |
| \`cream-200\` | \`#F5F2EE\` | Hover states |
| \`cream-300\` | \`#EBE6E0\` | Borders, dividers |
| \`bark-900\` | \`#2C2825\` | Headlines, primary text |
| \`bark-700\` | \`#3D3833\` | Body text |
| \`bark-500\` | \`#6B6560\` | Secondary text |
| \`bark-400\` | \`#8A847E\` | Placeholder text |
| \`forest-500\` | \`#4A7C59\` | Primary accent, buttons |
| \`forest-600\` | \`#3D6B4A\` | Hover states |
| \`error\` | \`#A65D5D\` | Error states, recording |
| \`success\` | \`#5B8A5B\` | Success states |

## Typography

- **Display:** Fraunces (serif) — page titles, section headers
- **Body:** Source Sans 3 (sans-serif) — body text, UI elements

## Spacing

4px base grid:
- \`4px\` — micro (icon gaps)
- \`8px\` — tight (within components)
- \`12px\` — standard (between related elements)
- \`16px\` — comfortable (section padding)
- \`24px\` — generous (between sections)

## Border Radius

Soft system matching the warm aesthetic:
- \`rounded-lg\` (8px) — buttons, inputs, small cards
- \`rounded-xl\` (12px) — larger cards, containers
- \`rounded-2xl\` (16px) — chat bubbles, conversational elements
- \`rounded-full\` — circular buttons, avatars

## Depth

Subtle single shadows with warm tint:
\`\`\`css
shadow-sm: 0 1px 2px rgba(44, 40, 37, 0.04)
shadow-md: 0 2px 8px rgba(44, 40, 37, 0.06)
shadow-lg: 0 4px 16px rgba(44, 40, 37, 0.08)
\`\`\`

Use surface color shifts (cream-50 on cream-100) plus subtle shadows.

## Component Patterns

**Primary button:** \`bg-forest-500 hover:bg-forest-600 text-white rounded-lg\`

**Secondary button:** \`bg-cream-50 hover:bg-cream-200 text-bark-700 border border-cream-300 rounded-lg\`

**Card:** \`bg-cream-50 border border-cream-300 rounded-xl shadow-sm\`

**Input:** \`bg-cream-50 border border-cream-300 rounded-lg focus:border-forest-400\`

**Chat bubble (user):** \`bg-forest-500 text-white rounded-2xl rounded-br-md\`

**Chat bubble (assistant):** \`bg-cream-50 border border-cream-300 rounded-2xl rounded-bl-md\`

## Anti-Patterns

Avoid:
- Cool grays or blues (use warm bark tones)
- Heavy shadows or dramatic elevation
- Sharp corners on conversational elements
- Decorative gradients or color for decoration
- Multiple accent colors

## Questions to Ask

When designing new components:
1. Does this feel warm and inviting, or cold and technical?
2. Would this look at home in a personal journal?
3. Am I using color for meaning, or for decoration?
4. Is the spacing generous enough for reflection?
`;
