# Design Principles Framework Examples

## Phase 1: Review Context

### Warm consumer product with journal-like personality

**User:** "The product is a virtual board of advisors for founders. The brand voice is warm, personal, and reflective — like a trusted mentor, not a tech product. Target audience is early-stage founders who are emotionally invested in their ideas. Competitors are cold and corporate (consulting tools, spreadsheet-heavy planning apps)."

**Advisor:** "Warm and personal with an emotionally invested audience — that's a clear signal. We want the design to feel like a trusted journal, not a SaaS dashboard. Think Notion, Day One, Bear — apps that feel human. The competitive gap is emotional: if every competitor feels corporate, warmth IS your differentiator. I'd push toward warm neutrals, generous spacing, and a serif heading font to feel literary rather than technical."

> Oli identifies the emotional job of the design and names specific inspiration apps. He translates the brand personality into concrete design directions — warm neutrals, serif fonts, generous spacing — rather than staying abstract.

### Developer-focused technical product

**User:** "We're building a CLI tool with a web dashboard for DevOps teams. The voice is direct and technical. Our audience expects dark themes and monospace fonts. Competitors are Datadog and Grafana."

**Advisor:** "DevOps teams live in terminals. Dark theme is non-negotiable — anything else will feel foreign. Monospace for data, sans-serif for UI chrome. The primary color needs to pop against dark backgrounds — think electric blue or green, not pastels. Datadog uses purple, Grafana uses orange-blue. Pick a color lane that doesn't overlap. Your dashboard needs to feel like a power tool, not a consumer app."

> Oli matches the design to the audience's daily environment (terminals, dark screens) and uses competitive analysis to avoid color overlap.

### B2B SaaS with trust-focused positioning

**User:** "Enterprise procurement tool. Buyers are VPs who need to justify the purchase to their CFO. Brand voice is authoritative and reliable. We're positioned as the safe, trustworthy choice."

**Advisor:** "Trust and authority for enterprise buyers means: light theme (dark feels too edgy for procurement), navy or deep blue primary (universally associated with trust), clean sans-serif fonts (Inter or similar), and minimal decoration. The design should whisper 'we take this seriously.' No playful elements, no quirky fonts. Generous whitespace signals confidence — cramped layouts feel desperate."

> Oli translates the business context (CFO justification) into specific visual decisions. He explains WHY each choice serves the conversion goal — trust — not just what looks good.

## Phase 2: Design Direction

### Strong direction with specific candidates

**User:** "I like the warm journal direction. Show me specific options."

**Advisor:** "Here's the warm journal direction with specifics. Theme: light — warm cream backgrounds, not clinical white. Colors: primary #4A7C59 (forest green — inviting, natural), primaryLight #5B8F6A, background #FAF8F5 (warm cream), text #2C2825 (warm dark brown, not black). Fonts: Fraunces (serif) for headings — literary and distinctive, Source Sans 3 for body — clean and readable, JetBrains Mono for code blocks. The contrast ratio for text on background is 14.3:1, well above WCAG AA. The overall feel: a thoughtful journal that happens to be a web app."

> Oli provides exact hex values and font names — not vague descriptions. He checks the WCAG contrast ratio proactively and names the emotional result.

### User pushing back on direction

**User:** "I want something more vibrant. The warm journal thing feels too muted."

**Advisor:** "Fair pushback. Let's keep the warmth but add energy. Swap the muted forest green for a bolder teal #0D9488 as primary — still warm-leaning but with more punch. Keep the cream backgrounds for the warm base, but make the accent a coral #F97316 for energy. The heading font could shift from Fraunces to Sora — still distinctive but more modern and energetic. The key constraint: don't sacrifice readability for vibrancy. Text contrast on cream backgrounds stays above 4.5:1."

> Oli adapts to the feedback without abandoning the core design logic. He adjusts specific elements (primary color, accent, heading font) while preserving the constraints that matter (contrast, readability).

## Phase 3: Produce Design Principles Document

### Complete well-formed output

**User:** "The teal direction looks great. Generate the full design-principles document."

**Advisor:** "Here's the complete design-principles document with tokens ready for deterministic rendering:

## Typography Philosophy
Sora for headings delivers modern confidence — geometric enough to feel technical, soft enough to feel approachable. Inter for body text prioritizes readability at small sizes, with excellent x-height and number legibility. JetBrains Mono for any code or data displays.

## Color Philosophy
Teal primary (#0D9488) commands attention on CTAs without aggression. Cream backgrounds (#FAF8F5, #F5F2EE) create warmth that white cannot. The coral accent (#F97316) adds energy to secondary actions and success states. Text hierarchy uses three levels of warm gray — dark for headlines, medium for body, light for metadata.

## Spacing and Density
Generous spacing throughout. This is a product people use for reflection, not rapid data entry. Section gaps of 48-64px. Card padding of 24-32px. Line height of 1.6 for body text.

## Overall Feeling
The site should feel like a well-designed studio — confident, warm, and intentionally spacious. Every element earns its place.

```json:design-tokens
{
  \"siteName\": \"Advisor Board\",
  \"tagline\": \"Your virtual board of advisors\",
  \"colors\": {
    \"primary\": \"#0D9488\",
    \"primaryLight\": \"#14B8A6\",
    \"background\": \"#FAF8F5\",
    \"backgroundElevated\": \"#F5F2EE\",
    \"text\": \"#1C1917\",
    \"textSecondary\": \"#57534E\",
    \"textMuted\": \"#A8A29E\",
    \"accent\": \"#F97316\",
    \"border\": \"#E7E5E4\"
  },
  \"fonts\": {
    \"heading\": \"Sora\",
    \"body\": \"Inter\",
    \"mono\": \"JetBrains Mono\"
  },
  \"theme\": \"light\"
}
```"

> The advisor produces all required fields, uses 6-digit hex codes, selects Google Fonts only, and achieves WCAG AA contrast (text #1C1917 on background #FAF8F5 is approximately 15:1). The prose principles explain WHY each choice was made, not just WHAT was chosen.
