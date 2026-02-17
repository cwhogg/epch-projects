# KB-002: Duplicated inline styles for version and edited badges

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/analyses/[id]/foundation/page.tsx:363-377, 491-507`
- **Observed:** The version badge styling and edited badge styling are duplicated across the expanded card view and collapsed card view. Same pattern repeats twice in the component.
- **Expected:** Extract shared badge style objects (e.g. `const versionBadgeStyle = {...}`, `const editedBadgeStyle = {...}`) to reduce duplication and ensure consistent styling if one instance gets updated.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16

## Triage (2026-02-16)

- **Verdict:** CONFIRM
- **Evidence:** Both style objects are byte-for-byte duplicates.
  - Version badge: `src/app/analyses/[id]/foundation/page.tsx:362-368` (expanded) and `:491-497` (collapsed) — identical `fontFamily`, `fontSize`, `fontWeight`, `color`, `background`, `padding`, `borderRadius`.
  - Edited badge: `:370-377` (expanded) and `:500-507` (collapsed) — identical all properties including `textTransform: 'uppercase' as const`.
- **Root Cause:** Expanded and collapsed card views are two branches of a single ternary render. The developer needed the same visual badges in both contexts and copy-pasted the inline style objects rather than extracting them. Accidental duplication, not intentional.
- **Risk Assessment:** Near-zero. Pure UI constant extraction. No logic change, no API response shapes involved, no other files import these styles, no tests affected. Only type risk: extracted `editedBadgeStyle` object must carry `textTransform: 'uppercase' as const` (or be typed as `React.CSSProperties`) to satisfy TypeScript — caught immediately by `npm run build`.
- **Validated Fix:**
  1. At the top of the component (before the return), add two constants:
     ```ts
     const versionBadgeStyle: React.CSSProperties = {
       fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 500,
       color: 'var(--text-muted)', background: 'var(--bg-elevated)',
       padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)',
     };
     const editedBadgeStyle: React.CSSProperties = {
       fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 600,
       letterSpacing: '0.05em', textTransform: 'uppercase',
       color: 'var(--accent-coral)', background: 'var(--accent-coral-soft)',
       padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)',
     };
     ```
  2. Replace the inline style object at line 362 with `style={versionBadgeStyle}`.
  3. Replace the inline style object at line 370 with `style={editedBadgeStyle}`.
  4. Replace the inline style object at line 491 with `style={versionBadgeStyle}`.
  5. Replace the inline style object at line 500 with `style={editedBadgeStyle}`.
  6. Run `npm run build` to confirm no TypeScript errors.
- **Files Affected:** `src/app/analyses/[id]/foundation/page.tsx` only
- **Estimated Scope:** Small — 4 replacements, 2 new constants, ~10 net lines changed
