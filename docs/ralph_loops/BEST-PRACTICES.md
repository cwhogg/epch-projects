# Ralph Wiggum: Best Practices

Ralph Wiggum is a technique for running Claude Code in a loop to accomplish repetitive tasks autonomously.

## The Core Technique

```bash
while :; do claude -p "$(cat PROMPT.md)" ; done
```

**Key elements:**
- `while :; do ... ; done` - Infinite bash loop
- `claude -p` - The `-p` (print) flag is **required** - it makes Claude exit after completing the task
- `$(cat PROMPT.md)` - Reads the prompt file and passes it as an argument

## Alternative Syntax

```bash
while :; do cat PROMPT.md | claude -p ; done
```

Both work. The first passes the prompt as an argument, the second pipes it as stdin.

## Writing Effective Prompts

### State Management

The prompt must handle its own state - knowing what's done and what's next. Common patterns:

**File-based state:**
```markdown
1. List files in `input/` folder
2. If no files remain, say "All done!" and exit
3. Process the first file
4. Move it to `completed/` folder
5. Exit (loop restarts for next file)
```

**Registry-based state:**
```markdown
1. Check the database/registry for items without a "processed" flag
2. Pick the first unprocessed item
3. Process it
4. Mark it as processed
5. Exit
```

### One Task Per Iteration

Each iteration should complete ONE unit of work, then exit. The loop handles repetition.

**Good:**
- Process one file
- Add one advisor
- Fix one issue

**Bad:**
- Process all files (defeats the purpose of the loop)
- Keep going until interrupted (won't recover from errors)

### Clear Exit Conditions

Always include a termination condition:

```markdown
If no files remain in `input/`, say "All tasks complete!" and exit.
```

Without this, the loop runs forever even when there's nothing to do.

## Stopping the Loop

- **Ctrl+C** - Standard interrupt (may need multiple presses)
- **Ctrl+Z** then `kill %1` - Suspend and kill if Ctrl+C doesn't work

## Error Recovery

If Claude errors mid-task, the loop restarts and tries again. Design your prompt so partial work is either:
- **Idempotent** - Running twice produces the same result
- **Resumable** - The prompt detects partial work and continues

## Example: Adding Advisors

See `RALPH-ADD-ADVISORS.md` in this folder for a working example that:
1. Checks for research files in `docs/advisors/new_advisors/`
2. Processes one advisor using `/add-advisor`
3. Moves the file to `completed/`
4. Exits (loop continues with next advisor)

## Debugging

If Claude isn't exiting:
- Make sure you're using `-p` flag
- Check that your prompt has clear exit instructions
- Verify the task is actually completing

If work isn't being saved:
- Ensure your prompt includes commit instructions
- Check that file moves/state updates happen after successful completion

## Source

Technique documented by Geoffrey Huntley: https://ghuntley.com/ralph/
