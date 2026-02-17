# KB-031: validate_code is a 200-line god function with 8 unrelated validation concerns

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/agent-tools/website.ts:274-477`
- **Observed:** The validate_code execute handler performs layout metadata checks, H1 count, semantic HTML presence, Tailwind v4 import syntax, @theme color registration, use client directives, removed Next.js 15 APIs, async params pattern, package.json dependency checks, and broken link detection — each an independent concern with its own issues/suggestions pairs. A new contributor cannot identify which check produced a given issue without reading all 200 lines.
- **Expected:** Extract each validation concern into a named function, compose them in the handler
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-16

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** Code at `src/lib/agent-tools/website.ts:274-477` matches the KB description exactly. The execute handler is 203 lines and contains 11 independent validation concerns (KB said 8; actual count is 11): layout OG/Twitter/description checks (lines 280-295), H1 count (lines 300-307), semantic HTML `<main>`/`<section>` (lines 309-316), Tailwind v4 import syntax (lines 321-329), @theme color registration (lines 331-361), postcss.config presence (lines 364-372), `use client` directives (lines 374-383), removed Next.js 15 APIs (lines 385-392), async params pattern (lines 394-401), package.json dependencies (lines 403-416), broken link detection (lines 418-466). Each concern reads from `allFiles` and appends to `issues`/`suggestions` with no cross-concern state dependencies.
- **Root Cause:** Accidental/historical accumulation. Each check was added inline as new failure modes surfaced during website agent development. No refactoring pass was made. The function grew from a small check to 11 independent concerns without structural reorganization.
- **Risk Assessment:** Low. Each concern is independent — no cross-check state dependencies. The `execute` return shape (`{ pass, score, issues, suggestions, totalFiles, checkedFiles }`) does not change. No existing tests for `website.ts` to break. No auth/security logic involved. The only execution risk is introducing a transcription bug during extraction, mitigated by the fact that each concern is self-contained.
- **Validated Fix:**
  1. Extract 11 named helper functions at module scope in `website.ts`, each accepting `allFiles: Record<string, string>` and returning `{ issues: string[], suggestions: string[] }`. Suggested names: `checkLayoutMetadata`, `checkH1Count`, `checkSemanticHtml`, `checkTailwindImport`, `checkThemeColors`, `checkPostcssConfig`, `checkUseClientDirectives`, `checkRemovedNextJsApis`, `checkAsyncParams`, `checkPackageJson`, `checkBrokenLinks`.
  2. Export these functions so they can be unit-tested.
  3. Replace the `execute` handler body with calls to each helper, collecting and spreading results into `issues` and `suggestions` arrays.
  4. Add a test file at `src/lib/__tests__/website-validators.test.ts` covering each helper with at least one passing and one failing fixture per check. Per CLAUDE.md TDD mandate, tests are required — and this refactor is the prerequisite for testability.
- **Files Affected:**
  - `src/lib/agent-tools/website.ts` (refactor execute handler, add module-scope helpers)
  - `src/lib/__tests__/website-validators.test.ts` (new file — unit tests for each helper)
- **Estimated Scope:** Medium — 11 helper functions (~5-20 lines each), simplified handler (~25 lines), new test file (~150-200 lines covering 11 helpers with pass/fail cases each).
