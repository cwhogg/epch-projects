# Simplify Brand Tokens: Replace Regex Extraction with LLM-Driven `lock_brand` Tool

## Problem

The website builder requires design tokens (colors, fonts, theme) to render HTML/CSS. Currently these are regex-parsed from a strict `json:design-tokens` fenced code block inside the design-principles Foundation document. This is fragile and has caused repeated production failures:

1. The LLM generating the design-principles doc must produce exact JSON syntax with exact field names inside a specific Markdown fence label
2. The foundation agent needed a hack to strip WAIT instructions from the multi-phase framework prompt to force one-shot generation of the JSON block
3. The chat route hard-blocks the entire website build at `mode_select` time if token parsing fails
4. Old design-principles docs (generated before the rebuild) don't have the JSON block at all, breaking all existing sites
5. Even after fixing the generation, the LLM can stop before reaching Phase 3 (where tokens are produced) because the framework prompt has WAIT instructions between phases

**Root cause:** We're forcing a deterministic contract (strict JSON schema with regex parsing) in the middle of an LLM pipeline. This is fundamentally at odds with how LLMs work.

## Desired End State

- The design-principles Foundation doc is **just prose** — design philosophy, color descriptions with hex values, font choices, theme rationale. No required JSON format.
- During the website build, the LLM reads the prose and provides brand tokens via a **`lock_brand` tool call**, matching the existing pattern for `lock_section_copy` and `lock_page_meta`.
- `foundation-tokens.ts` (the regex parser) is deleted entirely.
- The prerequisite gate in the chat route is removed — the build no longer hard-fails before starting.
- WCAG contrast check becomes a warning on `lock_brand`, not a hard gate.

## Architecture Context

### Current token flow (what we're replacing)
1. Design-principles Foundation doc MUST contain `` ```json:design-tokens``` `` block
2. `foundation-tokens.ts` regex-parses it, validates 9 color fields, 3 font fields, theme, WCAG contrast
3. `chat/route.ts:162` calls extraction as prerequisite gate — blocks entire build
4. `website.ts:511` calls extraction again in `assemble_site_files` — blocks file generation
5. `website.ts:555` calls extraction in `evaluate_brand` — lenient, skips if fails

### New token flow (what we're building)
1. Design-principles doc = prose (LLM reads it as context)
2. LLM calls `lock_brand` tool during Stage 0, providing colors/fonts/theme
3. Brand stored in `session.artifacts.brand` (same accumulator pattern as pageSpec)
4. `assemble_site_files` reads brand from session — no regex, no doc parsing
5. `evaluate_brand` reads brand from session

### What consumes brand tokens (unchanged)
- `assembleFromSpec(pageSpec, brand)` in `painted-door-templates.ts`
- `renderGlobalsCss(brand)` — all 9 color fields as CSS variables, all 3 font fields
- `renderLayout(brand)` — siteName, tagline, Google Fonts URL
- `navFragment(brand)` — siteName, fonts.heading
- `footerFragment(brand)` — siteName
- `buildJsonLd(brand)` — siteName, siteUrl
- Blog/FAQ/Compare pages — siteName
- Section renderers (`painted-door-sections.ts`) do NOT use brand — they work from copy only

### Existing tool patterns to follow
- `lock_section_copy` — LLM provides section copy, validated, stored in pageSpec.sections
- `lock_page_meta` — LLM provides meta title/description, stored in pageSpec.pageMeta
- Both support `overwrite` parameter for revision during final review

## Files to Change

| File | Action |
|------|--------|
| `src/types/index.ts` | Add `brand?: BrandIdentity` to `BuildSession.artifacts` |
| `src/lib/agent-tools/website.ts` | Add `lock_brand` tool; update `assemble_site_files` and `evaluate_brand` to read brand from session; remove `foundation-tokens` import |
| `src/app/api/painted-door/[id]/chat/route.ts` | Remove prerequisite gate; update system prompt to mention `lock_brand` at Stage 0 |
| `src/lib/frameworks/prompts/design-principles/prompt.md` | Remove JSON token requirements; make Phase 3 prose-only |
| `src/lib/agent-tools/foundation.ts` | Remove WAIT-stripping hack and `json:design-tokens` instruction |
| `src/lib/foundation-tokens.ts` | **DELETE** |
| `src/lib/__tests__/foundation-tokens.test.ts` | **DELETE** |
| `src/lib/contrast-utils.ts` | **KEEP** (still used by `evaluate_brand` and new `lock_brand`) |
| `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts` | Remove prerequisite gate tests |
| `src/lib/agent-tools/__tests__/website-lock-brand.test.ts` | **NEW** — tests for `lock_brand` validation and session storage |

## `lock_brand` Tool Design

**Schema:** LLM provides siteName, tagline, theme (`light`/`dark`), colors (9 hex fields), fonts (3 Google Font names). All required.

**Validation:**
- All 9 color fields must be valid 6-digit hex (`#RRGGBB`)
- All 3 font fields must be non-empty strings
- Theme must be `'light'` or `'dark'`
- WCAG AA contrast (text on background) computed as **warning** if below 4.5:1, but brand still saved

**Storage:** `session.artifacts.brand` as `BrandIdentity`

**Supports `overwrite` parameter** for revision during final review (same as `lock_section_copy`).

## Key Constraint

The `BrandIdentity` type and `assembleFromSpec` signature in `painted-door-templates.ts` are **unchanged**. All 15 brand fields are still required for HTML rendering. The change is only in how those fields are populated — LLM tool call instead of regex extraction.
