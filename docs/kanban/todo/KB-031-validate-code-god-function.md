# KB-031: validate_code is a 200-line god function with 8 unrelated validation concerns

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/agent-tools/website.ts:274-477`
- **Observed:** The validate_code execute handler performs layout metadata checks, H1 count, semantic HTML presence, Tailwind v4 import syntax, @theme color registration, use client directives, removed Next.js 15 APIs, async params pattern, package.json dependency checks, and broken link detection — each an independent concern with its own issues/suggestions pairs. A new contributor cannot identify which check produced a given issue without reading all 200 lines.
- **Expected:** Extract each validation concern into a named function, compose them in the handler
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-16
