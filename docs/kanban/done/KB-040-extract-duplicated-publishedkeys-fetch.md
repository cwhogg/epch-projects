# KB-040: Extract duplicated publishedKeys fetch into a shared function

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/hooks/useContentCalendar.ts:46-51, 72-77`
- **Observed:** The block that fetches /api/publish/status and calls setPublishedKeys appears verbatim in two places: inside fetchCalendar and inside triggerPublish. Any change to the response shape or error handling must be made twice.
- **Expected:** Extract into a refreshPublishedKeys() helper within the hook.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:**
  - `src/hooks/useContentCalendar.ts:46-51` — inside `fetchCalendar`, verbatim 6-line block fetching `/api/publish/status` and calling `setPublishedKeys`
  - `src/hooks/useContentCalendar.ts:72-77` — inside `triggerPublish`, identical block; same URL, same `.catch(() => null)` guard, same `Array.isArray` check, same `new Set(...)` cast
  - Grep confirms `/api/publish/status` appears only in this one file, at these two locations
- **Root Cause:** `fetchCalendar` was written first and included the status fetch. `triggerPublish` was added later and needed a post-publish refresh, so the block was copy-pasted rather than extracted into a shared helper.
- **Risk Assessment:** Low. This is a pure internal refactor of the hook. The public return shape is unchanged. No other files import or depend on the extracted helper. No existing test file for this hook. No auth or security logic involved.
- **Validated Fix:**
  1. Add `refreshPublishedKeys` as a `useCallback` with `[]` dep array, placed before `fetchCalendar` in the hook body:
     ```ts
     const refreshPublishedKeys = useCallback(async () => {
       const statusRes = await fetch('/api/publish/status').catch(() => null);
       if (statusRes?.ok) {
         const statusData = await statusRes.json();
         if (Array.isArray(statusData.publishedKeys)) {
           setPublishedKeys(new Set(statusData.publishedKeys as string[]));
         }
       }
     }, []);
     ```
  2. Replace the 6-line block at lines 46-51 in `fetchCalendar` with `await refreshPublishedKeys();`
  3. Replace the 6-line block at lines 72-77 in `triggerPublish` with `await refreshPublishedKeys();`
  4. Add `refreshPublishedKeys` to the dep array of `fetchCalendar`'s `useCallback` (line 58 currently: `[analysisId]` → `[analysisId, refreshPublishedKeys]`)
  5. `triggerPublish` is not wrapped in `useCallback`, so no dep array change needed there
- **Files Affected:** `src/hooks/useContentCalendar.ts` only
- **Estimated Scope:** Small — net -8 lines (12 deleted, 4 added), single file, no callers affected
