# KB-093: brand-identity-spec.md is stale

- **Type:** doc-staleness
- **Discovered during:** doc-staleness-detector
- **Location:** `docs/design/brand-identity-spec.md`
- **Observed:**
  1. **Color system describes dark-mode-first design that no longer exists:** The doc specifies `--bg-primary: #0d0d0f` (dark), `--bg-card: #1c1c21`, `--bg-elevated: #232329` with a `prefers-color-scheme: light` media query for light mode. The actual app uses a warm off-white design with `--bg-primary: #FAF9F7`, `--bg-card: #FFFFFF`, `--bg-elevated: #FFFFFF` and no dark mode at all.
  2. **Design philosophy section (line 77) says "Dark-first with automatic light mode"** but the actual design philosophy is "Warm white with stone-tinted neutrals, no dark mode" as described in `docs/design/design-principles.md`.
  3. **Nav glassmorphism (line 409) uses dark colors:** `background: rgba(13, 13, 15, 0.85)` — actual nav uses warm off-white at 92% opacity.
  4. **Texture section (line 471) describes noise overlay:** `body::before` with `feTurbulence` noise at 2% opacity. The actual app has no noise texture (confirmed in design-principles.md: "No noise texture overlay").
  5. **Anti-patterns section (line 490) says "Never use warm foundation colors"** but the actual design IS warm foundation colors (stone neutrals, warm grays).
  6. **Shadow values are dark-mode shadows:** `--shadow-card: 0 4px 24px rgba(0, 0, 0, 0.4)` vs actual `0 1px 3px rgba(28, 25, 23, 0.06)`.
  7. **Claude Code Recreation Prompt (line 514)** tells AI to create dark mode default which would produce the wrong design.
  8. **`--color-danger` value mismatch:** Doc says `#f87171` (lighter red for dark bg), actual is `#ef4444` (standard red for light bg).
  9. **`--accent-coral-soft` value mismatch:** Doc says `rgba(255, 107, 91, 0.15)`, actual is `rgba(255, 107, 91, 0.12)`.
- **Expected:** The entire color system, design philosophy, nav glassmorphism, texture, anti-patterns, shadows, and Claude Code recreation prompt sections need to be rewritten to match the current warm off-white light-only design. The doc should align with `docs/design/design-principles.md` and `src/app/globals.css`.
- **Source commits:** 64 commits since doc was last updated (Feb 17 10:08 to Feb 18 12:11), though the core design drift predates these commits — the dark-to-light redesign happened earlier and this doc was never updated.
- **Severity:** HIGH
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** CONFIRM
- **Evidence:**
  - `docs/design/brand-identity-spec.md` line 77: "Dark-first with automatic light mode via `prefers-color-scheme`" — contradicts actual design
  - `docs/design/brand-identity-spec.md` line 88: `--bg-primary: #0d0d0f` — actual `src/app/globals.css` line 9: `--bg-primary: #FAF9F7`
  - `docs/design/brand-identity-spec.md` line 103: `--shadow-card: 0 4px 24px rgba(0, 0, 0, 0.4)` — actual `globals.css` line 39: `0 1px 3px rgba(28, 25, 23, 0.06), 0 1px 2px rgba(28, 25, 23, 0.04)`
  - `docs/design/brand-identity-spec.md` line 409: `background: rgba(13, 13, 15, 0.85)` — actual `globals.css` line 457: `background: rgba(250, 249, 247, 0.92)`
  - `docs/design/brand-identity-spec.md` lines 471-483: `body::before` noise texture — absent from `globals.css`; `docs/design/design-principles.md` line 227 explicitly states "No noise texture overlay"
  - `docs/design/brand-identity-spec.md` line 490: "Never use warm foundation colors" — actual `design-principles.md` line 232 prohibits the opposite: "Cool foundation colors (zinc, slate, blue-gray)"
  - `docs/design/brand-identity-spec.md` line 526 (recreation prompt): "Dark mode default: #0d0d0f page bg" — would cause AI to produce wrong design
  - `docs/design/brand-identity-spec.md` line 142: `--color-danger: #f87171` — actual `globals.css` line 25: `#ef4444`
  - `docs/design/brand-identity-spec.md` line 137: `--accent-coral-soft: rgba(255, 107, 91, 0.15)` — actual `globals.css` line 19: `rgba(255, 107, 91, 0.12)`
  - All nine KB claims verified accurate against source.
- **Root Cause:** The app underwent a dark-to-light redesign that updated `src/app/globals.css` and `docs/design/design-principles.md` but left `brand-identity-spec.md` untouched. The doc now describes the exact opposite design — a systematic risk because the doc is explicitly intended for AI-assisted reconstruction of the design system.
- **Risk Assessment:** Documentation-only change. No source code, API, or test files are affected. The recreation prompt is the highest-risk artifact in its current state — an AI running it would build a dark-mode-first app. Fixing it eliminates that risk with no downside.
- **Validated Fix:**
  1. Replace the "Design Philosophy" section (line 75-81) — remove dark-first framing, replace with warm white / light-only philosophy matching `design-principles.md` lines 7-17
  2. Replace the entire "Dark Mode (Default)" color block (lines 83-105) with the actual `:root` tokens from `globals.css` lines 7-51
  3. Remove the "Light Mode" `@media (prefers-color-scheme: light)` block (lines 108-129) — no dark mode means no conditional overrides
  4. Update `--accent-coral-soft` to `rgba(255, 107, 91, 0.12)` (was 0.15)
  5. Update `--color-danger` to `#ef4444` (was `#f87171`)
  6. Replace nav glassmorphism CSS block (line 409) with `rgba(250, 249, 247, 0.92)` and remove the `prefers-color-scheme: light` override
  7. Remove the Texture section entirely (lines 469-483) or replace with a single line: "No texture overlay."
  8. Rewrite the Anti-Patterns section (line 490) to match `design-principles.md` lines 230-241 — replace "warm foundation colors" prohibition with "cool foundation colors" prohibition
  9. Rewrite the Claude Code Recreation Prompt (lines 514-556) — replace dark-mode color values with actual warm/light values, remove noise texture, correct `--color-danger` and `--accent-coral-soft`
  10. No changes needed to: Logo/SVG, Typography, Spacing, Border Radius, Buttons, Badges, Inputs, Animations, Responsive Breakpoints — these sections are accurate
- **Files Affected:** `docs/design/brand-identity-spec.md` only
- **Estimated Scope:** Medium — targeted rewrites across ~6 sections of a 560-line doc; no line-by-line rewrite needed for the majority of the file
