# KB-047: Duplicated `capitalize` function across two files

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/components/ReanalyzeForm.tsx:17` and `src/lib/research-agent-prompts.ts:12`
- **Observed:** The `capitalize` function is defined identically in both files. Both are `s.charAt(0).toUpperCase() + s.slice(1)`.
- **Expected:** Extract `capitalize` into a shared utility (e.g., `src/lib/utils.ts`) and import from both files.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:**
  - `src/components/ReanalyzeForm.tsx:17-19` — private `capitalize` function, used at line 86 to render `doc.type`
  - `src/lib/research-agent-prompts.ts:12-14` — identical private `capitalize` function, used at line 31 to build section headings
  - Both are `s.charAt(0).toUpperCase() + s.slice(1)`, no variation
  - `src/lib/utils.ts` exists and already exports other string/data helpers (`slugify`, `fuzzyMatchPair`, `formatScoreName`, `buildLeaderboard`) — no `capitalize` export present
- **Root Cause:** Both files needed to capitalize a `doc.type` string. Each author wrote the obvious local one-liner. `utils.ts` had no `capitalize` export at the time, so neither reached for a shared utility. Accidental duplication, not intentional.
- **Risk Assessment:** No API responses, no auth logic, no data shape changes. Both sites pass a guaranteed non-empty string (`doc.type`). Adding the export and updating two imports is a mechanical, zero-risk change. No existing tests cover the private `capitalize` functions directly.
- **Validated Fix:**
  1. Add to `src/lib/utils.ts`: `export function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }`
  2. Remove the private `capitalize` definition from `src/components/ReanalyzeForm.tsx` (lines 17-19) and add `import { capitalize } from '@/lib/utils';`
  3. Remove the private `capitalize` definition from `src/lib/research-agent-prompts.ts` (lines 12-14) and add `capitalize` to its existing import from `./utils` (or add a new import if none exists)
- **Files Affected:**
  - `src/lib/utils.ts` (add export)
  - `src/components/ReanalyzeForm.tsx` (remove local def, add import)
  - `src/lib/research-agent-prompts.ts` (remove local def, add import)
- **Estimated Scope:** Small — net change is ~4 lines removed, ~3 lines added across 3 files
