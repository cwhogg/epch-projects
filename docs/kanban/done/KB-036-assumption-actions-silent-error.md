# KB-036: AssumptionActions silently swallows fetch errors

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/components/AssumptionActions.tsx:15-29`
- **Observed:** The updateStatus function doesn't handle non-ok responses or network failures. On failure, loading resets and the UI returns to pre-loading state with no feedback to the user. Silent failure in a user-facing action.
- **Expected:** Show an error state or message when the status update fails.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** MEDIUM
- **Created:** 2026-02-17

## Triage (2026-02-17)

- **Verdict:** CONFIRM
- **Evidence:** `src/components/AssumptionActions.tsx:15-29` — The `updateStatus` function uses `try/finally` with an explicit `if (res.ok)` check on line 23. There is no `else` branch for non-ok responses (400, 404, 500) and no `catch` for network failures. Both paths silently clear the loading state and return the UI to its pre-action state with no user feedback.
- **Root Cause:** Accidental omission. The author correctly guarded the success path (`if (res.ok) { window.location.reload() }`) and used `finally` to ensure loading always resets, but forgot to handle the failure paths. The API route at `src/app/api/validation/[ideaId]/status/route.ts` returns structured JSON errors (400, 404, 500) that the client never reads.
- **Risk Assessment:** Risk is very low. The fix is entirely local to one file. No other files are affected beyond `ValidationCanvas.tsx` which simply renders the component — its interface (`ideaId`, `type`, `status` props) does not change. No API shapes change. No tests exist for this component, so no test breakage risk.
- **Validated Fix:**
  1. Add `const [error, setError] = useState<string | null>(null)` alongside the existing `loading` state.
  2. In `updateStatus`, call `setError(null)` at the top before `setLoading(true)`.
  3. Add an `else` branch after `if (res.ok)`: attempt to parse the JSON body and call `setError(data.error ?? 'Failed to update status')`.
  4. Add a `catch` block outside the `if/else` (after the fetch) to catch network failures: `setError('Network error — please try again')`.
  5. Render the error inline: if `error` is non-null, display a small error message below the action buttons (do not hide the buttons, so the user can retry). A `<p className="text-[11px]" style={{ color: 'var(--color-danger)' }}>` element is sufficient — no new UI components needed.
- **Files Affected:**
  - `src/components/AssumptionActions.tsx` — the only file that needs changes
- **Estimated Scope:** Small — approximately 8-12 lines added, no structural changes
