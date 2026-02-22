# KB-113: brand-identity-spec.md still describes dark-mode-first design

- **Type:** doc-staleness
- **Discovered during:** doc-staleness-detector
- **Location:** `docs/design/brand-identity-spec.md`
- **Observed:** KB-093 documented this same issue and was moved to `done/` in commit `5d26e63` (Feb 19) as part of a bulk commit, but the doc itself was never actually updated. Its last git commit is Feb 17 (`git log -1 --format="%aI" -- docs/design/brand-identity-spec.md` returns `2026-02-17T10:08:20-08:00`). All nine issues from KB-093 remain:
  1. Color system describes dark-mode-first design (`--bg-primary: #0d0d0f`) but app uses warm off-white (`--bg-primary: #FAF9F7`)
  2. Design philosophy (line 77) says "Dark-first with automatic light mode" -- actual is warm white, no dark mode
  3. Nav glassmorphism uses dark colors (`rgba(13, 13, 15, 0.85)`) -- actual is warm off-white (`rgba(250, 249, 247, 0.92)`)
  4. Texture section describes noise overlay -- actual app has none
  5. Anti-patterns says "Never use warm foundation colors" -- actual design IS warm foundation colors
  6. Shadow values are dark-mode shadows
  7. Claude Code Recreation Prompt produces wrong design
  8. `--color-danger` value mismatch (`#f87171` vs `#ef4444`)
  9. `--accent-coral-soft` value mismatch (`0.15` vs `0.12`)
- **Expected:** Apply the validated fix from KB-093: rewrite color system, design philosophy, nav glassmorphism, texture, anti-patterns, shadows, and Claude Code recreation prompt to match the warm off-white light-only design in `src/app/globals.css` and `docs/design/design-principles.md`.
- **Source commits:** 118 commits since doc was last updated (Feb 17 to Feb 20)
- **Severity:** HIGH
- **Created:** 2026-02-21
