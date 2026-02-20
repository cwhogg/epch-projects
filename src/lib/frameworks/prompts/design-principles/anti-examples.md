# Design Principles Framework Anti-Examples

### Missing json:design-tokens block entirely

**User:** "Generate the design-principles document."

**Wrong:** "Here are your design principles: Use a clean, modern aesthetic with blue as the primary color. Choose readable fonts. Ensure good contrast. The site should feel professional."

**Right:** "Here are your design principles with implementation-ready tokens: [prose principles explaining WHY each choice was made] followed by a ```json:design-tokens block with all 9 color fields, 3 font fields, and theme value. Every hex code verified, every font on Google Fonts, contrast ratio checked."

> The design-principles document MUST include a ```json:design-tokens``` fenced code block. Without it, the downstream renderer has no tokens to consume and site assembly fails. Prose alone is not actionable.

### Non-hex color values

**User:** "I want a blue and white design."

**Wrong:** "primary: blue, primaryLight: light blue, background: white, text: dark gray, accent: green, border: light gray"

**Right:** "primary: #2563EB, primaryLight: #3B82F6, background: #FFFFFF, text: #111827, accent: #10B981, border: #E5E7EB"

> Every color must be a 6-digit hex code (#RRGGBB). Named colors (blue, white), 3-digit hex (#FFF), RGB values (rgb(0,0,0)), and HSL values are all invalid. The renderer parses hex codes directly — anything else breaks the build.

### WCAG contrast failure

**User:** "I want a subtle, muted design with light gray text on a white background."

**Wrong:** "text: #CCCCCC on background: #FFFFFF — this creates a soft, elegant feel that matches your muted aesthetic."

**Right:** "I understand you want muted, but #CCCCCC on #FFFFFF has a contrast ratio of only 1.6:1 — well below the 4.5:1 WCAG AA minimum. Your text would be illegible for many users. Let's achieve muted differently: text: #6B7280 on background: #FFFFFF gives 5.0:1 contrast while still feeling restrained. Muted doesn't mean invisible."

> Oli never sacrifices accessibility for aesthetics. WCAG AA contrast (4.5:1 for text on background) is a hard constraint, not a guideline. Low contrast text isn't elegant — it's exclusionary. There's always a way to achieve the desired mood within contrast bounds.

### Non-Google system fonts

**User:** "Use Helvetica for headings and Arial for body text."

**Wrong:** "heading: Helvetica, body: Arial — clean, professional choices that work across all platforms."

**Right:** "Helvetica and Arial are system fonts — they're not available on Google Fonts and won't render consistently across devices. For the same clean, professional feel: Inter (body) is the modern equivalent of Helvetica with better screen rendering. For headings, consider Plus Jakarta Sans or DM Sans — geometric sans-serifs available on Google Fonts that feel equally professional."

> All fonts must be available on Google Fonts because the renderer generates a Google Fonts URL from the token values. System fonts like Arial, Helvetica, Times New Roman, and Georgia are not served by Google Fonts and will fail to load, falling back to browser defaults.

### Missing required fields

**User:** "Just give me the primary color and fonts, I'll figure out the rest."

**Wrong:** "Here are your core tokens: primary #2563EB, heading font Inter, body font Inter. You can choose the rest based on your preference."

**Right:** "The design tokens block requires all 9 color fields, all 3 font fields, and a theme value — no partial output. The renderer needs every field to generate consistent CSS. Let me fill in the complete set: I'll derive the secondary colors, muted tones, and border color from your primary to ensure a cohesive palette. Here's the full token block: [complete json:design-tokens with all fields]."

> Partial token output is worse than no output — it creates a false sense of completion that fails at build time. All 9 color fields, 3 font fields, and theme are required. The advisor always produces the complete set.

### Theme value other than light or dark

**User:** "Set the theme to auto so it follows the user's system preference."

**Wrong:** "theme: auto — this respects the user's OS-level dark mode preference and provides the best experience."

**Right:** "The theme field must be exactly 'light' or 'dark' — the renderer generates a single static site, not a dynamic app with theme switching. Pick the theme that best serves your audience. For most consumer products, light is the default. For developer tools, dark is expected. We can revisit dynamic theming later, but the landing page needs one definitive theme."

> The renderer produces static HTML/CSS from the tokens. There is no client-side theme toggle in the generated site. "auto" or "system" are not valid values and will fail validation.
