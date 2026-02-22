# KB-116: Duplicated build session read-modify-save pattern in website tools

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/agent-tools/website.ts:377-418 and 444-467`
- **Observed:** `lock_section_copy` and `lock_page_meta` both implement the same 5-step pattern: call `getBuildSession`, guard on null session, initialize `pageSpec` if absent, mutate the session, call `saveBuildSession`. The initialization block `session.artifacts.pageSpec = { sections: [], metaTitle: '', metaDescription: '', ogDescription: '' }` is copy-pasted verbatim in both tools. Any change to the `PageSpec` default shape must be updated in two places.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** MEDIUM
- **Created:** 2026-02-21
