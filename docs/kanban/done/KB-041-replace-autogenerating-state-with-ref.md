# KB-041: Replace autoGenerating state with a ref

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/hooks/useContentCalendar.ts:23, 155-160`
- **Observed:** autoGenerating is set to true once and never reset. The effect that reads it deliberately omits it from its dependency array (eslint-disable-line), meaning it functions as a write-once flag. useState for a value that intentionally skips React's reactive machinery is misleading.
- **Expected:** Replace with useRef(false) — the correct primitive for a write-once, non-reactive flag.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** `src/hooks/useContentCalendar.ts:23` declares `const [autoGenerating, setAutoGenerating] = useState(false)`. At lines 155-160, the effect calls `setAutoGenerating(true)` exactly once and never resets it. The dependency array at line 160 explicitly excludes `autoGenerating` via `// eslint-disable-line react-hooks/exhaustive-deps`. `autoGenerating` does not appear in the hook's return object (lines 258-283), so it has no external consumers.
- **Root Cause:** Defensive guard added quickly to prevent double-firing `generateCalendar()`. The author reached for `useState` by default and suppressed the lint warning rather than choosing the semantically correct primitive (`useRef`). Not intentional design — it's a tool mismatch.
- **Risk Assessment:** Zero API shape change (`autoGenerating` is not returned). No existing tests for this hook. Single consumer (`src/app/content/[id]/page.tsx`) does not reference `autoGenerating`. The fix additionally eliminates a latent React Strict Mode bug: `useState` updates are async, so the double-invocation in Strict Mode can read stale state and fire `generateCalendar()` twice. A `useRef` is synchronously readable and closes this gap.
- **Validated Fix:**
  1. Add `useRef` to the import on line 3: `import { useEffect, useState, useCallback, useRef } from 'react';`
  2. Replace line 23: `const [autoGenerating, setAutoGenerating] = useState(false);` → `const autoGenerating = useRef(false);`
  3. Replace line 156 guard: `!autoGenerating` → `!autoGenerating.current`
  4. Replace line 157: `setAutoGenerating(true);` → `autoGenerating.current = true;`
- **Files Affected:** `src/hooks/useContentCalendar.ts` only
- **Estimated Scope:** Small — 3 line changes, single file, no downstream impact
