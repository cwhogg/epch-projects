# KB-042: Move queuedPieces derivation out of the render IIFE

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/content/[id]/page.tsx:238-261`
- **Observed:** An IIFE wraps the mergedPieces.map solely to introduce queuedPieces into scope inside the render block. queuedPieces is a simple .filter derivation that belongs alongside completedCount and pendingCount before the return statement. The IIFE adds a needless nesting level.
- **Expected:** Derive queuedPieces above the return statement alongside other derived values.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** `src/app/content/[id]/page.tsx:116-118` shows `completedCount` and `pendingCount` derived from `mergedPieces` above the `return`. At lines 238-260, an IIFE introduces `queuedPieces` (a `.filter()` on `mergedPieces`) solely to use it inside the JSX map callback — the exact pattern described.
- **Root Cause:** Accidental convenience at authoring time. JSX expression-only constraints make the IIFE feel natural in the moment, but `queuedPieces` has no dependency that prevents it from being hoisted. The pre-return derivation block was not extended consistently.
- **Risk Assessment:** Zero. This is a pure client-component internal refactor. No API contracts, exported types, or test assertions are affected. All three dependencies of `queuedPieces` (`mergedPieces`, `publishedKeys`, `analysisId`) are available at the pre-return site.
- **Validated Fix:**
  1. After `src/app/content/[id]/page.tsx:118` (the `pendingCount` line), add: `const queuedPieces = mergedPieces.filter((p) => p.status === 'complete' && !publishedKeys.has(\`${analysisId}:${p.id}\`));`
  2. At lines 238-260, replace the IIFE `{(() => { ... })()}` with a plain `{mergedPieces.map((piece) => { ... })}`. The inner body is unchanged — only the IIFE wrapper and `const queuedPieces = ...` line inside it are removed.
- **Files Affected:** `src/app/content/[id]/page.tsx`
- **Estimated Scope:** Small — ~5 lines changed, no logic changes
