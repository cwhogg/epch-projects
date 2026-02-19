# KB-090: Monolithic types/index.ts at 567 lines

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/types/index.ts:1-567`
- **Observed:** The single types file at 567 lines contains unrelated domain type groups: product ideas, analyses, content pipeline, validation canvas, painted-door sites, foundation docs, agent/tool types, GSC analytics, and more. When a contributor adds a new feature, they must navigate this entire file to find or add types. The file has grown to the point where domain types (e.g., validation canvas types, painted-door types) would be easier to discover and maintain in feature-collocated files or domain-grouped files.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-18

- **Resolved:** 2026-02-18
- **Fix:** Closed during triage — false positive from code-simplifier. This is a pure type registry (declarations only, no logic), and line count is a poor complexity signal for type files. The file already has 9 section comments partitioning domains, and IDEs surface types by name — file navigation is not the real workflow. Splitting would require either updating 101 import sites across the codebase or maintaining a re-exporting barrel, both of which add maintenance surface with no correctness or runtime benefit. The project has demonstrated it can create domain-local type files (src/lib/frameworks/types.ts) but keeps the central barrel intentionally. Architecture is sound; severity HIGH is overclaimed.
