# KB-023: CLAUDE.md is stale

- **Type:** doc-staleness
- **Discovered during:** doc-staleness-detector
- **Location:** `CLAUDE.md`
- **Observed:** The Commands section lists only 3 commands (`npm run dev`, `npm run build`, `npm run lint`). Since Feb 3, vitest was added to the project (commit 587d345). The `package.json` now includes `"test": "vitest run"` and `"test:watch": "vitest"`, but these are not documented in CLAUDE.md. This means Claude Code does not know how to run tests for this project.
- **Expected:** The Commands section should include `npm test` (run tests once) and `npm run test:watch` (run tests in watch mode). Since CLAUDE.md is the file Claude Code reads for project instructions, missing the test command undermines TDD workflow.
- **Source commits:** 107 commits since doc was last updated, Feb 3 - Feb 16
- **Severity:** MEDIUM
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** CONFIRM
- **Evidence:** `package.json` lines 10-11 confirm both scripts: `"test": "vitest run"` and `"test:watch": "vitest"`. `CLAUDE.md` lines 20-24 confirm the Commands section contains only `npm run dev`, `npm run build`, and `npm run lint` — neither test command is present.
- **Root Cause:** Documentation lag. Vitest was added after CLAUDE.md was written; the Commands section was never updated. Not intentional.
- **Risk Assessment:** Documentation-only change. No source code, API shapes, or imports are touched. Zero risk of breakage.
- **Validated Fix:** Add two lines to the Commands section of `CLAUDE.md`: `npm test` (maps to `vitest run`, for CI/single-run) and `npm run test:watch` (maps to `vitest`, for watch mode).
- **Files Affected:** `/Users/ericpage/software/epch-projects/CLAUDE.md`
- **Estimated Scope:** Small — 2-line addition to a docs file.
