# Aligned Plugin Parity Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Make the `aligned_cc_skills` plugin a complete, standalone replacement for the local `~/.claude/` skills, agents, and hooks — so the user can delete all local versions and colleagues get the identical experience by installing the plugin.

**Source Design Doc:** N/A — derived from gap analysis session on 2026-02-17

**Architecture:** The plugin at `~/software/aligned_cc_skills/` becomes the single canonical source for all Claude Code customization. All skills, agents, hooks, and advisor prompts ship with the plugin. Local `~/.claude/skills/`, `~/.claude/agents/`, and `~/.claude/hooks/` are deleted after migration. The advisor discovery mechanism is updated to support plugin-relative paths.

**Tech Stack:** Claude Code plugin system, Markdown, JavaScript (hooks), Bash (hooks)

**Working directory for ALL tasks:** `/Users/ericpage/software/aligned_cc_skills/`

---

## Prerequisites

> Complete these steps manually before starting Task 1.

- [ ] Ensure `~/software/aligned_cc_skills/` is on the `main` branch with a clean working tree
- [ ] Run `git pull` in `~/software/aligned_cc_skills/` to get latest

---

### Task 1: Update Plugin CLAUDE.md with Behavioral Guardrails

**Files:**
- Modify: `CLAUDE.md`

The current plugin CLAUDE.md (50 lines) only covers development conventions. It is missing the behavioral guardrails that make the skills effective: verification discipline, TDD mandate, auto-critique requirements, communication style, error path test requirements.

**Step 1:** Read the current `CLAUDE.md` in the plugin repo.

**Step 2:** Read the local `~/.claude/CLAUDE.md` to extract the behavioral guardrails sections. The key sections to port are:
- **Testing** (TDD mandate, error path tests for mocks)
- **Verification Discipline** (every success claim requires evidence)
- **Communication Style** (no sycophancy)
- **Auto-Critique for Design Documents** (mandatory critique after brainstorming/writing-plans)
- **Hook-Triggered Audits** (how to handle `[TAG]` messages from hooks)

**Step 3:** Merge these sections into the plugin's CLAUDE.md. Preserve the existing plugin-specific content (canonical source note, path rules, skill authorship notes). Add the behavioral guardrails as new sections. Remove any references to `~/.claude/` paths — the plugin CLAUDE.md should reference `skills/`, `agents/`, `hooks/` (plugin-relative paths). Remove the note about the legacy sync script since we're deleting it.

**Step 4:** Commit:
```bash
git add CLAUDE.md
git commit -m "feat: add behavioral guardrails to plugin CLAUDE.md"
```

---

### Task 2: Port All 5 Hook Scripts to Plugin

**Files:**
- Create: `hooks/auto-approve-worktrees.js`
- Create: `hooks/check-cron-results.sh`
- Create: `hooks/check-test-audit.sh`
- Create: `hooks/error-tracker.js`
- Create: `hooks/usage-tracker.js`

**Step 1:** Copy each hook file from `~/.claude/hooks/` to the plugin's `hooks/` directory:

```bash
cp ~/.claude/hooks/auto-approve-worktrees.js hooks/
cp ~/.claude/hooks/check-cron-results.sh hooks/
cp ~/.claude/hooks/check-test-audit.sh hooks/
cp ~/.claude/hooks/error-tracker.js hooks/
cp ~/.claude/hooks/usage-tracker.js hooks/
chmod +x hooks/check-cron-results.sh hooks/check-test-audit.sh
```

**Step 2:** Generalize hardcoded paths in each hook. The hooks currently use `$HOME/.claude/` for state files. These need to stay as `$HOME/.claude/` since that's where Claude Code stores user-level state (the plugin doesn't change that). Verify:
- `auto-approve-worktrees.js`: No hardcoded paths — checks `cwd` for `.worktrees` dynamically. No changes needed.
- `check-cron-results.sh`: Uses `$HOME/.claude/` for cron results and `$PWD/docs/kanban/todo` for KB items. The `$HOME/.claude/` paths are correct for user-level state. Change `$PWD/docs/kanban/todo` references to match folder-based kanban structure (will be consistent with Task 5's changes). No absolute user paths like `/Users/ericpage/`.
- `check-test-audit.sh`: Uses `$HOME/.claude/last-test-audit.timestamp` and `$PWD/` for test config detection. These are correct — no changes needed.
- `error-tracker.js`: Uses `process.env.HOME + '/.claude/error-tracking/'`. Correct — no changes needed.
- `usage-tracker.js`: Uses `process.env.HOME + '/.claude/usage-tracking/'`. Correct — no changes needed.

**Step 3:** Read each copied file to verify no `/Users/ericpage/` absolute paths leaked through.

**Step 4:** Commit:
```bash
git add hooks/
git commit -m "feat: port all 5 hook scripts to plugin"
```

---

### Task 3: Update hooks.json with All Event Types

**Files:**
- Modify: `hooks/hooks.json`

The current hooks.json only has one UserPromptSubmit hook (eval-audit check). Update it to include all 5 event types.

**Step 1:** Read the current `hooks/hooks.json`.

**Step 2:** Replace with the complete hook configuration. Note: plugin hooks use paths relative to the plugin root (the `hooks/` directory is at the plugin root level). The hook commands reference scripts in the plugin's own `hooks/` directory:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node hooks/auto-approve-worktrees.js",
            "timeout": 5
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "hooks/check-cron-results.sh",
            "statusMessage": "Checking background audit results..."
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "hooks/check-test-audit.sh",
            "statusMessage": "Checking test audit status..."
          }
        ]
      },
      {
        "type": "command",
        "command": "cat e2e/.eval-audit-last-run 2>/dev/null",
        "description": "Check eval audit recency for daily cron trigger"
      }
    ],
    "PostToolUseFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node hooks/error-tracker.js",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node hooks/error-tracker.js",
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "Skill|Task",
        "hooks": [
          {
            "type": "command",
            "command": "node hooks/usage-tracker.js",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**Important:** Plugin hook commands may resolve relative to the project CWD, not the plugin root. If testing shows the relative paths (`hooks/check-cron-results.sh`) don't resolve correctly, the commands will need to use a discovery mechanism. Test this after the full migration (see Manual Steps).

**Step 3:** Commit:
```bash
git add hooks/hooks.json
git commit -m "feat: configure all 5 hook event types in hooks.json"
```

---

### Task 4: Delete Sync Infrastructure

**Files:**
- Delete: `scripts/sync-from-local.sh`
- Delete: `scripts/transforms.txt`
- Delete: `scripts/` directory (if empty after deletions)

The sync script and transforms.txt are dead code — the plugin is now the canonical source.

**Step 1:** Remove the files:
```bash
rm scripts/sync-from-local.sh scripts/transforms.txt
rmdir scripts 2>/dev/null || true
```

**Step 2:** Update CLAUDE.md to remove any references to the sync script or transforms.txt.

**Step 3:** Commit:
```bash
git add -A scripts/ CLAUDE.md
git commit -m "chore: remove sync infrastructure (plugin is now canonical source)"
```

---

### Task 5: Convert Kanban Format to Folder-Based System

**Files:**
- Modify: `skills/kickstart/SKILL.md`
- Modify: `skills/executing-plans/SKILL.md`
- Modify: `skills/finishing-a-development-branch/SKILL.md`
- Modify: `skills/systematic-debugging/SKILL.md`
- Modify: `skills/writing-plans/SKILL.md`
- Modify: `skills/eval-audit/SKILL.md`

All 6 files currently reference `docs/Kanban-board.md` (single-file format with `BUG-NNN` entries). Convert all to the folder-based format:
- `docs/kanban/todo/KB-NNN-slug.md` (individual files)
- `docs/kanban/in-progress/`
- `docs/kanban/completed/`
- `docs/kanban/did_not_complete/`
- `docs/kanban/.counter` (auto-incrementing)

**Step 1:** Read each of the 6 files. For each, locate all references to `docs/Kanban-board.md` and the `BUG-NNN` entry format.

**Step 2:** In `skills/kickstart/SKILL.md`:
- Change the scaffold tree to show `docs/kanban/` directory structure instead of `docs/Kanban-board.md`
- Add scaffold instructions to create: `docs/kanban/todo/`, `docs/kanban/in-progress/`, `docs/kanban/completed/`, `docs/kanban/did_not_complete/`, `docs/kanban/.counter` (initialized to `1`)
- Update the CLAUDE.md seeding section to reference `docs/kanban/` instead of `docs/Kanban-board.md`

**Step 3:** In `skills/executing-plans/SKILL.md`:
- Replace the bug filing section that appends to `docs/Kanban-board.md` with the folder-based format:
  1. Read `docs/kanban/.counter` for next KB number (pad to 3 digits)
  2. Derive kebab-case slug from title (max 50 chars)
  3. Write `docs/kanban/todo/KB-NNN-slug.md` with structured template
  4. Increment and write back `.counter`
- Change `BUG-NNN` references to `KB-NNN`

**Step 4:** Apply the same folder-based kanban format conversion to:
- `skills/finishing-a-development-branch/SKILL.md`
- `skills/systematic-debugging/SKILL.md`
- `skills/writing-plans/SKILL.md`
- `skills/eval-audit/SKILL.md`

Use this standardized KB entry template for all:

```markdown
# KB-NNN: [Title]

- **Type:** bug | simplification | discrepancy
- **Discovered during:** [skill name]
- **Location:** `[file path]:[line range]`
- **Observed:** [What exists and why it's a problem]
- **Expected:** [What should change]
- **Why out of scope:** [Why not fixed now]
- **Severity:** LOW | MEDIUM | HIGH
- **Created:** YYYY-MM-DD
```

**Step 5:** Verify no remaining references to `Kanban-board.md` or `BUG-NNN` in any of the 6 files. Use Grep to confirm.

**Step 6:** Commit:
```bash
git add skills/kickstart/SKILL.md skills/executing-plans/SKILL.md skills/finishing-a-development-branch/SKILL.md skills/systematic-debugging/SKILL.md skills/writing-plans/SKILL.md skills/eval-audit/SKILL.md
git commit -m "feat: convert all skills to folder-based kanban system (KB-NNN)"
```

---

### Task 6: Port Code-Reviewer Agent

**Files:**
- Create: `agents/code-reviewer.md`

**Step 1:** Copy from local:
```bash
cp ~/.claude/agents/code-reviewer.md agents/
```

**Step 2:** Read the copied file. Verify no hardcoded paths. The research confirmed this agent is project-agnostic with no hardcoded paths. The reference to `test-driven-development/testing-anti-patterns.md` is a plugin-relative path that already works.

**Step 3:** Commit:
```bash
git add agents/code-reviewer.md
git commit -m "feat: port code-reviewer agent to plugin"
```

---

### Task 7: Port Code-Simplifier Agent

**Files:**
- Create: `agents/code-simplifier.md`

**Step 1:** Copy from local:
```bash
cp ~/.claude/agents/code-simplifier.md agents/
```

**Step 2:** Read the copied file. Verify no hardcoded paths. The research confirmed this agent is project-agnostic. It uses generic `src/` and `git diff` references. It reads the project's `CLAUDE.md` for conventions — this is correct behavior for any project.

**Step 3:** Commit:
```bash
git add agents/code-simplifier.md
git commit -m "feat: port code-simplifier agent to plugin"
```

---

### Task 8: Port Test-Auditor System (7 Files)

**Files:**
- Create: `agents/test-auditor.md`
- Create: `agents/workers/test-audit-business-logic.md`
- Create: `agents/workers/test-audit-value.md`
- Create: `agents/workers/test-audit-coverage-gap.md`
- Create: `agents/workers/test-audit-isolation-antipattern.md`
- Create: `agents/references/test-audit-scoring.md`
- Create: `agents/references/test-audit-output-schema.md`

**Step 1:** Create directories and copy files:
```bash
mkdir -p agents/workers agents/references
cp ~/.claude/agents/test-auditor.md agents/
cp ~/.claude/agents/workers/test-audit-business-logic.md agents/workers/
cp ~/.claude/agents/workers/test-audit-value.md agents/workers/
cp ~/.claude/agents/workers/test-audit-coverage-gap.md agents/workers/
cp ~/.claude/agents/workers/test-audit-isolation-antipattern.md agents/workers/
cp ~/.claude/agents/references/test-audit-scoring.md agents/references/
cp ~/.claude/agents/references/test-audit-output-schema.md agents/references/
```

**Step 2:** Generalize `agents/test-auditor.md`:
- **Line ~36:** Replace the hardcoded path `/Users/ericpage/software/va-web-app/` with a generic instruction: "Analyze the test suite in the current project directory." The glob pattern `src/**/__tests__/**/*.test.{ts,tsx}` should become configurable: "Detect test file patterns from the project's test config (jest.config.*, vitest.config.*, or `src/**/*.test.{ts,tsx,js,jsx}` as fallback)."
- **Line ~97:** The timestamp write `~/.claude/last-test-audit.timestamp` is correct for user-level state. Keep as-is.
- Replace any `~/.claude/agents/workers/` references with `agents/workers/` (plugin-relative).
- Replace any `~/.claude/agents/references/` references with `agents/references/` (plugin-relative).

**Step 3:** Generalize `agents/workers/test-audit-coverage-gap.md`:
- **Line ~52:** Remove the project-specific tech stack description ("Next.js 14 App Router project using: Supabase, Vercel AI SDK..."). Replace with: "Read the project's `CLAUDE.md` or `package.json` to understand the tech stack before analyzing coverage."
- Replace any `~/.claude/agents/references/` references with `agents/references/`.

**Step 4:** Check the other 3 worker files and 2 reference files for hardcoded paths. Replace any `~/.claude/` references with plugin-relative paths.

**Step 5:** Verify with Grep that no `~/.claude/` or `/Users/ericpage/` paths remain in any of the 7 files.

**Step 6:** Commit:
```bash
git add agents/test-auditor.md agents/workers/ agents/references/
git commit -m "feat: port test-auditor system (orchestrator + 4 workers + 2 refs)"
```

---

### Task 9: Port Kanban-Triage Agent

**Files:**
- Create: `agents/kanban-triage.md`

**Step 1:** Copy from local:
```bash
cp ~/.claude/agents/kanban-triage.md agents/
```

**Step 2:** Read the copied file. Generalize any project-specific references:
- References to `src/lib/api/responses.ts` or similar va-web-app utilities should become generic: "Read the project's utility modules to understand available error handling patterns."
- The `docs/kanban/` folder structure references are already correct for our folder-based format.
- Replace any `~/.claude/` references with plugin-relative paths.

**Step 3:** Verify no hardcoded project paths remain.

**Step 4:** Commit:
```bash
git add agents/kanban-triage.md
git commit -m "feat: port kanban-triage agent to plugin"
```

---

### Task 10: Restore Step 1d and Step 6 in Finishing-a-Development-Branch

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md`

**Step 1:** Read the current plugin version of `skills/finishing-a-development-branch/SKILL.md`.

**Step 2:** Read the local version at `~/.claude/skills/finishing-a-development-branch/SKILL.md`. Extract:
- **Step 1d: Code Simplification Scan** (lines ~187-236 in local version)
- **Step 6: Archive Plan Documents** (lines ~537-565 in local version)

**Step 3:** Insert Step 1d after Step 1c (Architecture Doc Update) in the plugin version. Adapt the content:
- The code-simplifier agent dispatch stays the same (it's now at `agents/code-simplifier.md` in the plugin).
- The kanban filing format uses the folder-based system (already converted in Task 5, but verify the Step 1d content uses `docs/kanban/todo/KB-NNN-slug.md` format, not `docs/Kanban-board.md`).
- Reference `docs/kanban/.counter` for KB numbering.

**Step 4:** Insert Step 6 after Step 5 (Cleanup Worktree) in the plugin version. The content is project-agnostic — it moves completed plan docs from `docs/plans/` to `docs/plans/completed/`. Copy verbatim from local, adjusting only if any `~/.claude/` references exist.

**Step 5:** Update the Quick Reference table (if present) and Options table at the top of the skill to include Step 1d and Step 6.

**Step 6:** Verify the skill reads correctly end-to-end. Steps should flow: 0, 1, 1a, 1b, 1c, 1d, 2, 3, 4, 5, 6.

**Step 7:** Commit:
```bash
git add skills/finishing-a-development-branch/SKILL.md
git commit -m "feat: restore Step 1d (code simplification) and Step 6 (plan archival)"
```

---

### Task 11: Port Kanban-Resolve Skill

**Files:**
- Create: `skills/kanban-resolve/SKILL.md`

**Step 1:** Copy from local:
```bash
mkdir -p skills/kanban-resolve
cp ~/.claude/skills/kanban-resolve/SKILL.md skills/kanban-resolve/
```

**Step 2:** Read the copied file. Generalize:
- Replace any `/executing-plans` references with `/aligned:executing-plans`
- Replace any `/finishing-a-development-branch` references with `/aligned:finishing-a-development-branch`
- Replace any `/writing-plans` references with `/aligned:writing-plans`
- Replace any `~/.claude/` references with plugin-relative paths
- The `docs/kanban/` folder structure references are already correct.

**Step 3:** Verify the skill references `kanban-triage` agent correctly (dispatched via Task tool with `subagent_type`).

**Step 4:** Commit:
```bash
git add skills/kanban-resolve/
git commit -m "feat: port kanban-resolve skill to plugin"
```

---

### Task 12: Port Create-New-Skill (+ Supporting Files)

**Files:**
- Create: `skills/create-new-skill/SKILL.md`
- Create: `skills/create-new-skill/testing-skills-with-subagents.md`
- Create: `skills/create-new-skill/anthropic-best-practices.md`
- Create: `skills/create-new-skill/persuasion-principles.md`
- Create: `skills/create-new-skill/examples/CLAUDE_MD_TESTING.md`

**Step 1:** Copy all files:
```bash
mkdir -p skills/create-new-skill/examples
cp ~/.claude/skills/create-new-skill/SKILL.md skills/create-new-skill/
cp ~/.claude/skills/create-new-skill/testing-skills-with-subagents.md skills/create-new-skill/
cp ~/.claude/skills/create-new-skill/anthropic-best-practices.md skills/create-new-skill/
cp ~/.claude/skills/create-new-skill/persuasion-principles.md skills/create-new-skill/
cp ~/.claude/skills/create-new-skill/examples/CLAUDE_MD_TESTING.md skills/create-new-skill/examples/
```

**Step 2:** Read the copied SKILL.md. The research confirmed no hardcoded paths — all references use `@skill-name` syntax or relative paths. Verify with Grep for `~/.claude/` and `/Users/`.

**Step 3:** If the skill references `~/.claude/skills/` as the target location for new skills, update to reference the plugin's `skills/` directory. Also check if skill invocation names need the `aligned:` prefix (e.g., references to `/test-driven-development` should become `/aligned:test-driven-development`).

**Step 4:** Commit:
```bash
git add skills/create-new-skill/
git commit -m "feat: port create-new-skill with all supporting files"
```

---

### Task 13: Create Advisors Directory and Copy All Advisor Files

**Files:**
- Create: `advisors/` directory structure with all 61 advisor .md files

The plugin ships all advisor prompts so colleagues have instant access without needing the va-web-app or epch-projects repos.

**Step 1:** Create the directory structure:
```bash
mkdir -p advisors/va-web-app advisors/epch-projects advisors/.claude
```

**Step 2:** Copy all advisor files from their source locations (via the symlinks):
```bash
# va-web-app advisors (42 files)
cp ~/.claude/advisors/prompts/va-web-app/*.md advisors/va-web-app/

# epch-projects advisors (14 files)
cp ~/.claude/advisors/prompts/epch-projects/*.md advisors/epch-projects/

# .claude technical advisors (6 files)
cp ~/.claude/advisors/prompts/.claude/*.md advisors/.claude/
```

**Step 3:** Create the `.repos` manifest:
Write `advisors/.repos` with contents:
```
va-web-app
epch-projects
.claude
```

**Step 4:** Handle duplicates. Three advisors exist in both va-web-app and epch-projects: `april-dunford.md`, `richard-rumelt.md`, `shirin-oreizy.md`. The epch-projects versions may be newer/more specialized for that context. Keep both — the use-advisor skill shows repo grouping so the user can pick the right one.

**Step 5:** Verify total count. Run: `find advisors -name "*.md" | wc -l` — should be 62 (61 advisors + 0 non-md files... actually 62 .md files since 3 are duplicated across repos).

**Step 6:** Commit:
```bash
git add advisors/
git commit -m "feat: ship all 62 advisor prompts with plugin (42 va-web-app, 14 epch-projects, 6 .claude)"
```

---

### Task 14: Port Use-Advisor Skill (Update for Plugin Paths)

**Files:**
- Create: `skills/use-advisor/SKILL.md`

**Step 1:** Copy from local:
```bash
mkdir -p skills/use-advisor
cp ~/.claude/skills/use-advisor/SKILL.md skills/use-advisor/
```

**Step 2:** Read the copied file. The critical change is the discovery mechanism. The local version discovers advisors via symlinks at `~/.claude/advisors/prompts/`. The plugin version must discover advisors from the plugin's own `advisors/` directory.

**Step 3:** Modify the discovery logic in Step 1:

Replace the "Step 1a: Read the repo manifest" section. The new logic:
1. **Determine the plugin root.** The skill's base directory is provided in the system context (e.g., "Base directory for this skill: /path/to/skills/use-advisor"). Navigate up 2 directory levels to get the plugin root.
2. **Read the repo manifest** at `{plugin-root}/advisors/.repos`. Each line is a repo name.
3. **Glob each repo:** For each repo name, glob `{plugin-root}/advisors/{repo-name}/**/*.md`.

Replace the "Step 1b: Glob each repo" section with the updated glob pattern using the plugin root.

**Step 4:** Update the broken-symlink error message — the plugin ships files directly, not symlinks. Change error handling to: "If a repo from the manifest returns zero results, report: 'No advisor files found in advisors/{repo-name}/. The directory may be empty.'"

**Step 5:** Keep the fallback to `~/.claude/advisors/prompts/` as a secondary discovery location (for users who also have local advisors). Add after the plugin discovery: "Additionally, if `~/.claude/advisors/prompts/.repos` exists, also discover advisors from there and merge with plugin advisors. This allows users to add their own advisors beyond what the plugin ships."

**Step 6:** Update any references to `/add-advisor` skill to use `/aligned:add-advisor` prefix... but wait, add-advisor is NOT being ported (it's va-web-app-specific). Remove the reference to `/add-advisor` for setup. Instead say: "To add custom advisors, create .md files in `~/.claude/advisors/prompts/{repo-name}/` following the 'You are [Name], ...' format."

**Step 7:** Commit:
```bash
git add skills/use-advisor/
git commit -m "feat: port use-advisor skill with plugin-relative discovery"
```

---

### Task 15: Port Use-Framework Skill (Update for Plugin Paths)

**Files:**
- Create: `skills/use-framework/SKILL.md`

**Step 1:** Copy from local:
```bash
mkdir -p skills/use-framework
cp ~/.claude/skills/use-framework/SKILL.md skills/use-framework/
```

**Step 2:** Read the copied file. Apply the same plugin-relative discovery changes as Task 14:
- Determine plugin root from skill base directory
- Read manifest from `{plugin-root}/frameworks/.repos` (or wherever frameworks are stored)
- Glob `{plugin-root}/frameworks/{repo-name}/**/prompt.md`
- Add fallback to `~/.claude/frameworks/prompts/` for user-added frameworks

**Step 3:** Note: If no framework files currently exist to ship with the plugin, create an empty `frameworks/` directory with a `.repos` file as placeholder. The skill will still work via the `~/.claude/frameworks/prompts/` fallback.

**Step 4:** Check if any framework prompt files should ship with the plugin. Look for frameworks in `~/.claude/frameworks/prompts/` or in the registered repos. If frameworks exist, copy them to the plugin's `frameworks/` directory following the same repo-grouped structure as advisors.

**Step 5:** Commit:
```bash
git add skills/use-framework/ frameworks/
git commit -m "feat: port use-framework skill with plugin-relative discovery"
```

---

### Task 16: Upgrade Brainstorming to Multi-Critic Architecture

**Files:**
- Modify: `skills/brainstorming/SKILL.md`
- Modify: `skills/brainstorming/critic-registry.md` (create if needed)

The plugin's brainstorming currently uses a single generic reviewer at sonnet quality. The local version uses 1-4 domain-selected critics at opus quality. Upgrade the plugin to match.

**Step 1:** Read the current plugin `skills/brainstorming/SKILL.md` (85 lines).

**Step 2:** Read the local `~/.claude/skills/brainstorming/SKILL.md` to understand the multi-critic architecture. Key elements:
- Critic selection based on design domain (matches advisors to the domain of the design)
- 1-4 critics launched in parallel via Task tool at `model=opus`
- Diversity-of-lens selection (don't pick 3 marketing experts for a marketing design)
- Aggregation with de-duplication, persona tags, source attribution
- Round 2 escalation if Round 1 reveals uncovered domain

**Step 3:** Replace the single-critic section in the plugin's brainstorming with the multi-critic architecture from local. Adapt:
- The critic selection should reference the plugin's `advisors/` directory (from Task 13). Instead of `~/.claude/advisors/registry.md`, the skill selects critics by reading advisors from the plugin's advisors directory.
- The selection logic: Read the design document → identify domains involved → glob `advisors/**/*.md` → read first lines to get advisor names and specialties → select 1-4 advisors whose domains match the design → ensure diversity of perspective.
- Use `model=opus` for critics (not sonnet).
- Keep the Steve Jobs persona review from the current plugin version (it's an improvement).
- Keep the lessons-learned check from the current plugin version (it's an improvement).

**Step 4:** If the local version has a `critic-registry.md` file, check its content. The research indicates it just redirects to `~/.claude/advisors/registry.md`. For the plugin, create a new `skills/brainstorming/critic-registry.md` that documents the critic selection algorithm inline (since we ship the advisors directly).

**Step 5:** Commit:
```bash
git add skills/brainstorming/
git commit -m "feat: upgrade brainstorming to multi-critic architecture (opus, domain-selected)"
```

---

### Task 17: Upgrade Writing-Plans to Dual-Critic Architecture

**Files:**
- Modify: `skills/writing-plans/SKILL.md`

The plugin's writing-plans currently uses a single generic reviewer. The local version uses two parallel critics: The Architect (codebase alignment) and The Verifier (accuracy & design fidelity). Upgrade the plugin to match.

**Step 1:** Read the current plugin `skills/writing-plans/SKILL.md` (382 lines).

**Step 2:** Read the local `~/.claude/skills/writing-plans/SKILL.md`. The dual-critic architecture is the "Fact-Check + Critique Panel" section. The key elements:
- **The Architect** — evaluates plan against codebase patterns, module boundaries, hidden dependencies. Reads key source files. Does NOT do exhaustive fact-checking (Verifier handles that). Uses `model=sonnet` for Round 1, `model=haiku` for Round 2.
- **The Verifier** — verifies every factual claim (file paths, line numbers, code snippets). Cross-checks against source design document. Produces design fidelity coverage table. Uses `model=sonnet` for Round 1, `model=haiku` for Round 2.
- Both launched in parallel via Task tool.
- Round 2 is conditional and scoped to changes only.

**Step 3:** Replace the single-critic section in the plugin's writing-plans with the dual-critic architecture from local. The content is defined inline (The Architect and The Verifier personas are embedded in the sub-agent prompts, not in separate agent files). Copy the entire critic panel section from local.

**Step 4:** Generalize any local-specific references in the critic prompts:
- Replace `~/.claude/skills/writing-plans/plan-critique-checklist.md` with `skills/writing-plans/plan-critique-checklist.md` (plugin-relative)
- Replace `~/.claude/agents/references/eval-scenario-reference.md` with a generic reference: "the project's eval conventions (see `e2e/` directory if it exists)"
- Replace the kanban entry format section if present (should already be done in Task 5)

**Step 5:** Also update the writing-plans kanban entry format section to use folder-based KB format (should already be done in Task 5, but verify the critic instructions reference the correct format).

**Step 6:** Commit:
```bash
git add skills/writing-plans/SKILL.md
git commit -m "feat: upgrade writing-plans to dual-critic (Architect + Verifier, parallel)"
```

---

### Task 18: Remove Ghost References and Fix Content Issues

**Files:**
- Modify: `skills/using-git-worktrees/SKILL.md`
- Modify: `skills/brainstorming/SKILL.md`
- Modify: `skills/mockup-generator/SKILL.md`

**Step 1:** Read `skills/using-git-worktrees/SKILL.md`. Find and remove the `subagent-driven-development` ghost reference (around line 288). This skill doesn't exist anywhere.

**Step 2:** Read `skills/brainstorming/SKILL.md`. Find and remove or qualify the `elements-of-style:writing-clearly-and-concisely` reference (around line 45). This is an external plugin that doesn't ship with aligned. Remove the reference entirely or change to: "If a writing-style plugin is available, use it for copy review."

**Step 3:** Read `skills/mockup-generator/SKILL.md`. Find any hardcoded viewport defaults (e.g., "mobile-first" or "375px"). Replace with: "Read `docs/design/design-principles.md` for viewport guidance, breakpoints, and layout tokens. If design-principles.md does not exist, prompt the user for viewport preference before generating mockups." Remove any assumption about mobile vs desktop default.

**Step 4:** Commit:
```bash
git add skills/using-git-worktrees/SKILL.md skills/brainstorming/SKILL.md skills/mockup-generator/SKILL.md
git commit -m "fix: remove ghost references, generalize mockup-generator viewport defaults"
```

---

### Task 19: Fix Eval-Audit Hook Threshold Logic

**Files:**
- Modify: `hooks/hooks.json` (may need update)
- Modify: `skills/eval-audit/SKILL.md`

The eval-audit hook reads `e2e/.eval-audit-last-run` but nothing tells Claude to compare the timestamp and invoke the skill. Two approaches to fix this:

**Approach A (recommended):** Update the hook command to include threshold comparison and output a `[EVAL AUDIT]` tag when stale, similar to how `check-test-audit.sh` works:

**Step 1:** Create a new hook script `hooks/check-eval-audit.sh` that:
1. Checks if `e2e/.eval-audit-last-run` exists
2. Compares the timestamp to current time
3. If >1 day old (or missing), outputs `[EVAL AUDIT] Last eval audit was N day(s) ago...`
4. If recent, outputs nothing

Model this after `hooks/check-test-audit.sh` which does the same for test audits.

**Step 2:** Update `hooks/hooks.json` to use the new script instead of the bare `cat` command for the eval-audit UserPromptSubmit hook.

**Step 3:** Add instructions to `CLAUDE.md` (under Hook-Triggered Audits) for handling the `[EVAL AUDIT]` tag: "When you see `[EVAL AUDIT]`, suggest running `/aligned:eval-audit` to the user."

**Step 4:** Commit:
```bash
git add hooks/check-eval-audit.sh hooks/hooks.json CLAUDE.md
git commit -m "fix: eval-audit hook now compares threshold and triggers audit tag"
```

---

### Task 20: Update README with Permission Model and Complete Inventory

**Files:**
- Modify: `README.md`

**Step 1:** Read the current `README.md`.

**Step 2:** Add a "Permissions" section documenting what a colleague needs in their `~/.claude/settings.json` to use aligned skills without permission prompts. At minimum:
```json
{
  "permissions": {
    "allow": [
      "Skill(aligned:brainstorming)",
      "Skill(aligned:writing-plans)",
      "Skill(aligned:executing-plans)",
      "Skill(aligned:finishing-a-development-branch)",
      "Skill(aligned:autopilot)",
      "Skill(aligned:systematic-debugging)",
      "Skill(aligned:using-git-worktrees)",
      "Skill(aligned:eval-failure-triage)",
      "Skill(aligned:eval-audit)",
      "Skill(aligned:kickstart)",
      "Skill(aligned:design-principles)",
      "Skill(aligned:mockup-generator)",
      "Skill(aligned:test-driven-development)",
      "Skill(aligned:verification-before-completion)",
      "Skill(aligned:use-advisor)",
      "Skill(aligned:use-framework)",
      "Skill(aligned:kanban-resolve)",
      "Skill(aligned:create-new-skill)"
    ]
  }
}
```

Note: The `/aligned:kickstart` skill auto-creates `.claude/settings.json` with `enabledPlugins: { "aligned": true }` in new projects, but skill-level permissions must be added to the user's `~/.claude/settings.json`.

**Step 3:** Update the Skill Reference table to include all skills (add kanban-resolve, create-new-skill, use-advisor, use-framework to the existing 14).

**Step 4:** Add an "Agents" section documenting the shipped agents: steve-jobs, code-reviewer, code-simplifier, test-auditor (+ workers), kanban-triage.

**Step 5:** Add a "Hooks" section documenting the 5 hooks and their event types.

**Step 6:** Add an "Advisors" section noting that 62 advisor prompts ship with the plugin across 3 categories (va-web-app, epch-projects, .claude).

**Step 7:** Commit:
```bash
git add README.md
git commit -m "docs: update README with permissions, complete skill/agent/hook/advisor inventory"
```

---

### Task 21: Update plugin.json Version

**Files:**
- Modify: `.claude-plugin/plugin.json`

**Step 1:** Read the current plugin.json. Update the version from `0.1.0` to `0.2.0` (this is a significant feature release with new skills, agents, hooks, and advisors).

**Step 2:** Update the description to reflect the expanded scope: "Opinionated dev stack: TDD pipeline, eval-driven development, design system, multi-agent debugging, 62 advisor personas, automated quality gates"

**Step 3:** Commit:
```bash
git add .claude-plugin/plugin.json
git commit -m "chore: bump version to 0.2.0 for plugin parity release"
```

---

### Task 22: Final Verification

**Step 1:** Run Grep across the entire plugin repo for leaked paths:
- Search for `/Users/ericpage/` — should return 0 results
- Search for `~/.claude/skills/` — should return 0 results (references should use `skills/`)
- Search for `~/.claude/agents/` — should return 0 results (references should use `agents/`)
- Search for `~/.claude/hooks/` — should return 0 results (references should use `hooks/`)
- Search for `docs/Kanban-board.md` — should return 0 results (converted to folder-based)
- Search for `BUG-NNN` or `BUG-0` — should return 0 results (converted to KB-NNN)

**Allowed `~/.claude/` references:**
- `~/.claude/last-test-audit.timestamp` (hook state file — user-level, correct)
- `~/.claude/last-settings-audit.*` (hook state file — user-level, correct)
- `~/.claude/error-tracking/` (hook log directory — user-level, correct)
- `~/.claude/usage-tracking/` (hook log directory — user-level, correct)
- `~/.claude/cron-results/` (hook results — user-level, correct)
- `~/.claude/advisors/prompts/` (fallback discovery in use-advisor — intentional)
- `~/.claude/frameworks/prompts/` (fallback discovery in use-framework — intentional)
- `~/.claude/settings.json` (user configuration — correct reference)

**Step 2:** Verify complete file inventory. The plugin should contain:
- 18 skills (14 original + kanban-resolve, create-new-skill, use-advisor, use-framework)
- 9+ agents (steve-jobs, code-reviewer, code-simplifier, test-auditor, kanban-triage, + 4 workers)
- 9+ reference files (2 test-audit refs, eval-failure-triage refs, deployment-pitfall-catalog, etc.)
- 6 hook scripts + hooks.json
- 62 advisor .md files
- Framework infrastructure (even if empty)
- CLAUDE.md with behavioral guardrails
- README.md with complete documentation

**Step 3:** If any verification fails, fix the issue before proceeding.

**Step 4:** Commit any remaining fixes:
```bash
git add -A
git commit -m "fix: final verification cleanup"
```

---

## Manual Steps (Post-Automation)

> Complete these steps after all tasks are done.

- [ ] **Test plugin installation:** In a fresh project directory, run `claude --plugin-dir ~/software/aligned_cc_skills` and verify:
  - Skills show up with `aligned:` prefix
  - `/aligned:use-advisor` lists all 62 advisors
  - Hooks fire correctly (SessionStart, UserPromptSubmit, PreToolUse in worktrees)
  - `agents/steve-jobs.md` resolves when brainstorming invokes design critique

- [ ] **Test hook path resolution:** Plugin hooks may use relative paths. If `hooks/check-cron-results.sh` doesn't resolve, convert hook commands in `hooks/hooks.json` to use an absolute path discovery mechanism (e.g., `"command": "$(dirname $0)/../hooks/check-cron-results.sh"` or a wrapper script).

- [ ] **Delete local `.claude/` duplicates** (only after plugin is verified working):
  ```bash
  # Remove local skills (now in plugin)
  rm -rf ~/.claude/skills/brainstorming ~/.claude/skills/writing-plans ~/.claude/skills/executing-plans
  rm -rf ~/.claude/skills/finishing-a-development-branch ~/.claude/skills/systematic-debugging
  rm -rf ~/.claude/skills/autopilot ~/.claude/skills/kickstart ~/.claude/skills/use-advisor
  rm -rf ~/.claude/skills/use-framework ~/.claude/skills/kanban-resolve ~/.claude/skills/create-new-skill
  # ... (remove all skills that are now in the plugin)

  # Remove local agents (now in plugin)
  rm -f ~/.claude/agents/code-reviewer.md ~/.claude/agents/code-simplifier.md
  rm -f ~/.claude/agents/test-auditor.md ~/.claude/agents/kanban-triage.md
  rm -rf ~/.claude/agents/workers/ ~/.claude/agents/references/

  # Remove local hooks (now in plugin)
  rm -f ~/.claude/hooks/auto-approve-worktrees.js ~/.claude/hooks/check-cron-results.sh
  rm -f ~/.claude/hooks/check-test-audit.sh ~/.claude/hooks/error-tracker.js
  rm -f ~/.claude/hooks/usage-tracker.js
  ```

- [ ] **Update `~/.claude/settings.json`:** Remove the hook configurations that reference local hook paths (they're now handled by the plugin's hooks.json). Keep permissions, enabledPlugins, and other non-hook settings.

- [ ] **Push plugin to GitHub:**
  ```bash
  cd ~/software/aligned_cc_skills
  git push origin main
  ```

- [ ] **Verify colleague experience:** Have a colleague run `/plugin install github:bigchewy/aligned_cc_skills` and confirm all skills, advisors, and hooks work.

---

## Decision Log

### Summary

| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Advisor shipping model | Ship all 62 in plugin `advisors/` dir | Symlink-only discovery, flat directory |
| 2 | Kanban format | Folder-based with individual KB files | Single-file Kanban-board.md |
| 3 | Critic architecture for brainstorming | Multi-critic from advisor pool (opus) | Single generic reviewer (sonnet) |
| 4 | Critic architecture for writing-plans | Dual-critic (Architect + Verifier) | Single merged reviewer |
| 5 | Sync script disposition | Delete entirely | Keep for reverse-sync |
| 6 | Hook state file locations | Keep at `~/.claude/` (user-level) | Move to plugin-relative |
| 7 | Duplicate advisors (3 cross-repo) | Keep both versions, display repo grouping | Deduplicate to single version |
| 8 | Lessons-learned references | Keep conditional references (no-op if absent) | Remove all references |
| 9 | Plugin version bump | 0.1.0 → 0.2.0 | 0.1.0 → 1.0.0 |

### Appendix: Decision Details

#### Decision 1: Advisor shipping model
**Chose:** Ship all 62 advisor prompts directly in the plugin's `advisors/` directory, organized by source repo.
**Why:** The primary goal is colleague parity. Colleagues won't have va-web-app or epch-projects repos, so symlink-based discovery alone would give them 0 advisors. Shipping all files (~468 KB) is trivially small and provides instant access. The repo-grouped organization preserves provenance and makes updates traceable.
**Alternatives rejected:**
- Symlink-only: Requires per-developer setup with `/add-advisor` — defeats the "install once, works everywhere" goal.
- Flat directory: Loses repo provenance, makes deduplication ambiguous, harder to trace which project an advisor originated from.

#### Decision 2: Kanban format
**Chose:** Folder-based system with individual `KB-NNN-slug.md` files in `docs/kanban/{status}/` directories.
**Why:** User explicitly requested this (matches local setup). Individual files are easier to manage with git (atomic commits, clear diffs), support the kanban-triage agent workflow (move files between directories), and avoid merge conflicts that single-file formats create when multiple agents file bugs simultaneously.
**Alternatives rejected:**
- Single-file `Kanban-board.md`: Simpler to read but creates merge conflicts, doesn't support the triage workflow, and loses the ability to move items between states via filesystem operations.

#### Decision 3: Critic architecture for brainstorming
**Chose:** Multi-critic from advisor pool at opus quality, domain-selected.
**Why:** The single-reviewer approach was a simplification that significantly degraded design quality. Multi-critic provides diverse perspectives (e.g., a marketing advisor + a UX advisor for a landing page design, a security reviewer + an architect for an API design). Opus quality catches nuanced architectural issues that sonnet misses. The advisor pool is now shipped with the plugin, making domain selection feasible.
**Alternatives rejected:**
- Single generic reviewer at sonnet: Cheaper but lower quality. Colleagues wouldn't know they're getting degraded critique.

#### Decision 5: Sync script disposition
**Chose:** Delete `scripts/sync-from-local.sh` and `scripts/transforms.txt` entirely.
**Why:** The user has decided the plugin is the canonical source. All future edits happen in the plugin repo. The sync script's transforms were incomplete (missed agent paths, ralph loops, kanban format) and re-running it would break the plugin. There is no future use case for it.
**Alternatives rejected:**
- Keep for reverse-sync (plugin → local): No need since local versions are being deleted.

#### Decision 6: Hook state file locations
**Chose:** Keep hook state files at `~/.claude/` (e.g., `~/.claude/last-test-audit.timestamp`, `~/.claude/error-tracking/errors.jsonl`).
**Why:** These are user-level state files, not project-level. They track cross-project state (when was the last audit? what errors have accumulated?). The `~/.claude/` directory is the standard location for Claude Code user state. Plugin hooks that write to `~/.claude/` are well-behaved — they're using the user's state directory, not polluting the project.
**Alternatives rejected:**
- Plugin-relative state: Would lose state when the plugin is updated. Also, plugin directories may be read-only after installation.

#### Decision 8: Lessons-learned references
**Chose:** Keep the conditional references in 6 skills. They check `if docs/lessons-learned/ exists` before reading — this is a no-op if the directory doesn't exist.
**Why:** The references are harmless when unused and valuable when someone does use the system. Removing them from 6 skills is churn that provides no benefit. If the user later decides to use lessons-learned, the infrastructure is already in place.
**Alternatives rejected:**
- Remove all references: Creates churn across 6 skills for zero benefit. Would need to be re-added if lessons-learned is ever wanted.
