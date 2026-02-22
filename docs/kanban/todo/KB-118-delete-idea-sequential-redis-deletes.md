# KB-118: deleteIdeaFromDb runs 8 independent Redis deletes sequentially

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/db.ts:35-48`
- **Observed:** `deleteIdeaFromDb` makes 8 sequential `await r.hdel/del` calls for analyses, analysis_content, progress, gsc_links, gsc_analytics, content_calendar, content_pieces, content_progress, and rejected_pieces — all targeting different Redis keys with no inter-call dependencies. KB-055 parallelized `deleteAllFoundationDocs` and `deleteCanvasData` but did not cover this function. The same `Promise.all` pattern applies here and would reduce latency by up to 7x for the initial cleanup phase of idea deletion.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** MEDIUM
- **Created:** 2026-02-21
