# KB-034: Duplicated canvas generation block across two files

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/lib/research-agent.ts:192-198` and `src/lib/agent-tools/research.ts:351-357`
- **Observed:** The try/catch block that calls generateAssumptions after analysis completion appears identically in both files. The same dynamic import, error log pattern, and best-effort semantics are duplicated. Any change must be made in both places.
- **Expected:** Extract a shared helper (e.g., `tryGenerateCanvas(ideaId)`) that both call sites use.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-17
