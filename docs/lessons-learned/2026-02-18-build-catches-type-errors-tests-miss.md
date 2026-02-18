# Build catches TypeScript errors that tests miss

**Date:** 2026-02-18
**Context:** Finishing eval-infrastructure branch

## What happened

Tests passed (627/627) but `npm run build` failed with two TypeScript errors in `e2e/eval-runner.ts`:

1. **`parseArgs` type narrowing:** `node:util`'s `parseArgs` types string options as `string | true | undefined`. After a truthy check, TS narrows to `string | true`, not `string`. Fix: cast `as string` since string options never actually return `true`.

2. **Anthropic SDK `TextBlock` type predicate:** A hand-written type predicate `b is { type: 'text'; text: string }` was not assignable to the SDK's `ContentBlock` because `TextBlock` now requires a `citations` field. Fix: drop the type predicate and use inline narrowing.

## Root cause

Vitest transpiles TypeScript with esbuild/SWC, which strips types without checking them. The Next.js build runs `tsc` as part of compilation, which enforces full type checking.

## Lesson

Always run the production build (`npm run build`) as a verification step, not just tests. The finishing-a-development-branch skill already requires this (Step 1a), which is what caught these issues before they hit production.
