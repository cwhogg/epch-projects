# KB-014: Split content-agent.ts exceeding 652 lines

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/content-agent.ts:1-652`
- **Observed:** The content agent is 652 lines handling context building, calendar generation, piece appending, and SEO data parsing. The context-building and calendar-generation responsibilities are distinct enough to split into separate modules.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** HIGH
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** REVISE
- **Evidence:** File is confirmed at 652 lines (`src/lib/content-agent.ts:1-652`). Contains six distinct sections marked with comment banners: Context Builder (lines 44-123), Calendar Generation (lines 125-173), Append New Pieces (lines 175-248), Content Generation V1 loop (lines 250-383), File Output / vault writing (lines 384-445), and V2 agentic runner (lines 447-652). The KB item correctly identifies the file as multi-responsibility but targets the wrong seam.
- **Root Cause:** Organic growth. V1 simple LLM pipeline was written first; V2 agentic runner (150 lines with its own system prompt, resume/pause state machine, and tool setup) was appended to the same file later. Comment banners signal someone recognized the sections were separable but extraction was deferred.
- **Risk Assessment:** No API response shape changes — these are server-side functions. No test file exists for `content-agent.ts` so no test breakage. Nine files import from `content-agent.ts`; import paths in those files will need updates only for functions that move modules. No auth/security logic touched.
- **Validated Fix:** The correct split follows actual architectural seams, not the KB-proposed context/calendar split (those two are tightly coupled — `appendNewPieces`, `generateContentPieces`, and `generateContentCalendar` all call `buildContentContext`):
  1. Extract `src/lib/content-context.ts` — move `buildContentContext` and its inline SEO parsing logic (lines 44-123). No LLM calls; pure async data transformation. `ContentContext` type stays in `content-prompts.ts` as the shared contract.
  2. Extract `src/lib/content-vault.ts` — move `getContentDir`, `getFilename`, `writeContentToVault`, `writeCalendarIndex` (lines 384-445). Pure filesystem I/O; currently unexported, keep them unexported or export only from this module.
  3. Extract `src/lib/content-agent-v2.ts` — move `CONTENT_SYSTEM_PROMPT` constant and `generateContentPiecesV2` (lines 447-638). This is a full agentic runner with its own lifecycle and mirrors the pattern used by other agents in the codebase.
  4. Residual `src/lib/content-agent.ts` drops to ~250 lines: calendar generation (`generateContentCalendar`, `appendNewPieces`), V1 generation loop (`generateContentPieces`, `generateSinglePiece`), and the entry-point dispatcher (`generateContentPiecesAuto`). These remain the primary public exports.
  5. Update import sites: check the 9 files that import from `content-agent.ts` and update any that import `buildContentContext` (moves to `content-context.ts`). The calendar and generation functions stay in place, so most callers require no changes.
- **Files Affected:** `src/lib/content-agent.ts` (reduce to ~250 lines), `src/lib/content-context.ts` (new), `src/lib/content-vault.ts` (new), `src/lib/content-agent-v2.ts` (new), plus any of the 9 importing files that use `buildContentContext` directly.
- **Estimated Scope:** Medium — 3 new files created, 1 file reduced by ~400 lines, up to 9 import sites to scan (most will not need changes since the primary public exports stay in `content-agent.ts`).
