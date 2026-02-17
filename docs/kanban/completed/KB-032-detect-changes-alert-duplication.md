# KB-032: detectChanges constructs identical alert objects five times

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/analytics-agent.ts:248-335`
- **Observed:** Five alert conditions (first appearance, clicks up, clicks down, position improved, position dropped, traffic lost) each call alerts.push with the same six-field object shape: pieceSlug, pieceTitle, severity, message, metric, previousValue, currentValue. The repeated construction obscures the actual threshold logic and means adding a new alert field requires touching five sites.
- **Expected:** Extract a `createAlert()` helper that takes the varying fields and constructs the full object
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-16

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** `src/lib/analytics-agent.ts:253-334` contains six (not five as stated in KB) identical `alerts.push` call sites — first appearance (line 254), clicks up (line 273), clicks down (line 286), position improved (line 299), position dropped (line 312), traffic lost (line 325). Each constructs a full `PerformanceAlert` object with all seven fields. The `PerformanceAlert` interface is defined at `src/types/index.ts:244-252` with exactly those seven fields: `pieceSlug`, `pieceTitle`, `severity`, `message`, `metric`, `previousValue`, `currentValue`.
- **Root Cause:** Accretion — each alert condition was written inline as thresholds were added over time. No extraction was done when the second or third condition appeared. Not an intentional design choice.
- **Risk Assessment:** Low. The helper is internal to `detectChanges`. No API response shapes change — callers receive the same `PerformanceAlert[]`. Existing tests at `src/lib/__tests__/analytics-agent.test.ts:56-127` test behavior (severity, metric, message content) not call site structure, so they pass without modification. No auth or security logic involved.
- **Validated Fix:**
  1. Above the `for` loop in `detectChanges` (around line 248), define a private helper:
     ```ts
     function createAlert(
       current: PieceSnapshot,
       severity: AlertSeverity,
       message: string,
       metric: string,
       previousValue: number,
       currentValue: number,
     ): PerformanceAlert {
       return { pieceSlug: current.slug, pieceTitle: current.title, severity, message, metric, previousValue, currentValue };
     }
     ```
  2. Replace all six `alerts.push({ pieceSlug: current.slug, pieceTitle: current.title, ... })` blocks with `alerts.push(createAlert(current, ...))` calls, passing the varying fields inline.
  3. Ensure `AlertSeverity` is imported at the top of `analytics-agent.ts` if not already (it comes from `@/types`).
  4. Run `npm test` — all existing `detectChanges` tests must pass unchanged.
- **Files Affected:** `src/lib/analytics-agent.ts` only
- **Estimated Scope:** Small — ~30 lines removed (six 8-line push blocks become six 1–3 line calls), ~8 lines added (helper definition)
