# KB-010: Split painted-door-templates.ts exceeding 944 lines

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/painted-door-templates.ts:1-944`
- **Observed:** The painted door templates file is 944 lines, combining all static HTML/CSS/JS template generation logic for painted door sites in one place. Templates for different site sections (hero, pricing, features, CTA, layout) could be split into focused template modules.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-16
- **Resolved:** 2026-02-16
- **Fix:** Closed during triage — file is a cohesive single-purpose code generator (factory for 21 output files); length is driven by content volume, not sprawl; the KB description misidentifies the structure as UI sections (hero/pricing/CTA) when the actual organization is by output file (blog/compare/faq/layout/sitemap); splitting would create cross-file import complexity for shared helpers (navFragment, footerFragment) used by 8+ template functions without improving maintainability or discoverability; severity HIGH is not warranted for a well-structured generator file flagged purely on line count.
