# KB-125: Extract website validator helpers out of agent-tools/website.ts

- **Type:** simplification
- **Discovered during:** code-simplifier-full
- **Location:** `src/lib/agent-tools/website.ts:28-261`
- **Observed:** The website tools file contains 11 pure, stateless validator functions (`checkLayoutMetadata`, `checkH1Count`, `checkSemanticHtml`, `checkTailwindImport`, `checkThemeColors`, `checkPostcssConfig`, `checkUseClientDirectives`, `checkRemovedNextJsApis`, `checkAsyncParams`, `checkPackageJson`, `checkBrokenLinks`) totaling ~234 lines before the tool factory begins. A dedicated test file already exists at `src/lib/__tests__/website-validators.test.ts` that imports all 11 functions from `../agent-tools/website` — the test author anticipated this module boundary. Keeping validators inside the tool factory file obscures both concerns: validators are unrelated to closure-based tool state, and the tool factory must be scrolled past 261 lines of validator code to reach the actual tool definitions.
- **Why out of scope:** Simplification opportunity — discovered during periodic codebase scan
- **Severity:** MEDIUM
- **Created:** 2026-02-22
