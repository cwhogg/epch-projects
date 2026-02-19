# KB-098: Deduplicate segment-to-message mapping in streamResponse

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/website/[id]/build/page.tsx:259-268 and 286-295`
- **Observed:** The identical ternary that maps StreamSegment[] to ChatMessage[] (with advisor metadata spread) appears in both the signal branch and the no-signal fallback branch of streamResponse. Changes to the mapping logic must be duplicated in both places.
- **Expected:** Extract a shared helper function like `segmentsToMessages(segments, fallbackText)` to eliminate the duplication.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** LOW
- **Created:** 2026-02-19
