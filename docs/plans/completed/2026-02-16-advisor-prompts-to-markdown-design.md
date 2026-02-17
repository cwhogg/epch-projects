# Convert Advisor Prompts from TypeScript to Markdown

**Date:** 2026-02-16
**Status:** Design

## Problem

EPCH advisor prompts are `.ts` files that export template literal strings. Every other repo (va-web-app, .claude) uses `.md` files. This causes two problems:

1. **Cross-project discovery broken** — `/use-advisor` globs for `**/*.md` and finds nothing in the EPCH symlink
2. **Format drift** — Adding advisors to EPCH requires a different process than other repos (TS module + barrel export + manual prompt-loader mapping vs. just dropping a `.md` file)

## Solution

Convert all 13 advisor prompt files from `.ts` to `.md` and update the prompt-loader to read `.md` files from disk using `readFileSync`, mirroring the existing `framework-loader.ts` pattern.

## Changes

### 1. Convert 13 prompt files: `.ts` → `.md`

Strip the `export const prompt = \`` prefix and `` \`;`` suffix from each file. The markdown content inside the template literal becomes the `.md` file content verbatim.

Files to convert:
- `richard-rumelt.ts` → `richard-rumelt.md`
- `april-dunford.ts` → `april-dunford.md`
- `copywriter.ts` → `copywriter.md`
- `seo-expert.ts` → `seo-expert.md`
- `shirin-oreizy.ts` → `shirin-oreizy.md`
- `joe-pulizzi.ts` → `joe-pulizzi.md`
- `robb-wolf.ts` → `robb-wolf.md`
- `robbie-kellman-baxter.ts` → `robbie-kellman-baxter.md`
- `rob-walling.ts` → `rob-walling.md`
- `patrick-campbell.ts` → `patrick-campbell.md`
- `oli-gardner.ts` → `oli-gardner.md`
- `julian-shapiro.ts` → `julian-shapiro.md`
- `joanna-wiebe.ts` → `joanna-wiebe.md`

### 2. Rewrite `prompt-loader.ts`

Replace static TS imports with `readFileSync`, following the `framework-loader.ts` pattern:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

const promptCache = new Map<string, string>();
const PROMPTS_PATH = join(process.cwd(), 'src/lib/advisors/prompts');

export function getAdvisorSystemPrompt(advisorId: string): string {
  if (promptCache.has(advisorId)) {
    return promptCache.get(advisorId)!;
  }

  const filePath = join(PROMPTS_PATH, `${advisorId}.md`);
  try {
    const content = readFileSync(filePath, 'utf-8');
    promptCache.set(advisorId, content);
    return content;
  } catch {
    throw new Error(`Unknown advisor: ${advisorId}`);
  }
}

export function clearAdvisorCache(): void {
  promptCache.clear();
}
```

Key changes:
- No more `import * as prompts` or manual `promptMap`
- Adding a new advisor = drop a `.md` file + add registry entry. No loader changes needed.
- Cache mirrors `framework-loader.ts` behavior
- New: `clearAdvisorCache()` export for test isolation (mirrors `clearFrameworkCache()`)
- Error message preserved for backward compatibility with existing test

### 3. Delete `prompts/index.ts`

The barrel export file is no longer needed. All consumers go through `prompt-loader.ts` → `getAdvisorSystemPrompt()`.

Consumers to verify (no changes needed — they already use `getAdvisorSystemPrompt`):
- `src/lib/agent-tools/critique.ts` — imports `getAdvisorSystemPrompt` from prompt-loader ✓
- `src/lib/agent-tools/foundation.ts` — imports `getAdvisorSystemPrompt` from prompt-loader ✓

### 4. Update tests

`src/lib/__tests__/advisor-prompt-loader.test.ts` — assertions stay the same:
- Loads specific advisors by ID and checks content
- Throws for unknown advisor
- All registry entries have loadable prompts
- Registry entries have required fields

No structural test changes needed. The `getAdvisorSystemPrompt` API is unchanged.

Add one new test: "clearAdvisorCache resets cached prompts" — call load, clear, load again. This covers the new `clearAdvisorCache` export.

### 5. No changes to `registry.ts`

The registry defines advisor metadata (id, name, role, evaluationExpertise). It doesn't reference file formats or paths. No changes needed.

## What this enables

- `/use-advisor` discovery works immediately — the symlink at `~/.claude/advisors/prompts/epch-projects` already points to `src/lib/advisors/prompts/`, and now it contains `.md` files
- Adding new advisors to EPCH follows the same process as every other repo
- The `first line = "You are [Name], ..."` convention is preserved in all `.md` files, matching va-web-app format

## Risks

- **Build regression** — Mitigated by running `npm run build` after changes
- **Test regression** — Mitigated by running existing test suite; API surface is unchanged
- **Template literal escaping** — Some `.ts` prompts may contain backtick escapes (`\``) that need to become raw backticks in `.md`. Check each file during conversion.
- **Vercel file tracing** — `readFileSync` with `process.cwd()` works in production because `framework-loader.ts` and `painted-door-templates.ts` already use this identical pattern and are deployed.
