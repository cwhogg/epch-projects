# KB-112: architecture.md has stale model name and framework count

- **Type:** doc-staleness
- **Discovered during:** doc-staleness-detector
- **Location:** `docs/architecture.md`
- **Observed:**
  1. **Model name** appears as `claude-sonnet-4-20250514` in two places (line 61 in High-Level Architecture diagram and line 224 in Library Module Map diagram). Source (`src/lib/config.ts` line 1) shows the model was upgraded to `claude-sonnet-4-6` in commit `dafc7b9`.
  2. **Framework count** in the Library Module Map diagram (line 276) says "5 frameworks: content-inc-model, forever-promise, value-metric, landing-page-assembly, design-principles" but there are actually 6 frameworks. The `smallest-viable-audience` framework exists at `src/lib/frameworks/prompts/smallest-viable-audience/prompt.md` but is not listed.
- **Expected:** Replace `claude-sonnet-4-20250514` with `claude-sonnet-4-6` in both diagram locations. Update framework count from 5 to 6 and add `smallest-viable-audience` to the list.
- **Source commits:** 4 commits since doc was last updated (Feb 20 08:12 to Feb 20 15:08)
- **Severity:** MEDIUM
- **Created:** 2026-02-21
