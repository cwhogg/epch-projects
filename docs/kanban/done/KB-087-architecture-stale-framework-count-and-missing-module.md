# KB-087: architecture.md is stale

- **Type:** doc-staleness
- **Discovered during:** doc-staleness-detector
- **Location:** `docs/architecture.md`
- **Observed:**
  1. **Framework count wrong (lines 273, 773):** Doc says "4 frameworks: content-inc-model, forever-promise, value-metric, landing-page-assembly" but the codebase has 5 frameworks. The `smallest-viable-audience` framework (added with Seth Godin advisor on Feb 16) is missing from both the Mermaid diagram and the Core Library table.
  2. **Missing support module:** `src/lib/parse-advisor-segments.ts` is a new module (added Feb 18) that parses advisor identity markers from streamed chat content to render distinct advisor chat bubbles in the website builder. It is not listed in the Library Module Map diagram or the Core Library quick reference table.
- **Expected:**
  1. Framework references should list 5 frameworks: content-inc-model, forever-promise, value-metric, landing-page-assembly, smallest-viable-audience
  2. `parse-advisor-segments.ts` should appear in the Support Modules section of the Module Dependency Map and in the Core Library table with description: "Parse advisor identity markers from streamed content for distinct chat bubbles"
- **Source commits:** 23 commits since doc was last updated (Feb 18 08:07 to Feb 18 12:11)
- **Severity:** MEDIUM
- **Created:** 2026-02-18

## Triage (2026-02-18)

- **Verdict:** CONFIRM
- **Evidence:**
  - `docs/architecture.md:273` — Mermaid diagram node reads `"frameworks/prompts/<br/>4 frameworks: content-inc-model,<br/>forever-promise, value-metric,<br/>landing-page-assembly"`. The fifth framework `smallest-viable-audience` is absent.
  - `docs/architecture.md:773` — Core Library table row reads `"Framework library: registry, loader, 4 prompt sets (content-inc-model, forever-promise, value-metric, landing-page-assembly)"`. Same omission.
  - `src/lib/frameworks/registry.ts:3-44` — `FRAMEWORK_REGISTRY` contains 5 entries: value-metric, content-inc-model, forever-promise, smallest-viable-audience, landing-page-assembly.
  - `src/lib/frameworks/prompts/smallest-viable-audience/` — full prompt set (prompt.md, examples.md, anti-examples.md) exists on disk.
  - `src/lib/parse-advisor-segments.ts:1-78` — module exists and exports `parseStreamSegments()`. Not present in the Support Modules subgraph (`docs/architecture.md:143-160`) or the Core Library table (`docs/architecture.md:759-786`).
- **Root Cause:** Ordinary documentation lag. Both additions (smallest-viable-audience framework, parse-advisor-segments module) were made on Feb 16-18 without a corresponding architecture doc update. Not an intentional design choice.
- **Risk Assessment:** Near zero. All changes are text-only edits to a markdown doc. No source code, no API shapes, no tests affected.
- **Validated Fix:**
  1. `docs/architecture.md:273` — Change `"4 frameworks: content-inc-model,<br/>forever-promise, value-metric,<br/>landing-page-assembly"` to `"5 frameworks: content-inc-model,<br/>forever-promise, value-metric,<br/>landing-page-assembly,<br/>smallest-viable-audience"`.
  2. `docs/architecture.md:773` — Change `"4 prompt sets (content-inc-model, forever-promise, value-metric, landing-page-assembly)"` to `"5 prompt sets (content-inc-model, forever-promise, value-metric, landing-page-assembly, smallest-viable-audience)"`.
  3. `docs/architecture.md:158` (Support Modules subgraph, near `S_UTILS`) — Add a new node: `S_PARSE_ADVISOR["parse-advisor-segments"]`.
  4. `docs/architecture.md` Core Library table (after line ~786) — Add row: `| \`src/lib/parse-advisor-segments.ts\` | Parse advisor identity markers from streamed content for distinct chat bubbles |`
- **Files Affected:** `docs/architecture.md` only
- **Estimated Scope:** Small — 4 targeted string edits in a single markdown file
