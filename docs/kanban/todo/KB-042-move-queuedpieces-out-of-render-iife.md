# KB-042: Move queuedPieces derivation out of the render IIFE

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/content/[id]/page.tsx:238-261`
- **Observed:** An IIFE wraps the mergedPieces.map solely to introduce queuedPieces into scope inside the render block. queuedPieces is a simple .filter derivation that belongs alongside completedCount and pendingCount before the return statement. The IIFE adds a needless nesting level.
- **Expected:** Derive queuedPieces above the return statement alongside other derived values.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17
