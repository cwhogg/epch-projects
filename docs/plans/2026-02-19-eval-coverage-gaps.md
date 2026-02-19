# Eval Coverage Gaps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Close the five highest-priority eval coverage gaps identified by the 2026-02-19 eval audit (KB-099, KB-100, KB-101).

**Source Design Doc:** `docs/kanban/todo/KB-099-eval-website-builder-autonomous-mode.md`, `docs/kanban/todo/KB-100-eval-config-missing-llm-surfaces.md`, `docs/kanban/todo/KB-101-eval-multi-turn-and-advisor-coverage.md`

**Architecture:** The eval system lives in `e2e/`. Scenarios are JSON files in `e2e/scenarios/`. The prompt adapter (`e2e/prompt-adapter.ts`) maps surface names to prompt construction logic. The eval runner loads scenarios, builds prompts via the adapter, calls the LLM, and evaluates responses against dimension heuristics and judge rubrics. Surface patterns in `e2e/eval-config.ts` determine which scenarios are triggered by file changes.

**Tech Stack:** TypeScript, Vitest (testing), Anthropic SDK (eval runner LLM calls)

---

## Prerequisites

> Complete these steps manually before starting Task 1.

- None.

---

### Task 1: Fix loadFixture path bug

The `loadFixture` function in `e2e/prompt-adapter.ts` resolves fixture paths to `e2e/<filename>`, but all fixture files live in `e2e/fixtures/`. This bug prevents any fixture-dependent scenario from running. No eval log exists (`e2e/eval-log.jsonl` is absent), confirming the runner has never successfully executed fixture-dependent scenarios.

**Files:**
- Modify: `e2e/prompt-adapter.ts:8` (the `loadFixture` function)
- Create: `e2e/__tests__/prompt-adapter.test.ts`

**Step 1: Write the failing test**

Create `e2e/__tests__/prompt-adapter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { loadFixture } from '../prompt-adapter';
import type { EvalScenario } from '../types';

function makeScenario(fixtures: Record<string, string>): EvalScenario {
  return {
    name: 'test', surface: 'test', tags: [], config: {},
    fixtures, conversation: [], dimensions: [],
  };
}

describe('loadFixture', () => {
  it('loads a JSON fixture from e2e/fixtures/', () => {
    const scenario = makeScenario({ idea: 'sample-idea.json' });
    const result = loadFixture(scenario, 'idea') as Record<string, unknown>;
    expect(result).toHaveProperty('name', 'SecondLook');
  });

  it('loads a text fixture from e2e/fixtures/', () => {
    const scenario = makeScenario({ seo: 'sample-seo-context-string.txt' });
    const result = loadFixture(scenario, 'seo');
    expect(typeof result).toBe('string');
  });

  it('throws for missing fixture key', () => {
    const scenario = makeScenario({});
    expect(() => loadFixture(scenario, 'missing')).toThrow(/not found/i);
  });

  it('throws for nonexistent fixture file', () => {
    const scenario = makeScenario({ bad: 'does-not-exist.json' });
    expect(() => loadFixture(scenario, 'bad')).toThrow();
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npm test -- e2e/__tests__/prompt-adapter.test.ts`

Expected: FAIL — `loadFixture` looks in `e2e/` instead of `e2e/fixtures/`, so `ENOENT` on `e2e/sample-idea.json`.

**Step 3: Fix loadFixture**

In `e2e/prompt-adapter.ts`, change line 8 from:

```typescript
  const full = join(process.cwd(), 'e2e', rel);
```

to:

```typescript
  const full = join(process.cwd(), 'e2e', 'fixtures', rel);
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- e2e/__tests__/prompt-adapter.test.ts`

Expected: 4 tests PASS.

**Step 5: Run full test suite to check blast radius**

Run: `npm test`

Expected: All tests PASS. This fix unblocks all existing fixture-dependent scenarios (5 of 7 existing scenarios use fixtures). Running the full suite here catches any pre-existing fixture issues before proceeding.

**Step 6: Commit**

```bash
git add e2e/prompt-adapter.ts e2e/__tests__/prompt-adapter.test.ts
git commit -m "fix: loadFixture reads from e2e/fixtures/ directory"
```

---

### Task 2: Register missing LLM surfaces in eval-config.ts

Add the 11 files identified by KB-100 to `llmSurfacePatterns` so the auto-trigger mechanism detects changes to these surfaces.

**Files:**
- Modify: `e2e/eval-config.ts:17-28`
- Modify: `e2e/eval-helpers/__tests__/trigger.test.ts` (add a test for new patterns)

**Step 1: Add patterns to eval-config.ts**

Replace the `llmSurfacePatterns` array in `e2e/eval-config.ts` (lines 17-28) with:

```typescript
  llmSurfacePatterns: [
    // Prompt templates (existing)
    { glob: 'src/lib/advisors/prompts/*.md', tags: ['advisor'] },
    { glob: 'src/lib/frameworks/prompts/*/prompt.md', tags: ['framework'] },
    { glob: 'src/lib/research-agent-prompts.ts', tags: ['research'] },
    { glob: 'src/lib/content-prompts.ts', tags: ['content'] },
    { glob: 'src/lib/painted-door-prompts.ts', tags: ['painted-door'] },
    { glob: 'src/lib/agent-tools/*.ts', tags: ['agent-tools'] },
    { glob: 'src/lib/expertise-profile.ts', tags: ['research'] },
    { glob: 'src/lib/seo-knowledge.ts', tags: ['research', 'seo'] },
    { glob: 'src/lib/critique-service.ts', tags: ['content'] },
    { glob: 'src/lib/frameworks/framework-loader.ts', tags: ['framework'] },
    // Chat routes with inline LLM calls (KB-100)
    { glob: 'src/app/api/painted-door/*/chat/route.ts', tags: ['website-chat', 'painted-door'] },
    { glob: 'src/app/api/foundation/*/chat/route.ts', tags: ['foundation'] },
    // Agent libraries with inline LLM calls (KB-100)
    { glob: 'src/lib/seo-analysis.ts', tags: ['research', 'seo'] },
    { glob: 'src/lib/content-agent-v2.ts', tags: ['content'] },
    { glob: 'src/lib/foundation-agent.ts', tags: ['foundation'] },
    { glob: 'src/lib/content-critique-agent.ts', tags: ['content'] },
    { glob: 'src/lib/analytics-agent.ts', tags: ['analytics'] },
    { glob: 'src/lib/validation-canvas.ts', tags: ['validation'] },
    { glob: 'src/lib/content-recipes.ts', tags: ['content'] },
    { glob: 'src/lib/painted-door-agent.ts', tags: ['painted-door'] },
  ] as SurfacePattern[],
```

Note: `src/lib/agent-tools/analytics.ts` is already covered by the existing `src/lib/agent-tools/*.ts` glob. The glob for chat routes uses `*` (single segment) because `minimatch` with default options treats `*` as matching any single path segment — and the route paths have the dynamic `[id]`/`[ideaId]` segment.

**Step 2: Add test cases and update test patterns constant**

In `e2e/eval-helpers/__tests__/trigger.test.ts`, first update the `patterns` constant (lines 13-18) to include the new entries:

```typescript
const patterns: SurfacePattern[] = [
  { glob: 'src/lib/advisors/prompts/*.md', tags: ['advisor'] },
  { glob: 'src/lib/frameworks/prompts/*/prompt.md', tags: ['framework'] },
  { glob: 'src/lib/research-agent-prompts.ts', tags: ['research'] },
  { glob: 'src/lib/content-prompts.ts', tags: ['content'] },
  { glob: 'src/app/api/painted-door/*/chat/route.ts', tags: ['website-chat', 'painted-door'] },
  { glob: 'src/app/api/foundation/*/chat/route.ts', tags: ['foundation'] },
  { glob: 'src/lib/seo-analysis.ts', tags: ['research', 'seo'] },
  { glob: 'src/lib/content-agent-v2.ts', tags: ['content'] },
  { glob: 'src/lib/foundation-agent.ts', tags: ['foundation'] },
  { glob: 'src/lib/content-critique-agent.ts', tags: ['content'] },
  { glob: 'src/lib/analytics-agent.ts', tags: ['analytics'] },
  { glob: 'src/lib/validation-canvas.ts', tags: ['validation'] },
  { glob: 'src/lib/content-recipes.ts', tags: ['content'] },
  { glob: 'src/lib/painted-door-agent.ts', tags: ['painted-door'] },
];
```

Then add these test cases to the `getTriggeredTags` describe block:

```typescript
  it('matches website builder chat route', () => {
    expect(getTriggeredTags(
      ['src/app/api/painted-door/abc/chat/route.ts'],
      patterns
    )).toContain('website-chat');
  });

  it('matches foundation chat route', () => {
    expect(getTriggeredTags(
      ['src/app/api/foundation/abc/chat/route.ts'],
      patterns
    )).toContain('foundation');
  });
```

**Step 3: Run tests to verify they pass**

Run: `npm test -- e2e/eval-helpers/__tests__/trigger.test.ts`

Expected: All tests PASS, including the two new ones.

**Step 4: Commit**

```bash
git add e2e/eval-config.ts e2e/eval-helpers/__tests__/trigger.test.ts
git commit -m "feat: register 11 missing LLM surfaces in eval-config (KB-100)"
```

---

### Task 3: Write failing test for website-chat prompt adapter surface

**Files:**
- Modify: `e2e/__tests__/prompt-adapter.test.ts` (add website-chat describe block)

**Step 1: Add the website-chat test block**

In `e2e/__tests__/prompt-adapter.test.ts`, first update the import at the top of the file to include `buildPromptForScenario`:

```typescript
import { loadFixture, buildPromptForScenario } from '../prompt-adapter';
```

Then append below the existing `loadFixture` describe block:

```typescript
describe('buildPromptForScenario', () => {
  describe('website-chat surface', () => {
    const scenario: EvalScenario = {
      name: 'test-website-chat',
      surface: 'website-chat',
      tags: ['website-chat'],
      config: { mode: 'autonomous' },
      fixtures: {
        analysis: 'sample-analysis-context.json',
        foundationDocs: 'sample-foundation-docs.json',
      },
      conversation: [
        { role: 'user', content: 'Continue. Now work on stage 2: Write Hero.' },
        { role: 'assistant', evaluate: true },
      ],
      dimensions: ['instruction-following'],
    };

    it('returns system prompt with autonomous mode instruction', async () => {
      const result = await buildPromptForScenario(scenario);
      expect(result.systemPrompt).toContain('Complete ONLY the current stage');
    });

    it('includes advisor roster', async () => {
      const result = await buildPromptForScenario(scenario);
      expect(result.systemPrompt).toContain('Available Advisors for Consultation');
    });

    it('includes foundation documents from fixture', async () => {
      const result = await buildPromptForScenario(scenario);
      expect(result.systemPrompt).toContain('SecondLook Strategy');
    });

    it('includes content quality rules', async () => {
      const result = await buildPromptForScenario(scenario);
      expect(result.systemPrompt).toContain('Never suggest, request, or generate social proof');
    });

    it('uses interactive mode instruction when config.mode is interactive', async () => {
      const interactiveScenario = {
        ...scenario,
        config: { mode: 'interactive' },
      };
      const result = await buildPromptForScenario(interactiveScenario);
      expect(result.systemPrompt).toContain('Mode: Interactive');
      expect(result.systemPrompt).not.toContain('Complete ONLY the current stage');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- e2e/__tests__/prompt-adapter.test.ts`

Expected: FAIL — `Unknown surface: "website-chat"`.

**Step 3: Commit (failing test only)**

```bash
git add e2e/__tests__/prompt-adapter.test.ts
git commit -m "test: add failing tests for website-chat prompt adapter surface"
```

---

### Task 4: Implement website-chat surface in prompt-adapter

**Files:**
- Modify: `e2e/prompt-adapter.ts:14-72` (add new case in switch)

**Known gap:** The production `assembleSystemPrompt` includes a `siteSection` block for rebuild scenarios (when an existing site is live). This adapter omits it because all current eval scenarios test initial builds, not rebuilds. If a rebuild scenario is added later, the adapter will need a `siteSection` fixture path and corresponding template section.

**Step 1: Add the website-chat case**

In `e2e/prompt-adapter.ts`, add the following case before the `default:` case in the `buildPromptForScenario` switch statement:

```typescript
    case 'website-chat': {
      const { getAdvisorSystemPrompt } = await import('@/lib/advisors/prompt-loader');
      const { getFrameworkPrompt } = await import('@/lib/frameworks/framework-loader');
      const { advisorRegistry } = await import('@/lib/advisors/registry');

      const mode = (scenario.config.mode as string) || 'autonomous';

      // 1. Julian Shapiro advisor prompt (website builder default)
      const advisorPrompt = getAdvisorSystemPrompt('julian-shapiro');

      // 2. Landing Page Assembly framework
      const framework = getFrameworkPrompt('landing-page-assembly');

      // 3. Foundation documents from fixture
      let foundationSection = 'No foundation documents are available yet.';
      if (scenario.fixtures.foundationDocs) {
        const docs = loadFixture(scenario, 'foundationDocs') as Record<string, { type: string; content: string; lastUpdated: string }>;
        foundationSection = Object.values(docs)
          .map(doc => `### ${doc.type} (updated ${doc.lastUpdated})\n${doc.content}`)
          .join('\n\n');
      }

      // 4. Idea/analysis section from fixture
      let ideaSection = '';
      if (scenario.fixtures.analysis) {
        const ctx = loadFixture(scenario, 'analysis') as Record<string, unknown>;
        ideaSection = `### Product\n- **Name:** ${ctx.ideaName}\n- **Description:** ${ctx.ideaDescription}\n- **Target User:** ${ctx.targetUser}\n- **Problem Solved:** ${ctx.problemSolved}`;
        if (Array.isArray(ctx.topKeywords)) {
          const kws = (ctx.topKeywords as Array<{ keyword: string; intentType: string }>).slice(0, 10);
          ideaSection += `\n\n### Keywords\n${kws.map(k => `- ${k.keyword} (${k.intentType})`).join('\n')}`;
        }
        if (ctx.competitors) {
          ideaSection += `\n\n### Competitors\n${ctx.competitors}`;
        }
      }

      // 5. Mode instruction — mirrors assembleSystemPrompt in painted-door chat route
      const modeInstruction = mode === 'interactive'
        ? `## Mode: Interactive ("Build with me")\nYou are in interactive mode. Follow the 6-stage process. At every copy-producing stage (0, 1, 2a-2e, 3), you MUST pause and present your work for user feedback before continuing. You MUST call consult_advisor for the required advisors at each stage before presenting your synthesis.\n\nWhen you finish a checkpoint step, end your message by describing what you've completed and what you'd like feedback on.`
        : `## Mode: Autonomous ("You've got this")\nYou are in autonomous mode. Complete ONLY the current stage. You will be automatically advanced to the next stage — do not attempt to work ahead. You MUST call consult_advisor for the required advisors at this stage before finishing. Narrate your progress as you go.`;

      // 6. Advisor roster
      const advisorsWithExpertise = advisorRegistry.filter(a => a.evaluationExpertise);
      const advisorRoster = advisorsWithExpertise
        .map(a => `- **${a.id}** (${a.name}): ${a.evaluationExpertise}`)
        .join('\n');

      return {
        systemPrompt: `${advisorPrompt}\n\n${framework ? `## FRAMEWORK\n${framework}\n` : ''}---\n\n## Your Task\n\nYou are building a landing page for a product. Follow the Landing Page Assembly framework through all 6 stages. Use the foundation documents below as your source of truth. Fill gaps where docs don't specify exact values.\n\nYou MUST call consult_advisor for the required advisors at EVERY copy-producing stage before presenting your recommendation to the user. This is mandatory, not optional.\n\n${modeInstruction}\n\n## Content Quality Rules\n- Never suggest, request, or generate social proof (testimonials, user counts, customer logos, case studies). The target users are pre-launch startups. Social proof does not exist and should never be referenced.\n- Never use em dashes (-- or unicode em dash). Use periods, commas, colons, or semicolons instead.\n- Keep each message concise. The user is reading a chat, not a report.\n- Before finalizing any copy, check it against the AI slop blocklist in the framework. If any pattern appears, rewrite that sentence.\n\n## Foundation Documents\n${foundationSection}\n\n## Product & Analysis\n${ideaSection}\n\n## Available Advisors for Consultation\nYou MUST use the consult_advisor tool for the required advisors at each stage.\n${advisorRoster}\n\n## Build Tools\nYou have access to all website build tools (assemble_site_files, create_repo, push_files, etc.) plus consult_advisor. Use them when you reach the appropriate step.\n\n## Output\nRespond conversationally. When you use a tool, explain what you're doing and why. When consulting an advisor, do NOT paraphrase their response. Their response appears as a separate message bubble.`,
      };
    }
```

**Step 2: Run tests to verify they pass**

Run: `npm test -- e2e/__tests__/prompt-adapter.test.ts`

Expected: All tests PASS (both loadFixture and website-chat tests).

**Step 3: Commit**

```bash
git add e2e/prompt-adapter.ts
git commit -m "feat: add website-chat surface to eval prompt adapter (KB-099)"
```

---

### Task 5: Create autonomous-mode-scoping scenario

Tests that the website builder in autonomous mode scopes its response to the current stage only, per the fix-autonomous-mode-chain changes.

**Files:**
- Create: `e2e/scenarios/website-chat-autonomous-scoping.json`

**Step 1: Create the scenario file**

```json
{
  "name": "website-chat-autonomous-scoping",
  "surface": "website-chat",
  "tags": ["website-chat", "painted-door"],
  "config": {
    "mode": "autonomous"
  },
  "fixtures": {
    "analysis": "sample-analysis-context.json",
    "foundationDocs": "sample-foundation-docs.json"
  },
  "conversation": [
    { "role": "user", "content": "I choose \"You've got this\" mode. Let's begin!" },
    { "role": "assistant", "evaluate": true }
  ],
  "dimensions": ["instruction-following", "output-length"],
  "dimensionConfig": {
    "voice": {
      "antiPatterns": ["game-changer", "revolutionary", "cutting-edge", "world-class"]
    }
  }
}
```

This scenario sends the initial mode-select message. The system prompt says "Complete ONLY the current stage." The `instruction-following` judge will evaluate whether the response focuses on stage 0 (Extract & Validate Ingredients) without jumping ahead to hero copy or page sections.

**Step 2: Verify the scenario loads**

Run: `npm test -- e2e/eval-helpers/__tests__/scenario-loader.test.ts`

Expected: Existing tests still PASS (scenario loader discovers all `.json` files in its configured directory; our new file is in the default scenarios dir so it will be found by `loadAllScenarios`).

**Step 3: Commit**

```bash
git add e2e/scenarios/website-chat-autonomous-scoping.json
git commit -m "feat: add autonomous mode scoping eval scenario (KB-099)"
```

---

### Task 6: Create continue-message scenario

Tests that the LLM responds correctly to the stage-specific continue message format ("Continue. Now work on stage N: Step Name."), which was changed in the fix-autonomous-mode-chain branch.

**Files:**
- Create: `e2e/scenarios/website-chat-continue-message.json`

**Step 1: Create the scenario file**

```json
{
  "name": "website-chat-continue-message",
  "surface": "website-chat",
  "tags": ["website-chat", "painted-door"],
  "config": {
    "mode": "autonomous"
  },
  "fixtures": {
    "analysis": "sample-analysis-context.json",
    "foundationDocs": "sample-foundation-docs.json"
  },
  "conversation": [
    { "role": "user", "content": "I choose \"You've got this\" mode. Let's begin!" },
    { "role": "assistant", "evaluate": false },
    { "role": "user", "content": "Continue. Now work on stage 2: Write Hero." },
    { "role": "assistant", "evaluate": true }
  ],
  "dimensions": ["instruction-following", "voice", "output-length"],
  "dimensionConfig": {
    "voice": {
      "antiPatterns": ["game-changer", "revolutionary", "cutting-edge", "world-class", "innovative solution"]
    }
  }
}
```

This is a multi-turn scenario. Turn 1 (not evaluated) establishes context — the LLM responds to mode selection. Turn 2 sends the continue message for stage 2 (Write Hero). The `instruction-following` judge evaluates whether the response focuses on hero section copywriting. The `voice` dimension checks Julian Shapiro voice quality.

Note: The first assistant turn has `evaluate: false`. The eval runner skips non-evaluated assistant turns entirely (they're not added to the message history). However, the LLM still generates a response for that turn, which IS added to history — this is how the runner builds multi-turn context. Re-reading the runner code at `e2e/eval-runner.ts:98-100`:

```typescript
if (turn.role === 'user') { messages.push({ role: 'user', content: turn.content! }); continue; }
if (turn.role !== 'assistant' || !turn.evaluate) continue;
```

Wait — non-evaluated assistant turns ARE skipped. The code `continue`s past them without generating a response. This means the second user message ("Continue. Now work on stage 2") will be sent without any assistant response between the two user messages. The LLM will see: `[user: mode select, user: continue]` — two consecutive user messages.

This is acceptable for this test. The system prompt establishes the full context (autonomous mode, stage process), and the continue message is self-contained ("Now work on stage 2: Write Hero"). The LLM doesn't need the prior assistant turn to understand what to do.

**Systemic eval limitation:** The eval runner has no mechanism for scripted (pre-written) assistant turns. Assistant turns with `evaluate: false` are skipped entirely — no LLM call, no response injected. The only way to get an assistant response into the message history is `evaluate: true`, which costs an API call and evaluates the turn. This means multi-turn scenarios that need prior context either (a) burn an API call on an unevaluated turn via `evaluate: true`, or (b) rely on the system prompt to carry context. This scenario uses approach (b). Approach (a) would be needed for scenarios where the second user turn genuinely depends on specific assistant output.

**Step 2: Commit**

```bash
git add e2e/scenarios/website-chat-continue-message.json
git commit -m "feat: add continue message eval scenario (KB-099)"
```

---

### Task 7: Create foundation-chat scenario

Creates a scenario for the foundation document editing surface. Uses the existing `advisor-chat` prompt adapter surface (which already mirrors the foundation chat route's prompt construction) rather than creating a duplicate surface.

**Files:**
- Create: `e2e/scenarios/seth-godin-foundation-chat.json`

**Step 1: Create the scenario file**

The foundation chat route maps `strategy` → `seth-godin` via `DOC_ADVISOR_MAP`. This scenario tests Seth Godin's voice when editing a strategy document.

```json
{
  "name": "seth-godin-foundation-chat",
  "surface": "advisor-chat",
  "tags": ["advisor", "foundation"],
  "config": {
    "advisor": "seth-godin",
    "docType": "strategy",
    "currentContent": "# SecondLook Strategy\n\n## Diagnosis\nThrift stores face a critical operational bottleneck: donated item intake requires identification, quality assessment, categorization, and pricing.\n\n## Guiding Policy\nBuild the definitive AI-powered intake system for secondhand retail, starting with clothing (highest volume).\n\n## Coherent Actions\n1. Launch with clothing categorization\n2. Price anchoring against eBay sold listings\n3. Partner with 5 pilot stores\n4. Expand to books and electronics in Q2"
  },
  "fixtures": {
    "analysis": "sample-analysis-context.json"
  },
  "conversation": [
    { "role": "user", "content": "Our strategy feels too operational. How do we reframe it around who we're serving and why they'd care enough to switch from manual sorting?" },
    { "role": "assistant", "evaluate": true }
  ],
  "dimensions": ["voice", "output-length"],
  "dimensionConfig": {
    "voice": {
      "antiPatterns": ["disrupt", "leverage", "synergy", "best-in-class", "game-changer"],
      "signaturePhrases": ["smallest viable audience", "remarkable", "tribe", "permission", "purple cow", "tension"]
    }
  }
}
```

**Step 2: Commit**

```bash
git add e2e/scenarios/seth-godin-foundation-chat.json
git commit -m "feat: add seth-godin foundation-chat eval scenario (KB-101)"
```

---

### Task 8: Create multi-turn advisor-chat scenario

The first multi-turn scenario in the eval suite. Tests that the LLM maintains context and voice across multiple conversation turns.

**Files:**
- Create: `e2e/scenarios/april-dunford-multi-turn.json`

**Step 1: Create the scenario file**

Uses April Dunford (already has a single-turn scenario) to enable direct comparison of single-turn vs multi-turn behavior.

```json
{
  "name": "april-dunford-multi-turn",
  "surface": "advisor-chat",
  "tags": ["advisor", "foundation", "multi-turn"],
  "config": {
    "advisor": "april-dunford",
    "docType": "positioning",
    "currentContent": "# SecondLook Positioning\n\n## Category\nAI-powered inventory management for thrift retail\n\n## Competitive Alternatives\n- Manual sorting (status quo)\n- GoodSort (workflow optimization without AI)\n- Generic POS systems\n\n## Differentiators\n- Real-time CV identification\n- Regional pricing intelligence\n\n## Best Customer\nIndependent thrift store owners processing 100+ donations daily"
  },
  "fixtures": {
    "analysis": "sample-analysis-context.json",
    "foundationDocs": "sample-foundation-docs.json"
  },
  "conversation": [
    { "role": "user", "content": "I think our competitive alternatives list is too narrow. We're only comparing to other software, but most stores just use experienced staff. How should we think about that?" },
    { "role": "assistant", "evaluate": true },
    { "role": "user", "content": "That makes sense. Now update the competitive alternatives section to include what you just described, and adjust the differentiators to be more specific about why we win against each alternative." },
    { "role": "assistant", "evaluate": true }
  ],
  "dimensions": ["voice", "instruction-following", "output-length"],
  "dimensionConfig": {
    "voice": {
      "antiPatterns": ["disrupt", "innovative solution", "cutting-edge", "world-class"],
      "signaturePhrases": ["competitive alternatives", "market category", "differentiated value", "best customer", "positioning"]
    }
  }
}
```

Turn 1 asks a strategic question (conversational response expected). Turn 2 requests a document change, referencing the prior answer ("what you just described"). The `instruction-following` judge evaluates whether turn 2 produces `<updated_document>` tags as required by the system prompt rules. Both turns are evaluated for voice consistency.

**Step 2: Commit**

```bash
git add e2e/scenarios/april-dunford-multi-turn.json
git commit -m "feat: add multi-turn advisor-chat eval scenario (KB-101)"
```

---

### Task 9: Create julian-shapiro advisor-chat scenario

Julian Shapiro is the website builder's default advisor but has zero eval scenarios. This scenario tests his voice in a foundation document editing context (brand-voice doc type, since he's listed with `contextDocs: ['positioning', 'brand-voice', 'seo-strategy']` in the registry).

Note: Julian Shapiro does NOT have `evaluationExpertise` set in the advisor registry — he's an `author` role, not a `critic` or `strategist`. His prompt is used as the base system prompt for the website builder. Testing his voice in an advisor-chat context ensures his prompt file produces distinctive, on-brand responses.

**Files:**
- Create: `e2e/scenarios/julian-shapiro-advisor-chat.json`

**Step 1: Create the scenario file**

```json
{
  "name": "julian-shapiro-advisor-chat",
  "surface": "advisor-chat",
  "tags": ["advisor", "foundation"],
  "config": {
    "advisor": "julian-shapiro",
    "docType": "brand-voice",
    "currentContent": "# SecondLook Brand Voice\n\n## Voice Attributes\n- Practical over theoretical\n- Confident but not arrogant\n- Direct, minimal jargon\n\n## Tone\nHelpful expert who respects the reader's time. Like a knowledgeable friend, not a salesperson.\n\n## Vocabulary\nPrefer: sort, price, identify, speed, accuracy\nAvoid: leverage, synergy, disrupt, revolutionary"
  },
  "fixtures": {
    "analysis": "sample-analysis-context.json",
    "foundationDocs": "sample-foundation-docs.json"
  },
  "conversation": [
    { "role": "user", "content": "Our brand voice doc feels generic. How should we sharpen it to sound more like us and less like every other SaaS?" },
    { "role": "assistant", "evaluate": true }
  ],
  "dimensions": ["voice", "output-length"],
  "dimensionConfig": {
    "voice": {
      "antiPatterns": ["leverage", "synergy", "disrupt", "game-changer", "best-in-class", "innovative"],
      "signaturePhrases": ["hook", "value prop", "objection", "landing page", "conversion", "copy"]
    }
  }
}
```

**Step 2: Commit**

```bash
git add e2e/scenarios/julian-shapiro-advisor-chat.json
git commit -m "feat: add julian-shapiro advisor-chat eval scenario (KB-101)"
```

---

### Task 10: Run full test suite and build verification

**Step 1: Run the full test suite**

Run: `npm test`

Expected: All tests PASS, including the new tests in `e2e/__tests__/prompt-adapter.test.ts` and `e2e/eval-helpers/__tests__/trigger.test.ts`.

**Step 2: Run the production build**

Run: `npm run build`

Expected: Build succeeds with exit code 0. The new prompt adapter code uses dynamic imports (`await import(...)`) that TypeScript must verify.

**Step 3: Run eval dry-run to verify all scenarios load**

Run: `npx tsx e2e/eval-runner.ts --all --dry-run`

Expected: Lists all scenarios including the 5 new ones:
- `website-chat-autonomous-scoping [website-chat]`
- `website-chat-continue-message [website-chat]`
- `seth-godin-foundation-chat [advisor-chat]`
- `april-dunford-multi-turn [advisor-chat]`
- `julian-shapiro-advisor-chat [advisor-chat]`

Total should be 12 scenarios (7 existing + 5 new).

**Step 4: Commit if any adjustments were needed**

If Steps 1-3 required fixes, commit them:

```bash
git add -A
git commit -m "fix: address build/test issues from eval coverage work"
```

---

## Manual Steps (Post-Automation)

> Complete after all tasks finish.

- [ ] Run `npx tsx e2e/eval-runner.ts --tag website-chat` to execute the two website-chat scenarios against the real LLM. Review the judge scores. If instruction-following scores < 3, the autonomous mode prompt may need strengthening (separate issue).
- [ ] Run `npx tsx e2e/eval-runner.ts --scenario april-dunford-multi-turn` to verify multi-turn context works end-to-end.
- [ ] Move KB-099, KB-100, KB-101 from `docs/kanban/todo/` to `docs/kanban/done/` (or update their status).

---

## Decision Log

### Summary

| # | Decision | Choice Made | Alternatives Considered |
|---|----------|-------------|------------------------|
| 1 | Foundation-chat surface | Reuse `advisor-chat` surface | Dedicated `foundation-chat` surface |
| 2 | Fixture path fix approach | Change `loadFixture` to use `fixtures/` dir | Move files to `e2e/` root, or add `fixtures/` prefix to scenario refs |
| 3 | Website-chat prompt construction | Duplicate template in adapter | Import and mock `assembleSystemPrompt`, or extract shared function |
| 4 | Multi-turn scenario advisor | April Dunford | New advisor (seth-godin), or different existing advisor |
| 5 | instruction-following heuristic | Leave as judge-only (n/a) | Add stage-scoping heuristic |
| 6 | consult_advisor tool-call verification | Defer (structural limitation) | New dimension with tool-call tracking |
| 7 | Scope: copywriter + oli-gardner scenarios | Defer to follow-up | Include in this plan |

### Appendix: Decision Details

#### Decision 1: Reuse advisor-chat surface for foundation-chat scenarios

**Chose:** Use the existing `advisor-chat` surface rather than creating a separate `foundation-chat` surface.

**Why:** The foundation chat route (`src/app/api/foundation/[ideaId]/chat/route.ts`) constructs a system prompt that is structurally identical to what the `advisor-chat` prompt adapter already produces. Both include: advisor prompt, "You are helping the user refine their {docType} document" instruction, analysis context, foundation docs, current content, and the `<updated_document>` rules. The only differences are cosmetic (timestamp in document header, `DOC_ADVISOR_MAP` lookup vs explicit config). Creating a duplicate surface would mean maintaining two nearly-identical code paths with high drift risk for zero behavioral difference.

The foundation chat route IS registered in `eval-config.ts` with the `foundation` tag. Existing advisor-chat scenarios are already tagged `["advisor", "foundation"]`, so changes to the foundation chat route DO trigger relevant scenarios.

**Alternatives rejected:**
- Dedicated `foundation-chat` surface: Would duplicate ~40 lines of `advisor-chat` logic for no behavioral gain. Higher maintenance cost, same eval coverage.

#### Decision 2: Change loadFixture to use fixtures/ directory

**Chose:** Update the `loadFixture` function to resolve paths via `join(process.cwd(), 'e2e', 'fixtures', rel)`.

**Why:** All 6 fixture files live in `e2e/fixtures/`. The current code resolves to `e2e/<filename>`, which doesn't exist. This is a blocking bug — no fixture-dependent scenario can run. Fixing `loadFixture` (one line) is minimal and keeps scenario fixture references clean (just filenames, no directory prefix).

**Alternatives rejected:**
- Move fixtures to `e2e/` root: Clutters the `e2e/` directory with data files alongside code.
- Add `fixtures/` prefix to each scenario's fixture refs: More changes (6 scenario files), less clean refs, and fragile if more fixtures are added.

#### Decision 3: Duplicate prompt template in website-chat adapter

**Chose:** Replicate the `assembleSystemPrompt` template string in the prompt adapter, substituting DB calls with fixture loading.

**Why:** The `assembleSystemPrompt` function in the route makes 4 database calls (`getAllFoundationDocs`, `getIdeaFromDb`, `buildContentContext`, `getPaintedDoorSite`). Importing and calling it directly would require mocking these at the module level in a non-Next.js execution context (the eval runner is a standalone script). The eval prompt adapter pattern established by the existing `advisor-chat` surface is to reconstruct the prompt using fixture data, which is what we do here.

The drift risk (route template changes without adapter update) is real and only partially mitigated. When the route's `assembleSystemPrompt` changes, the `website-chat` tag triggers scenario re-evaluation — but the eval runs against the adapter's reconstructed prompt, not the production prompt. Drift is only detected if the LLM's score degrades below the judge threshold, which won't catch subtle prompt changes. Human review of the adapter is required whenever `assembleSystemPrompt` is modified. The adapter code includes comments citing the source function to flag this dependency.

**Alternatives rejected:**
- Import `assembleSystemPrompt` with mocked DB: Complex module-level mocking in eval context, fragile across Node.js/Next.js module boundary differences.
- Extract shared template function: Requires refactoring the production route to separate prompt template from DB fetching. More invasive than the eval work warrants.

#### Decision 4: April Dunford for multi-turn scenario

**Chose:** Use April Dunford as the advisor for the first multi-turn scenario.

**Why:** She already has a single-turn scenario (`april-dunford-foundation-chat`), enabling direct comparison of voice quality between single-turn and multi-turn contexts. Her positioning expertise produces concrete, structured advice that naturally leads to follow-up questions (turn 1: strategic discussion, turn 2: document update request). This tests both conversational and document-editing modes in a single scenario.

**Alternatives rejected:**
- Seth Godin: Already used in the new foundation-chat scenario (Task 7). Using him again would reduce advisor coverage breadth.
- New advisor without an existing scenario: Would prevent single-turn vs multi-turn comparison.

#### Decision 5: Leave instruction-following as judge-only

**Chose:** Keep the `instruction-following` dimension's heuristic returning `n/a`, relying entirely on the judge for evaluation.

**Why:** The judge evaluates instruction-following against the full system prompt, which contains stage-specific instructions for website-chat scenarios. Adding a heuristic for stage-scoping (e.g., pattern-matching for mentions of later stages) would be brittle — the model might legitimately reference future stages when explaining the overall process. The judge's semantic evaluation is more reliable for this. KB-101 flagged the `n/a` heuristic as a gap, but the dimension still works — it just costs one extra judge API call per evaluation. Optimizing the heuristic is deferred to the KB-101 follow-up.

**Alternatives rejected:**
- Stage-scoping heuristic: Brittle pattern matching with high false-positive risk. Better to invest in this after observing actual eval results.

#### Decision 6: Defer consult_advisor tool-call verification

**Chose:** Do not attempt to verify that the LLM generates `consult_advisor` tool calls. This is KB-099's third requirement.

**Why:** The eval runner calls `getAnthropic().messages.create()` without passing tools. It evaluates text responses only. To verify tool-call generation, the runner would need to: (1) pass tool definitions in the API call, (2) inspect `tool_use` content blocks in the response, and (3) have a new dimension that checks for expected tool calls. This is a structural extension to the eval runner, not a scenario-level change. It's out of scope for this plan, which focuses on prompt-level coverage gaps.

KB-099 will remain partially open after this plan: 2 of 3 requirements covered. The remaining tool-call verification should be tracked as a separate eval infrastructure enhancement.

**Alternatives rejected:**
- New dimension with tool-call tracking: Requires eval runner changes (pass tools to API call, expose tool_use blocks to dimensions). Correct long-term solution but architecturally larger than this plan's scope.

#### Decision 7: Defer copywriter and oli-gardner scenarios

**Chose:** Include only julian-shapiro from KB-101's "remaining high-value advisors" list. Defer copywriter and oli-gardner to follow-up.

**Why:** The user's scope guidance specifies 5 prioritized items. Item 5 is "Add julian-shapiro advisor-chat scenario (he's the website builder's default advisor)." Copywriter and oli-gardner are mentioned in KB-101's priority list but were not included in the user's 5-item scope. Julian Shapiro has the highest strategic value because he's the website builder's default advisor — his prompt quality directly affects the highest-gap surface (KB-099). Copywriter and oli-gardner are important but lower priority than the infrastructure work (Tasks 1-4) and the multi-turn/foundation scenarios.

**Alternatives rejected:**
- Include all three advisors: Would add 2 more scenario files (Tasks 10-11). Low implementation cost, but exceeds the scoped 5 items the user requested. Better to deliver the scoped plan and let the user explicitly request the expansion.

---

## Critique Panel Results

**Round 1 (Architect + Verifier, both Sonnet):**
- Factual accuracy: 98% (44/45 confirmed, 0 incorrect, 1 correctly unverifiable)
- Architect: 0 blocking, 3 significant (blast radius, drift risk, eval runner limitation), 4 minor
- Verifier: 2 design fidelity gaps (consult_advisor tool-call, copywriter/oli-gardner scope), 4 structural gaps

**Corrections applied:**
1. Added error-path test for nonexistent fixture file (Task 1)
2. Added full-suite check after Task 1 to catch blast radius (Task 1 Step 5)
3. Restructured Task 2 to eliminate read-ahead sequencing issue
4. Combined import statement in Task 3 with Task 1's existing import
5. Documented siteSection omission as known gap (Task 4)
6. Documented eval runner scripted-turn limitation (Task 6)
7. Strengthened Decision 3 drift risk acknowledgment
8. Added Decision 6 (consult_advisor deferral with rationale)
9. Added Decision 7 (copywriter/oli-gardner scope exclusion with rationale)

**Round 2:** Not needed — no medium/high severity issues remain after corrections.
