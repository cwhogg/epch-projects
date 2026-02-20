# Website Builder Rebuild Design

**Date:** 2026-02-19
**Status:** Final (Round 2 critique clean — no high/medium issues remain)
**Scope:** Rebuild the Painted Door website builder backend architecture from the ground up

## Problem Statement

The current website builder has been through 10+ debugging sessions with incremental fixes that keep missing the real problems. The process/UX is sound — the backend architecture is structurally broken:

1. **Templates hardcode a fixed layout.** `painted-door-templates.ts` always produces hero → 3-col cards → FAQ → footer. The Landing Page Assembly framework produces copy for 8 sections (hero, problem, features, how-it-works, audience, objections, final-cta, faq), but the template ignores 5 of them.
2. **Copy pipeline is disconnected.** Stages 2-3 produce advisor-reviewed copy in chat messages, but `assembleAllFiles()` generates its own copy from `BrandIdentity.landingPage` — a separate LLM call that ignores what was approved.
3. **Two divergent generation paths.** The autonomous agent (`painted-door-agent.ts`) and the chat builder share tools but have different prompt assembly, leading to inconsistent behavior.
4. **Monolithic assembly.** `assembleAllFiles()` is a single string interpolation function that can't adapt to different page structures or design directions.
5. **Brand identity generation disconnected from Foundation docs.** The `design_brand` tool runs a separate LLM call with baked-in assumptions (dark themes, specific layouts) that override Foundation input.

## Success Criteria

1. **Copy fidelity:** Advisor-approved copy appears verbatim in the deployed page. No LLM reinterpretation at build time. Verifiable by comparing PageSpec JSON against rendered HTML.
2. **Full framework rendering:** All 8 sections from the Landing Page Assembly framework (hero, problem, features, how-it-works, audience, objections, final-cta, faq) appear on the deployed page in framework order.
3. **Foundation-driven visual identity:** Colors, fonts, and theme on the deployed page match the `json:design-tokens` block in the design-principles Foundation doc exactly.
4. **Single code path:** Both interactive and autonomous modes produce identical output for the same inputs. No behavioral divergence.

## Design Principles

1. **Creative decisions happen upstream.** All brand, visual identity, and copy decisions happen in Foundation docs and advisor stages. The website builder is a deterministic renderer.
2. **One path, two modes.** Both "Build with me" (interactive) and "You've got this" (autonomous) use the same chat pipeline. The only difference is whether checkpoints pause for user input.
3. **Copy flows through a typed accumulator.** Advisor-approved copy is locked into a structured `PageSpec` via tool calls. The assembler reads PageSpec at build time with zero LLM calls.

> **Note:** Other flows (ideation, blog creation, content creation) will follow the same general pattern: Foundation docs → advisor stages → typed accumulator → deterministic render. This design doesn't abstract for those flows but avoids cementing website-specific assumptions into the chat route's shared infrastructure (streaming, tool execution, advisor consultation).

## Architecture

### Core Data Flow

```
Foundation Docs (upstream)
    |
    +-- design-principles --> BrandIdentity (colors, fonts, theme, siteName, tagline)
    +-- brand-voice ---------> copy tone constraints
    +-- positioning ----------> messaging foundation
    +-- seo-strategy ---------> keyword targets
    |
    v
Stages 1-4: Advisor-driven copy pipeline (Landing Page Assembly framework)
    |
    +-- lock_section_copy() --> PageSpec (structured copy per section)
    +-- lock_page_meta() -----> PageSpec metadata (title, description)
    |
    v
Stage 5: Pure renderer
    |
    +-- assembleFromSpec(pageSpec, brand) --> 21 files, zero LLM calls
    |
    v
Stage 6: Deploy + verify
```

### Data Model

#### BrandIdentity (visual identity + site-wide branding)

Extracted deterministically from the design-principles Foundation doc's `json:design-tokens` block. No LLM call at build time.

```typescript
interface BrandIdentity {
  siteName: string;
  tagline: string;
  siteUrl: string;              // populated from site record at build time, not from Foundation doc
  colors: {
    primary: string;            // hex
    primaryLight: string;
    background: string;
    backgroundElevated: string;
    text: string;               // RENAMED from current `textPrimary`
    textSecondary: string;
    textMuted: string;
    accent: string;
    border: string;
  };
  fonts: {
    heading: string;            // Google Font name — RENAMED from current `typography.headingFont`
    body: string;               // RENAMED from current `typography.bodyFont`
    mono: string;               // RENAMED from current `typography.monoFont`
  };
  theme: 'light' | 'dark';
}
```

**Field changes from current BrandIdentity:**

| Change | Old field | New field | Reason |
|--------|-----------|-----------|--------|
| Removed | `voice` | — | Lives in brand-voice Foundation doc |
| Removed | `landingPage` | — | Copy lives in PageSpec |
| Removed | `seoDescription` | — | Moves to `PageSpec.metaDescription` |
| Removed | `targetDemographic` | — | Lives in positioning Foundation doc |
| Renamed | `colors.textPrimary` | `colors.text` | Simpler, matches CSS custom property name |
| Renamed | `typography.headingFont` | `fonts.heading` | Flattened naming |
| Renamed | `typography.bodyFont` | `fonts.body` | Flattened naming |
| Renamed | `typography.monoFont` | `fonts.mono` | Flattened naming |
| Added | — | `siteUrl` | Needed by sitemap, JSON-LD, meta tags. Currently in `ContentContext.url`. |

**Migration for existing Redis data:** A `normalizeBrandIdentity()` function in `painted-door-db.ts` maps old field names to new on read. When `brand.colors.textPrimary` exists but `brand.colors.text` does not, map it. Same for `typography.*` → `fonts.*`. Applied in both `getPaintedDoorSite()` and `getAllPaintedDoorSites()` — any function that deserializes a `PaintedDoorSite` from Redis normalizes the brand. `PaintedDoorProgress.result` may contain old-format brand data, but progress records have a 1-hour TTL and will expire naturally — no action needed.

#### PageSpec (copy accumulator)

Built incrementally during stages 2-3 via `lock_section_copy` tool calls. Lives inside `BuildSession` (same Redis key, same TTL, same lifecycle).

```typescript
// Discriminated union — compile-time safety for section renderers
type PageSection =
  | { type: 'hero'; copy: HeroCopy }
  | { type: 'problem'; copy: ProblemCopy }
  | { type: 'features'; copy: FeaturesCopy }
  | { type: 'how-it-works'; copy: HowItWorksCopy }
  | { type: 'audience'; copy: AudienceCopy }
  | { type: 'objections'; copy: ObjectionsCopy }
  | { type: 'final-cta'; copy: FinalCtaCopy }
  | { type: 'faq'; copy: FaqCopy }

interface PageSpec {
  sections: PageSection[];      // ordered — render order matches lock order
  metaTitle: string;
  metaDescription: string;      // also serves as seoDescription for layout.tsx
  ogDescription: string;
}
```

**Section types map 1:1 to Landing Page Assembly framework stages:**
- Stage 2 → `hero`
- Stage 3a → `problem`
- Stage 3b → `features`
- Stage 3c → `how-it-works`
- Stage 3d → `audience`
- Stage 3e → `objections` + `final-cta`
- FAQ is populated from SEO data (People Also Ask) during Stage 3e or Stage 4

**All 8 sections are mandatory.** `assembleFromSpec` validates all types are present before rendering. If any are missing, it returns an error describing which sections still need to be locked.

#### Per-Section Copy Types

```typescript
interface HeroCopy {
  headline: string;             // 3-8 words
  subheadline: string;          // max 30 words
  ctaText: string;              // 2-5 words
}

interface ProblemCopy {
  headline: string;
  body: string;                 // 2-3 sentences
}

interface FeaturesCopy {
  sectionHeadline: string;
  features: { title: string; description: string }[];  // 3-6 items
}

interface HowItWorksCopy {
  sectionHeadline: string;
  steps: { label: string; description: string }[];     // 3-5 steps
}

interface AudienceCopy {
  sectionHeadline: string;
  body: string;
}

interface ObjectionsCopy {
  sectionHeadline: string;
  objections: { question: string; answer: string }[];
}

interface FinalCtaCopy {
  headline: string;
  body: string;
  ctaText: string;
}

interface FaqCopy {
  sectionHeadline: string;
  faqs: { question: string; answer: string }[];
}
```

### Pipeline Flow

One path. Both modes use the same pipeline. Interactive pauses at checkpoints, autonomous auto-continues.

**Prerequisite:** Foundation docs must exist. At pipeline start, validate:
1. Design-principles doc exists
2. `json:design-tokens` block is present and parseable (valid JSON, all required fields, valid hex values)
3. WCAG AA contrast ratio check passes (text on background >= 4.5:1)

If any validation fails, the system tells the user which Foundation doc needs regeneration and does not proceed. This catches problems before the user invests time in stages 1-4.

**Stage 1: Extract & Validate Ingredients**
- Load Foundation docs, SEO data, keyword analysis
- Advisors consulted: April Dunford (positioning), Copywriter (voice)
- Output: validated ingredients summary (`session.artifacts.ingredients`)
- No PageSpec mutation

**Stage 2: Write Hero**
- Advisors consulted: Shirin Oreizy (behavioral), Copywriter (voice)
- Draft → advisor critique → approve (or auto-approve in autonomous)
- `lock_section_copy({ type: 'hero', copy: { headline, subheadline, ctaText } })`
- Tool validates word count constraints before accepting (see Error Handling below)

**Stage 3a: Problem Awareness**
- Advisors: Shirin Oreizy, Copywriter; optional: Joanna Wiebe
- `lock_section_copy({ type: 'problem', copy: { headline, body } })`

**Stage 3b: Features**
- Advisors: Copywriter, Oli Gardner
- `lock_section_copy({ type: 'features', copy: { sectionHeadline, features: [...] } })`

**Stage 3c: How It Works**
- Advisors: Copywriter
- `lock_section_copy({ type: 'how-it-works', copy: { sectionHeadline, steps: [...] } })`

**Stage 3d: Target Audience**
- Advisors: Shirin Oreizy, April Dunford
- `lock_section_copy({ type: 'audience', copy: { sectionHeadline, body } })`

**Stage 3e: Objection Handling + Final CTA**
- Advisors: Shirin Oreizy, Joanna Wiebe; optional: Copywriter
- Two lock calls: `objections` then `final-cta`

**Stage 4: Final Review**
- LLM reads full PageSpec, checks cross-section coherence
- Can propose edits to at most 2 sections, each must cite a specific coherence reason
- Overwrites require the LLM to pass `overwrite: true` in the `lock_section_copy` call (rejected without this flag in stages 2-3)
- Locks page metadata via `lock_page_meta({ metaTitle, metaDescription, ogDescription })`
- Max 200 words of review commentary

**Stage 5: Build & Deploy**
- Extract `BrandIdentity` from design-principles Foundation doc (parse `json:design-tokens` fenced block)
- Populate `brand.siteUrl` from the existing site record (`PaintedDoorSite.siteUrl`) or derive from `brand.siteName` as fallback
- Validate all 8 section types are present in PageSpec
- `assembleFromSpec(pageSpec, brand)` — pure function, zero LLM calls
- Create/reuse GitHub repo → push files → create/reuse Vercel project → poll for deployment
- Client switches to polling mode

**Stage 6: Verify**
- HEAD request to live URL
- `finalize_site` saves `PaintedDoorSite` with status `'live'`

### Error Handling

#### `lock_section_copy` validation failures

When the tool rejects input (missing required fields, word count violations, invalid array lengths):

1. Tool returns an error response with specific failure reasons (e.g., "headline is 12 words, max is 8")
2. The system prompt instructs the LLM to revise and retry
3. Max 3 retries per lock attempt
4. After 3 failures: in interactive mode, surface the error to the user with the last attempted copy and ask for direction. In autonomous mode, accept the copy with a warning logged to the build session.

#### `json:design-tokens` extraction failures

Validated at pipeline start (prerequisite check), not at Stage 5. If the design-principles doc exists but the tokens block is malformed:

1. Parse error details are returned (missing fields, invalid hex, etc.)
2. The system prompts the user to regenerate the design-principles Foundation doc
3. PageSpec from any previous partial session is preserved in the BuildSession — the user doesn't lose work
4. After regeneration, the pipeline resumes from Stage 5 (or from wherever it was)

#### Session step advancement

`lock_section_copy` is NOT in the `TOOL_COMPLETES_STEP` map (it's called across multiple stages). Instead, step advancement is driven by the framework's stage transitions:
- Stage 2 completes when `lock_section_copy({ type: 'hero' })` succeeds
- Stage 3 substages complete when their respective section type is locked
- The chat route checks `session.pageSpec.sections` after each `lock_section_copy` to determine which substage just completed, then advances `currentStep`/`currentSubstep` accordingly

### Section Component Library

Each section type has a render function. All share a uniform signature via `RenderContext`:

```typescript
interface RenderContext {
  brand: BrandIdentity;
  formStateVarNames: { email: string; status: string; handleSubmit: string };
}

type SectionRenderer<T> = (copy: T, ctx: RenderContext) => string;
```

`formStateVarNames` solves the shared email form problem: hero and final-CTA both reference the same `useState` variables declared once in `wrapInPage`. Section renderers reference the variable names; they don't declare state.

**Render functions (1:1 with Landing Page Assembly framework stages):**

| Function | Exists today? | Layout |
|----------|---------------|--------|
| `renderHeroSection` | Extract from current `renderLandingPage` | Centered headline + subheadline + email form |
| `renderProblemSection` | New | Full-width headline + body text |
| `renderFeaturesSection` | Adapt from current value props | Headline + responsive grid (adapts cols to array length) |
| `renderHowItWorksSection` | New | Headline + numbered steps (vertical flow) |
| `renderAudienceSection` | New | Headline + body text (separate from problem — independently evolvable) |
| `renderObjectionSection` | New | Headline + Q&A pairs (accordion, similar to FAQ but separate renderer) |
| `renderFinalCtaSection` | New | Headline + body + email form (references shared form state) |
| `renderFaqSection` | Extract from current | Headline + accordion Q&A |

**The assembler:**

```typescript
function renderLandingPage(pageSpec: PageSpec, brand: BrandIdentity): string {
  const ctx: RenderContext = {
    brand,
    formStateVarNames: { email: 'email', status: 'status', handleSubmit: 'handleSubmit' },
  };

  const renderers: Record<PageSection['type'], SectionRenderer<any>> = {
    'hero': renderHeroSection,
    'problem': renderProblemSection,
    'features': renderFeaturesSection,
    'how-it-works': renderHowItWorksSection,
    'audience': renderAudienceSection,
    'objections': renderObjectionSection,
    'final-cta': renderFinalCtaSection,
    'faq': renderFaqSection,
  };

  const sectionHtml = pageSpec.sections
    .map(section => renderers[section.type](section.copy, ctx))
    .join('\n');

  return wrapInPage(sectionHtml, pageSpec, ctx);
}
```

**`wrapInPage` responsibilities:**
- `'use client'` directive
- React imports (`useState`, `FormEvent`)
- Component imports (`JsonLd`)
- Email form state declarations (`useState` for email, status; `handleSubmit` function)
- Nav fragment (reads `brand.siteName`)
- JSON-LD blocks: Organization + WebSite (from `brand`), FAQPage (scans PageSpec for faq-type section)
- Footer fragment (reads `brand.siteName`, `brand.tagline`)
- `<main>` wrapper around section HTML

**`assembleFromSpec` overall structure:**
```typescript
function assembleFromSpec(pageSpec: PageSpec, brand: BrandIdentity): Record<string, string> {
  return {
    // Landing page — from PageSpec + BrandIdentity
    'app/page.tsx': renderLandingPage(pageSpec, brand),

    // Scaffold — from BrandIdentity only (unchanged from current)
    'package.json': PACKAGE_JSON,               // static constant
    'tsconfig.json': TSCONFIG_JSON,             // static constant
    'next.config.ts': NEXT_CONFIG_TS,           // static constant
    // ... all other scaffold files ...
    'app/globals.css': renderGlobalsCss(brand),
    'app/layout.tsx': renderLayout(brand, pageSpec),  // signature changes: needs metaDescription from PageSpec
    'app/robots.ts': ROBOTS_TS,                 // static constant
    'app/sitemap.ts': renderSitemap(brand),     // uses brand.siteUrl (was ContentContext.url)

    // Content pages — from BrandIdentity only
    'app/blog/page.tsx': renderBlogListing(brand),
    'app/blog/[slug]/page.tsx': renderBlogDetail(brand),
    // ... etc ...

    // Static
    'app/api/signup/route.ts': SIGNUP_ROUTE_TS,
    'public/google8016c4ca2d4b4091.html': googleVerificationHtml,  // inline string, not a named constant currently
  };
}
```

### Foundation Doc Changes

#### Design-Principles: Advisor and Framework

Currently: generated by Richard Rumelt (strategist) using a hardcoded generation prompt + design seed. No framework.

Changes to:
- **Advisor:** Oli Gardner — conversion-focused visual design expertise. His advisor prompt (`oli-gardner.md`) gains expertise in visual identity for conversion (how colors, typography, and layout serve landing page goals). No output format instructions in the advisor prompt.
- **Framework:** New `design-principles` framework at `frameworks/prompts/design-principles/` following the standard va-web-app pattern:

```
frameworks/prompts/design-principles/
  prompt.md           ← phases, output format (including json:design-tokens block), WCAG/Google Fonts requirements
  examples.md         ← example design-principles documents (adapted from current design-seed.ts)
  anti-examples.md    ← failure modes (missing tokens block, non-hex colors, bad contrast, non-Google fonts)
```

The `prompt.md` specifies the session flow:
- Phase 1: Review positioning, brand-voice, and strategy Foundation docs
- Phase 2: Establish design direction (light/dark, color mood, typography feel)
- Phase 3: Produce the design-principles document with prose principles + `json:design-tokens` block
- Output format includes the exact `json:design-tokens` schema with all 9 color slots, 3 font names, and theme

The framework registry entry:
```typescript
{
  id: 'design-principles',
  displayName: 'Design Principles',
  advisors: ['oli-gardner'],
  contextDocs: ['positioning', 'brand-voice', 'strategy'],
  description: 'Generate visual design principles with implementation-ready tokens',
}
```

The existing `design-seed.ts` content moves into `examples.md` as an example of a well-formed design-principles doc with proper `json:design-tokens` block.

#### Token Extraction

New file `foundation-tokens.ts`:
- Find `` ```json:design-tokens `` fenced block in design-principles doc
- Parse JSON
- Validate: all 9 color fields are valid hex, all 3 fonts are strings, theme is 'light' or 'dark'
- Validate: WCAG AA contrast ratios (text on background >= 4.5:1) using existing `hexToLuminance`/`contrastRatio` functions (extracted from `website.ts` to a shared utility)
- Return `BrandIdentity` (with `siteUrl` populated from build context, not from the doc)
- If block is missing, malformed, or fails contrast checks: return error with specific details

#### Foundation Agent Update

`foundation.ts` changes:
- `DOC_ADVISOR_MAP['design-principles']` changes from `'richard-rumelt'` to `'oli-gardner'`
- The `case 'design-principles'` block in `buildGenerationPrompt()` is replaced with the output of `getFrameworkPrompt('design-principles')`, which includes the full session flow, output format, and examples. The `designSeed` parameter is removed from the function signature.
- The design seed content moves into the framework's `examples.md`

### Tool Changes

#### Deleted Tools
- `design_brand` — replaced by deterministic extraction from Foundation docs

#### New Tools
- `lock_section_copy({ type, copy, overwrite? })` — validates required fields per section type, saves to `session.pageSpec.sections[]`. Overwrite behavior:
  - `overwrite: false` (default): if section type already exists, returns error "section already locked"
  - `overwrite: true`: replaces existing section (only allowed during Stage 4, rejected in other stages)
  - Returns confirmation with the locked copy echoed back
  - On validation failure: returns error with specific reasons (see Error Handling)
- `lock_page_meta({ metaTitle, metaDescription, ogDescription })` — validates field lengths, saves to `session.pageSpec` top-level fields. Called during Stage 4.

#### Modified Tools
- `assemble_site_files` — reads from `session.pageSpec` + extracted `BrandIdentity`. No longer takes `approvedCopy` parameter. Validates all 8 section types present.
- `evaluate_brand` — rewritten to validate PageSpec fields instead of `BrandIdentity.landingPage` fields. Checks: keyword presence in hero headline, meta description length/keyword density, feature/FAQ count ranges.

### What Gets Deleted

| File | Reason |
|------|--------|
| `src/lib/painted-door-agent.ts` | Autonomous agent path killed |
| `src/lib/painted-door-prompts.ts` | Brand identity LLM prompt — no longer needed |
| `src/lib/__tests__/painted-door-agent.test.ts` | Tests deleted code |
| `src/lib/__tests__/painted-door-prompts.test.ts` | Tests deleted code |
| `src/lib/agent-tools/__tests__/website-design-brand.test.ts` | Tests deleted tool |
| `ApprovedCopy` interface in `painted-door-templates.ts` | Replaced by PageSpec |
| POST handler in `api/painted-door/[id]/route.ts` | Was autonomous agent trigger |

**Note on `PaintedDoorProgress`:** Retained for now. The status page (`website/[id]/page.tsx`) uses it for display. The GET handler in `route.ts` returns it. Removing it requires a replacement for the status page's progress display, which is out of scope for this rebuild. The autonomous agent no longer writes to it, but the type and Redis functions stay until the status page is redesigned.

### What Gets Created

| File | Purpose |
|------|---------|
| `src/lib/painted-door-sections.ts` | 8 section render functions, `RenderContext` type, `wrapInPage` |
| `src/lib/painted-door-page-spec.ts` | `PageSpec`, `PageSection` union, per-section copy types, validation logic for `lock_section_copy` |
| `src/lib/foundation-tokens.ts` | Parse `json:design-tokens` block → `BrandIdentity`, WCAG contrast validation |
| `src/lib/contrast-utils.ts` | `hexToLuminance`, `contrastRatio` extracted from `website.ts` for reuse |
| `src/lib/frameworks/prompts/design-principles/prompt.md` | Design-principles framework: phases, output format, token schema |
| `src/lib/frameworks/prompts/design-principles/examples.md` | Example design-principles docs (from current `design-seed.ts`) |
| `src/lib/frameworks/prompts/design-principles/anti-examples.md` | Failure modes: missing tokens, bad contrast, non-Google fonts |
| Tests for each new source file | |

### What Gets Modified

| File | Change |
|------|--------|
| `src/types/index.ts` | `BrandIdentity` slimmed + renamed fields + `siteUrl` added. `BuildSession.artifacts` gets `pageSpec: PageSpec`. Delete `ApprovedCopy`. |
| `src/lib/painted-door-templates.ts` | `assembleAllFiles()` replaced by `assembleFromSpec()`. Monolithic `renderLandingPage` replaced by call to section library. `renderLayout` signature changes to `(brand, pageSpec)`. `renderSitemap` uses `brand.siteUrl` instead of `ctx.url`. Scaffold functions updated for renamed `BrandIdentity` fields (`colors.textPrimary` → `colors.text`, `typography.headingFont` → `fonts.heading`, etc.). |
| `src/lib/painted-door-db.ts` | Add `normalizeBrandIdentity()` function for old→new field mapping on read. Applied in `getPaintedDoorSite()`. |
| `src/lib/agent-tools/website.ts` | Delete `design_brand` tool. Add `lock_section_copy`, `lock_page_meta`. Update `assemble_site_files`, `evaluate_brand`. Extract `hexToLuminance`/`contrastRatio` to `contrast-utils.ts`. |
| `src/app/api/painted-door/[id]/chat/route.ts` | New tools in array. Step advancement driven by PageSpec section presence (not `TOOL_COMPLETES_STEP` for `lock_section_copy`). Simplified system prompt (no brand prompt). |
| `src/app/api/painted-door/[id]/route.ts` | Delete POST handler. GET/PATCH/PUT/DELETE stay. |
| `src/lib/agent-tools/foundation.ts` | `DOC_ADVISOR_MAP['design-principles']` → `'oli-gardner'`. Generation uses design-principles framework instead of hardcoded prompt. |
| `src/lib/advisors/design-seed.ts` | Content moves to `frameworks/prompts/design-principles/examples.md`. File may be deleted or kept as a re-export. |
| `src/lib/advisors/prompts/oli-gardner.md` | Add visual identity expertise to his advisor profile (conversion-focused color/typography reasoning). No output format — that's the framework's job. |
| `src/lib/frameworks/registry.ts` | Add `design-principles` framework entry. |
| `src/lib/frameworks/prompts/landing-page-assembly/prompt.md` | Reference `lock_section_copy` tool, describe accumulator pattern, specify that each stage locks its section. |
| `src/app/website/[id]/page.tsx` | Remove `triggerGeneration` callback and POST-based flow. Update to read from new `BrandIdentity` shape (via `normalizeBrandIdentity`). |
| `e2e/eval-config.ts` | Remove agent surface, add new LLM surfaces (lock_section_copy, design-principles framework). |

### Testing Strategy

#### `painted-door-page-spec.test.ts`
- Validation acceptance: each section type with minimal valid copy
- Validation rejection: missing required fields, empty arrays, word count violations (hero headline > 8 words)
- Overwrite behavior: rejected without `overwrite: true`, accepted with it
- All 8 types present check: succeeds when complete, fails with specific missing types

#### `painted-door-sections.test.ts`
- Each render function with valid copy + brand → produces valid JSX string containing the copy verbatim
- Edge cases: features array with 2 items (min), 6 items (max); FAQ with 1 item; steps with 3 items
- `wrapInPage`: includes `'use client'`, `useState` declarations, JSON-LD blocks, nav/footer
- `wrapInPage` with FAQ section: includes FAQPage JSON-LD; without FAQ: omits it

#### `foundation-tokens.test.ts`
- Valid `json:design-tokens` block → correct `BrandIdentity`
- Missing block → specific error
- Malformed JSON → parse error
- Missing color fields → lists which are missing
- Invalid hex values → identifies which fields
- WCAG contrast failure → reports which color pairs fail
- Non-string font values → error

#### `contrast-utils.test.ts`
- Known color pairs with known contrast ratios
- Edge cases: white on white (1:1), black on white (21:1)

#### Error path tests for mocked operations
- Redis save failures in `lock_section_copy` → error surfaced to LLM
- Foundation doc read failures in token extraction → error with details
- `normalizeBrandIdentity` with old-format data → correct mapping

### Migration Path

**Existing sites in Redis:** `PaintedDoorSite` records have the old `BrandIdentity` shape. `normalizeBrandIdentity()` in `painted-door-db.ts` maps old field names to new at read time. No bulk migration. Rebuilding an old site starts fresh with the new pipeline.

**Existing Foundation docs:** design-principles docs without `json:design-tokens` block. When the website builder validates at pipeline start and can't extract tokens, it prompts: "Your design principles need to be regenerated with visual identity tokens. Regenerate now?" Triggers design-principles generation only (using the new design-principles framework with Oli Gardner).

**`PaintedDoorProgress`:** Retained in types and Redis functions. The autonomous agent no longer writes to it, but the status page still reads it. Removal deferred to a separate status page redesign.

## Decision Log

| # | Decision | Alternatives considered | Rationale |
|---|----------|------------------------|-----------|
| 1 | Fixed page structure (Landing Page Assembly framework, 8 sections) | Section-level variation, page-level variation, keep current 3 sections | The 8 sections are the Landing Page Assembly framework stages — hero, problem, features, how-it-works, audience, objections, final-cta, faq. The framework already produces copy for all 8; the current template discards 5 of them. This rebuild makes the template render what the framework produces. |
| 2 | One generation path | Keep both autonomous agent + chat | Eliminates divergent behavior. Autonomous mode is just chat with auto-continue at checkpoints. |
| 3 | PageSpec accumulator | LLM generates full page JSX at build time | Deterministic rendering from structured data. Copy is exactly what advisors approved — no LLM reinterpretation at build time. |
| 4 | BrandIdentity from Foundation docs | Separate LLM call, Foundation-only (no LLM) | All creative decisions happen upstream. The design-principles framework produces a `json:design-tokens` block for deterministic extraction. LLM refines values during Foundation doc generation (WCAG compliance, Google Fonts validation), not at build time. |
| 5 | Oli Gardner owns design-principles (advisor), new design-principles framework handles output format | Richard Rumelt, new design advisor, expand advisor prompt with format | Oli understands how visual design serves conversion. His advisor prompt defines voice/expertise. The framework (prompt.md + examples.md + anti-examples.md) defines the session flow and output format — following the exact same advisor/framework split pattern used in va-web-app. Richard Rumelt is a business strategist with no visual design expertise. A dedicated visual design advisor isn't needed because the framework's examples and anti-examples constrain the output tightly enough; conversion-aware reasoning about color and typography is sufficient for landing page design tokens. |
| 6 | PageSpec inside BuildSession | Separate Redis key | Same lifecycle (TTL, delete, save). No sync issues. |
| 7 | Discriminated union for PageSection | `Record<string, string>` | Features and FAQs need arrays of objects. Flat string maps can't represent these. Discriminated union gives compile-time safety for section renderers. |
| 8 | Shared email form state in wrapInPage | Independent forms per section | Hero and final-CTA both have email signup. Shared state means one form, consistent UX. User submits in hero → final CTA reflects the submission. |
| 9 | Separate problem/audience renderers | Single `renderTextSection` with variant | Both are headline + body, but they're conceptually distinct Landing Page Assembly framework stages with different advisors (problem: Shirin + Copywriter; audience: Shirin + April Dunford). Separate renderers allow independent styling and future evolution. Trivial code duplication (15-20 lines each). |
