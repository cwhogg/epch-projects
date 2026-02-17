# KB-040: Extract duplicated publishedKeys fetch into a shared function

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/hooks/useContentCalendar.ts:46-51, 72-77`
- **Observed:** The block that fetches /api/publish/status and calls setPublishedKeys appears verbatim in two places: inside fetchCalendar and inside triggerPublish. Any change to the response shape or error handling must be made twice.
- **Expected:** Extract into a refreshPublishedKeys() helper within the hook.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17
