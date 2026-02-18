# KB-053: Architecture doc is stale

- **Type:** doc-staleness
- **Discovered during:** doc-staleness-detector
- **Location:** `docs/architecture.md`
- **Observed:**
  1. **Route rename not reflected:** `/analyses/[id]` was renamed to `/project/[id]` (commit 715ceb8). The architecture doc references the old path in multiple places:
     - Line 16: mermaid Client diagram shows `DETAIL["/analyses/[id]<br/>Project dashboard"]`
     - Line 96: module dependency map shows `P_DETAIL["analyses/[id]/page.tsx"]`
     - Line 100: `P_ANALYTICS_TAB["analyses/[id]/analytics/page.tsx"]`
     - Line 674: Quick Reference Pages table shows `src/app/analyses/[id]/page.tsx`
     - Line 681: Quick Reference Pages table shows `src/app/analyses/[id]/analytics/page.tsx`
  2. **API route rename not reflected:** `/api/analyses` and `/api/analyses/[id]` were also renamed to `/api/project` and `/api/project/[id]`:
     - Line 695: API routes table shows `/api/analyses` (now `/api/project`)
     - Line 696: API routes table shows `/api/analyses/[id]` (now `/api/project/[id]`)
  3. **Advisor count wrong (line 258, 760):** Registry description says "13-advisor" and "13 advisors" but `src/lib/advisors/registry.ts` now has 14 advisors (added Oli Gardner, Julian Shapiro, Seth Godin, Joanna Wiebe).
  4. **Foundation strategy advisor wrong (line 632):** Mermaid diagram shows `STRATEGY["strategy<br/>(Richard Rumelt)"]` but `DOC_ADVISOR_MAP` in `src/lib/agent-tools/foundation.ts` now maps strategy to `seth-godin`.
- **Expected:**
  1. All `/analyses/[id]` page references should be `/project/[id]`.
  2. All `/api/analyses` API references should be `/api/project`.
  3. Advisor count should say "14-advisor" / "14 advisors".
  4. Foundation strategy advisor should show Seth Godin, not Richard Rumelt.
- **Source commits:** 13 commits since doc was last updated (Feb 17 10:45 - Feb 17 14:45)
- **Severity:** HIGH
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** REVISE
- **Evidence:**
  - Finding 1 (page route rename): CONFIRMED. `src/app/project/[id]/` and `src/app/project/[id]/analytics/` exist on disk. No `analyses/[id]` directory exists anywhere under `src/app/`. Architecture doc at lines 16, 98, 103, 683, 691 still references the old `analyses/[id]` paths.
  - Finding 2 (API route rename): CONFIRMED. `src/app/api/project/route.ts` and `src/app/api/project/[id]/route.ts` exist on disk. Architecture doc at lines 704-705 still shows `/api/analyses` and `/api/analyses/[id]`.
  - Finding 3 (advisor count): CONFIRMED. `src/lib/advisors/registry.ts` has 14 advisor entries (richard-rumelt, copywriter, april-dunford, seo-expert, shirin-oreizy, joe-pulizzi, robb-wolf, patrick-campbell, robbie-kellman-baxter, oli-gardner, rob-walling, julian-shapiro, seth-godin, joanna-wiebe). Architecture doc at line 264 says "13 advisors" and line 771 says "13-advisor".
  - Finding 4 (strategy advisor mermaid): ALREADY FIXED. The KB item claims line 632 shows `Richard Rumelt` for strategy, but `docs/architecture.md` line 641 already reads `STRATEGY["strategy<br/>(Seth Godin)"]`. No action needed for this finding.
- **Root Cause:** Route renames were applied to source code in commit 715ceb8 and subsequent advisor additions were applied to the registry, but `docs/architecture.md` was not updated in the same commits. Standard doc-lag from feature work outpacing documentation. Finding 4 was already corrected at some point between when the detector ran and now — the KB item describes a state that no longer exists.
- **Risk Assessment:** Pure documentation changes to a markdown file. No runtime impact, no API shape changes, no test implications. Only risk is a copy error during editing, which is immediately verifiable by reading the file.
- **Validated Fix:**
  1. In `docs/architecture.md` line 16: change `DETAIL["/analyses/[id]<br/>Project dashboard"]` to `DETAIL["/project/[id]<br/>Project dashboard"]`
  2. In `docs/architecture.md` line 98: change `P_DETAIL["analyses/[id]/page.tsx"]` to `P_DETAIL["project/[id]/page.tsx"]`
  3. In `docs/architecture.md` line 103: change `P_ANALYTICS_TAB["analyses/[id]/analytics/page.tsx"]` to `P_ANALYTICS_TAB["project/[id]/analytics/page.tsx"]`
  4. In `docs/architecture.md` line 683: change `src/app/analyses/[id]/page.tsx` to `src/app/project/[id]/page.tsx`
  5. In `docs/architecture.md` line 691: change `src/app/analyses/[id]/analytics/page.tsx` to `src/app/project/[id]/analytics/page.tsx`
  6. In `docs/architecture.md` lines 704-705: change `/api/analyses` to `/api/project` and `/api/analyses/[id]` to `/api/project/[id]` (including row labels "Analyses" and "Analysis Detail" — update to reflect the new naming)
  7. In `docs/architecture.md` line 264: update the advisors_registry description to list 14 advisors and include Oli Gardner, Julian Shapiro, Seth Godin, Joanna Wiebe
  8. In `docs/architecture.md` line 771: change `13-advisor` to `14-advisor`
  - Note: Finding 4 (strategy mermaid diagram) requires NO change — line 641 already shows Seth Godin.
- **Files Affected:** `docs/architecture.md` only
- **Estimated Scope:** Small — 8 targeted text replacements in one markdown file, no logic changes
