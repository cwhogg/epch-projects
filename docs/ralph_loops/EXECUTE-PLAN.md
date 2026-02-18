# Execute Next Plan Task

You are executing an implementation plan one task at a time.
Each invocation handles ONE task, then exits. The loop handles repetition.

## Setup
1. Read the plan file specified below
2. Find the first task NOT marked with ✅
3. If a task is marked 🔄, resume it (previous iteration may have failed mid-task)

## If all tasks are marked ✅
Write a sentinel file to signal the loop to stop:
```bash
touch .ralph-done
```
Say "All tasks complete! Run `/finishing-a-development-branch` to wrap up." and exit.

## Execute the task
1. Change to the worktree directory specified below
2. Read the task spec carefully — it contains full test code and implementation code
3. Follow TDD: write failing test first, then implement, then verify
4. Run the specific test file to confirm it passes
5. If the task involves LLM behavior surface files (prompts, prompt builders),
   run `npm run eval` and verify it passes
6. Mark the task with ✅ in the plan file (replace the task heading)
7. Commit: `git add [changed files] && git commit -m "task N: [description]"`
8. Exit

## Rules
- ONE task per invocation. Do not continue to the next task.
- Read skill files as needed (~/.claude/skills/) for patterns and conventions
- Use sub-agents for heavy codebase research to keep context lean
- If a task fails or is blocked:
  - Mark it 🔄 in the plan file
  - Add a note below the task heading: `> BLOCKED: [description of issue]`
  - Commit the plan file update
  - Exit (the next iteration will see the blocker note and attempt to resolve)
- Do NOT run /finishing-a-development-branch — the user runs that manually
- Do NOT modify tasks you are not currently executing
