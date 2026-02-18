# KB-043: Duplicated dependency graph in canGenerate

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/foundation/[id]/page.tsx:28-36`
- **Observed:** canGenerate re-encodes the exact same doc dependency graph that already exists as DOC_UPSTREAM in src/lib/agent-tools/foundation.ts. The same decision — which docs are required before a type can be generated — is being made in two places. Adding a new doc type requires updating both, and they can silently diverge.
- **Expected:** Import and reuse DOC_UPSTREAM from the shared module instead of duplicating the dependency graph
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** REVISE
- **Evidence:**
  - `src/app/foundation/[id]/page.tsx:29-37`: `canGenerate` encodes the full dependency graph as a chain of `if` statements. Exactly matches `DOC_UPSTREAM` in `foundation.ts:24-31` in every entry. Both are currently in sync.
  - `src/lib/agent-tools/foundation.ts:24-31`: `DOC_UPSTREAM` is declared `const` and NOT exported. It is a server-side module that imports `@/lib/db`, `@/lib/anthropic`, `@/lib/advisors/prompt-loader`, and `@/lib/config` — all server-only dependencies.
  - `src/app/foundation/[id]/foundation-config.ts`: Already exists as an isomorphic (safe for client) shared config used by the page. Currently holds `DOC_CONFIG` (display labels, advisor names, `requires` display strings). Does NOT hold machine-readable dependency arrays.
- **Root Cause:** Accidental duplication. `canGenerate` was written as a local page function, likely before `DOC_UPSTREAM` existed or without awareness of it. Both encode the same domain logic ("which docs are prerequisites for generation") but for different consumers: `DOC_UPSTREAM` drives server-side generation enforcement; `canGenerate` drives client-side UI gating (enable/disable the generate button). The fix as described in the KB item — "import DOC_UPSTREAM from the shared module" — is INVALID because `foundation.ts` is server-only and cannot be imported from a `'use client'` component.
- **Risk Assessment:**
  - Directly importing `DOC_UPSTREAM` from `foundation.ts` into `page.tsx` would pull server-only imports into the client bundle, causing a Next.js build error. This is the primary risk with the naive fix.
  - The correct fix is safe and low risk: move `DOC_UPSTREAM` (or an equivalent `DOC_DEPENDENCIES` constant) into `foundation-config.ts`, which is already isomorphic and already imported by both the page and can be imported by `foundation.ts`.
  - No API response shape changes. No auth/security surface touched.
  - Existing page tests mock sub-components and do not test `canGenerate` directly, so no test breakage expected. A test for the dependency consistency (single source of truth) should be added.
- **Validated Fix:**
  1. In `src/app/foundation/[id]/foundation-config.ts`: Add and export `DOC_DEPENDENCIES: Record<FoundationDocType, FoundationDocType[]>` with the same values as the current `DOC_UPSTREAM` in `foundation.ts`.
  2. In `src/lib/agent-tools/foundation.ts`: Remove the local `DOC_UPSTREAM` const. Import `DOC_DEPENDENCIES` from `@/app/foundation/[id]/foundation-config` (or move it to a more neutral shared path like `src/lib/foundation-deps.ts` to avoid importing app-layer from lib-layer — preferred). Replace all uses of `DOC_UPSTREAM` with `DOC_DEPENDENCIES`.
  3. In `src/app/foundation/[id]/page.tsx`: Delete `canGenerate`. Replace its call sites with an inline derivation: `const canGen = DOC_DEPENDENCIES[type].every(dep => !!docs[dep]);`
  4. Preferred shared path to avoid app-from-lib coupling: create `src/lib/foundation-deps.ts` as the single home. Export from there; import in both `foundation-config.ts` (for DOC_CONFIG's `requires` display field if desired) and `foundation.ts`.
  5. Add a test in `src/lib/__tests__/foundation-tools.test.ts` or a new `foundation-deps.test.ts` verifying that `DOC_DEPENDENCIES` keys cover all `FoundationDocType` values.
- **Files Affected:**
  - `src/app/foundation/[id]/page.tsx` (remove `canGenerate`, import and use shared constant)
  - `src/lib/agent-tools/foundation.ts` (remove local `DOC_UPSTREAM`, import shared constant)
  - New file: `src/lib/foundation-deps.ts` (single source of truth for the dependency graph)
  - `src/lib/__tests__/foundation-tools.test.ts` or new `src/lib/__tests__/foundation-deps.test.ts` (add coverage)
- **Estimated Scope:** Small — ~30 lines changed across 3 files, plus one new ~10 line file. No logic changes, pure restructuring.
