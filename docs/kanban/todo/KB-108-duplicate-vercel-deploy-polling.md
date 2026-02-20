# KB-108: Vercel deployment polling logic duplicated across two callsites

- **Type:** simplification
- **Discovered during:** finishing-a-development-branch (code-simplifier)
- **Location:** `src/app/api/painted-door/[id]/route.ts:13-48` and `src/lib/agent-tools/website.ts:882-913`
- **Observed:** checkAndUpdateDeployment (route.ts) and the check_deploy_status tool (website.ts) both call the same Vercel deployments API endpoint, read state/readyState, and branch on READY/ERROR. The logic for what constitutes a successful deployment is decided in two separate places with slightly different handling.
- **Expected:** Extract deployment status checking into a shared utility function.
- **Why out of scope:** Simplification opportunity — not a bug or part of the current task
- **Severity:** HIGH
- **Created:** 2026-02-20
