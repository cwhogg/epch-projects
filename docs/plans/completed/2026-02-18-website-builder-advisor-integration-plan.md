# Website Builder: Advisor Integration & Stage Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Restructure the website builder from 8 stages to 6, integrate mandatory advisor collaboration into every copy-producing stage, fix four UX bugs, and add content quality enforcement.

**Source Design Doc:** `docs/plans/2026-02-18-website-builder-advisor-integration-design.md`

**Architecture:** The website builder is a chat-driven agent loop where Julian Shapiro leads users through landing page creation. The chat API route (`src/app/api/painted-door/[id]/chat/route.ts`) streams LLM responses, manages step advancement via tool calls, and injects advisor response markers into the stream. The frontend (`src/app/website/[id]/build/page.tsx`) parses these markers into separate message bubbles and manages step progress UI. This plan replaces the 8-stage model with a 6-stage model (with substages in stage 3), adds code-level enforcement of mandatory advisor calls, fixes four synchronization bugs, and adds a copy quality validation layer.

**Stage numbering note:** The design doc uses 1-indexed stage numbers (Stage 1 through Stage 6, substages 3a-3e). This plan uses 0-indexed array indices (stage 0 through 5, substages 2a-2e) because `WEBSITE_BUILD_STEPS` is a zero-indexed array. The mapping is: Design Stage 1 = code index 0, Design Stage 2 = code index 1, Design Stage 3 = code index 2, etc. User-facing text (framework prompt, sidebar labels) should display 1-indexed names without numeric prefixes.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Anthropic SDK, Vitest

**Lesson learned:** Always run `npm run build` as verification — vitest transpiles with esbuild/SWC which strips types without checking. The Next.js build runs `tsc` and catches type errors that tests miss (`docs/lessons-learned/2026-02-18-build-catches-type-errors-tests-miss.md`).

---

## Task Dependencies

Tasks that modify the same files must execute in order. The dependency chain is:

- **Tasks 1-3** are standalone — no shared files, can conceptually run in any order but execute sequentially
- **Task 4** (types) must complete before Tasks 8-12 (backend code depends on new types)
- **Tasks 5-7** are standalone prompt/config changes — no code dependencies
- **Tasks 8, 9, 10** modify `route.ts` sequentially
- **Task 11** (backend tests) must follow Tasks 8-10 — tests won't pass between Tasks 4 and 11
- **Tasks 12-13** modify `build/page.tsx` sequentially
- **Task 14** (architecture) is standalone
- **Task 15** (verification) must be last

> **Note for executor:** Tests will be broken between Tasks 4 and 11. This is expected — the type changes in Task 4 break existing tests that reference the old 8-stage model. Task 11 updates all tests to match. Do not attempt to run `npm test` between Tasks 4 and 10.

---

### ✅ Task 1: Create copy quality validation module

**Files:**
- Create: `src/lib/copy-quality.ts`
- Create: `src/lib/__tests__/copy-quality.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/__tests__/copy-quality.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateCopyQuality, type CopyQualityFlag } from '../copy-quality';

describe('validateCopyQuality', () => {
  it('returns empty array for clean text', () => {
    const result = validateCopyQuality('Build faster websites with our static site generator.');
    expect(result).toEqual([]);
  });

  it('detects filler openers', () => {
    const result = validateCopyQuality("Great question! Let me explain how this works.");
    expect(result.some((f: CopyQualityFlag) => f.category === 'filler-opener')).toBe(true);
  });

  it('detects vague intensifiers', () => {
    const result = validateCopyQuality('This is an incredibly powerful tool that is truly remarkable.');
    expect(result.some((f: CopyQualityFlag) => f.category === 'vague-intensifier')).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2); // "incredibly" and "truly"
  });

  it('detects empty business jargon', () => {
    const result = validateCopyQuality('Leverage our cutting-edge platform to revolutionize your workflow.');
    expect(result.some((f: CopyQualityFlag) => f.category === 'business-jargon')).toBe(true);
  });

  it('detects padded transitions', () => {
    const result = validateCopyQuality("It's worth noting that our tool handles edge cases well.");
    expect(result.some((f: CopyQualityFlag) => f.category === 'padded-transition')).toBe(true);
  });

  it('detects sycophantic praise', () => {
    const result = validateCopyQuality('Excellent choice! That approach will work well.');
    expect(result.some((f: CopyQualityFlag) => f.category === 'sycophantic-praise')).toBe(true);
  });

  it('detects generic closers', () => {
    const result = validateCopyQuality('Let me know if you have any questions about the implementation.');
    expect(result.some((f: CopyQualityFlag) => f.category === 'generic-closer')).toBe(true);
  });

  it('detects fake specificity', () => {
    const result = validateCopyQuality('Studies show that users prefer faster load times.');
    expect(result.some((f: CopyQualityFlag) => f.category === 'fake-specificity')).toBe(true);
  });

  it('detects em dashes', () => {
    const result = validateCopyQuality('Our tool — the best in its class — handles everything.');
    expect(result.some((f: CopyQualityFlag) => f.category === 'em-dash')).toBe(true);
  });

  it('does not flag double hyphens in code contexts', () => {
    // Double hyphens that are NOT em dashes (e.g., CLI flags) should not be flagged
    const result = validateCopyQuality('Run npm install to get started.');
    expect(result).toEqual([]);
  });

  it('returns matched text in each flag', () => {
    const result = validateCopyQuality("That's a great point about the design.");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('match');
    expect(result[0]).toHaveProperty('category');
  });

  it('handles empty string', () => {
    expect(validateCopyQuality('')).toEqual([]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/__tests__/copy-quality.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the copy quality module**

Create `src/lib/copy-quality.ts`:

```typescript
export interface CopyQualityFlag {
  category: string;
  match: string;
  index: number;
}

const BLOCKLIST: { category: string; patterns: RegExp[] }[] = [
  {
    category: 'filler-opener',
    patterns: [
      /\bGreat question[!.]?/gi,
      /\bThat's a great point/gi,
      /\bAbsolutely[!.]/gi,
      /\bI'd be happy to\b/gi,
    ],
  },
  {
    category: 'vague-intensifier',
    patterns: [
      /\bincredibly\b/gi,
      /\bextremely\b/gi,
      /\btruly\b/gi,
      /\bremarkably\b/gi,
      /\bfundamentally\b/gi,
    ],
  },
  {
    category: 'business-jargon',
    patterns: [
      /\bleverage\b/gi,
      /\boptimize\b/gi,
      /\bempower\b/gi,
      /\brevolutionize\b/gi,
      /\bcutting[- ]edge\b/gi,
      /\bgame[- ]changing\b/gi,
      /\bnext[- ]level\b/gi,
      /\bbest[- ]in[- ]class\b/gi,
      /\bworld[- ]class\b/gi,
      /\bstate[- ]of[- ]the[- ]art\b/gi,
    ],
  },
  {
    category: 'padded-transition',
    patterns: [
      /\bIt's worth noting that\b/gi,
      /\bIt's important to understand\b/gi,
      /\bAt the end of the day\b/gi,
      /\bIn today's fast-paced world\b/gi,
      /\bWhen it comes to\b/gi,
    ],
  },
  {
    category: 'sycophantic-praise',
    patterns: [
      /\bExcellent choice[!.]?/gi,
      /\bLove that idea[!.]?/gi,
      /\bWhat a great approach[!.]?/gi,
    ],
  },
  {
    category: 'generic-closer',
    patterns: [
      /\bLet me know if you have any questions\b/gi,
      /\bHope this helps[!.]?/gi,
      /\bFeel free to reach out\b/gi,
    ],
  },
  {
    category: 'fake-specificity',
    patterns: [
      /\bStudies show\b/gi,
      /\bResearch suggests\b/gi,
      /\bExperts agree\b/gi,
    ],
  },
  {
    category: 'em-dash',
    patterns: [
      /\s—\s/g,   // Unicode em dash with surrounding spaces
      /\s--\s/g,  // Double hyphen used as em dash (with spaces)
    ],
  },
];

export function validateCopyQuality(text: string): CopyQualityFlag[] {
  if (!text) return [];

  const flags: CopyQualityFlag[] = [];

  for (const { category, patterns } of BLOCKLIST) {
    for (const pattern of patterns) {
      // Reset lastIndex for global regexes
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        flags.push({
          category,
          match: match[0],
          index: match.index,
        });
      }
    }
  }

  return flags;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/__tests__/copy-quality.test.ts`
Expected: All 12 tests PASS

**Step 5: Commit**

```bash
git add src/lib/copy-quality.ts src/lib/__tests__/copy-quality.test.ts
git commit -m "feat: add copy quality validation module with AI slop blocklist"
```

---

### ✅ Task 2: Add AdvisorStreamParser class for incremental bubble parsing

**Files:**
- Modify: `src/lib/parse-advisor-segments.ts`
- Modify: `src/lib/__tests__/parse-advisor-segments.test.ts`

The existing `parseStreamSegments` pure function stays for backward compatibility. Add a new stateful `AdvisorStreamParser` class alongside it.

**Step 1: Write the failing tests**

Append to `src/lib/__tests__/parse-advisor-segments.test.ts` (after the existing tests):

```typescript
import { AdvisorStreamParser } from '../parse-advisor-segments';

describe('AdvisorStreamParser', () => {
  it('emits julian segment for text without markers', () => {
    const segments: StreamSegment[] = [];
    const parser = new AdvisorStreamParser((seg) => segments.push(seg));

    parser.push('Hello from Julian.');
    parser.flush();

    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('julian');
    expect(segments[0].content).toBe('Hello from Julian.');
  });

  it('emits complete advisor segment in single chunk', () => {
    const segments: StreamSegment[] = [];
    const parser = new AdvisorStreamParser((seg) => segments.push(seg));

    parser.push('Before advisor.\n<<<ADVISOR_START>>>:{"advisorId":"shirin-oreizy","advisorName":"Shirin Oreizy"}\nAdvisor response here.\n<<<ADVISOR_END>>>\nAfter advisor.');
    parser.flush();

    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ type: 'julian', content: 'Before advisor.' });
    expect(segments[1]).toEqual({
      type: 'advisor',
      content: 'Advisor response here.',
      advisorId: 'shirin-oreizy',
      advisorName: 'Shirin Oreizy',
    });
    expect(segments[2]).toEqual({ type: 'julian', content: 'After advisor.' });
  });

  it('handles marker split across two chunks', () => {
    const segments: StreamSegment[] = [];
    const parser = new AdvisorStreamParser((seg) => segments.push(seg));

    parser.push('Text before\n<<<ADVISOR_STA');
    parser.push('RT>>>:{"advisorId":"oli-gardner","advisorName":"Oli Gardner"}\nConversion advice.\n<<<ADVISOR_END>>>\n');
    parser.flush();

    expect(segments.some((s) => s.type === 'advisor' && s.advisorId === 'oli-gardner')).toBe(true);
  });

  it('collapses unclosed marker at stream end into julian text', () => {
    const segments: StreamSegment[] = [];
    const parser = new AdvisorStreamParser((seg) => segments.push(seg));

    parser.push('Some text\n<<<ADVISOR_START>>>:{"advisorId":"copywriter","advisorName":"Copywriter"}\nPartial response without end marker');
    parser.flush();

    // Should fall back to single julian segment with the raw text
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('julian');
    expect(segments[0].content).toContain('Partial response without end marker');
  });

  it('handles multiple advisor segments in sequence', () => {
    const segments: StreamSegment[] = [];
    const parser = new AdvisorStreamParser((seg) => segments.push(seg));

    const text = [
      'Julian intro.',
      '\n<<<ADVISOR_START>>>:{"advisorId":"shirin-oreizy","advisorName":"Shirin Oreizy"}',
      '\nShirin says things.',
      '\n<<<ADVISOR_END>>>',
      '\n<<<ADVISOR_START>>>:{"advisorId":"copywriter","advisorName":"Copywriter"}',
      '\nCopywriter says things.',
      '\n<<<ADVISOR_END>>>',
      '\nJulian synthesis.',
    ].join('');

    parser.push(text);
    parser.flush();

    const advisorSegs = segments.filter((s) => s.type === 'advisor');
    expect(advisorSegs).toHaveLength(2);
    expect(advisorSegs[0].advisorId).toBe('shirin-oreizy');
    expect(advisorSegs[1].advisorId).toBe('copywriter');
  });

  it('handles JSON metadata split across chunks', () => {
    const segments: StreamSegment[] = [];
    const parser = new AdvisorStreamParser((seg) => segments.push(seg));

    parser.push('\n<<<ADVISOR_START>>>:{"advisorId":"april');
    parser.push('-dunford","advisorName":"April Dunford"}\nPositioning feedback.\n<<<ADVISOR_END>>>');
    parser.flush();

    expect(segments.some((s) => s.type === 'advisor' && s.advisorId === 'april-dunford')).toBe(true);
  });

  it('emits segments incrementally as complete markers are found', () => {
    const segments: StreamSegment[] = [];
    const parser = new AdvisorStreamParser((seg) => segments.push(seg));

    parser.push('Julian text.\n<<<ADVISOR_START>>>:{"advisorId":"shirin-oreizy","advisorName":"Shirin Oreizy"}\nAdvisor text.\n<<<ADVISOR_END>>>');

    // Before flush, completed segments should already be emitted
    expect(segments.length).toBeGreaterThanOrEqual(2);

    parser.push('\nMore Julian text.');
    parser.flush();

    expect(segments[segments.length - 1].type).toBe('julian');
    expect(segments[segments.length - 1].content).toContain('More Julian text.');
  });
});
```

**Step 2: Run tests to verify new tests fail**

Run: `npm test -- src/lib/__tests__/parse-advisor-segments.test.ts`
Expected: New `AdvisorStreamParser` tests FAIL (import not found), existing tests PASS

**Step 3: Implement AdvisorStreamParser**

Add to `src/lib/parse-advisor-segments.ts` (after the existing `parseStreamSegments` function):

```typescript
// Reuse existing constants from the top of this file:
// const ADVISOR_START = '<<<ADVISOR_START>>>';
// const ADVISOR_END = '<<<ADVISOR_END>>>';

export class AdvisorStreamParser {
  private buffer = '';
  private callback: (segment: StreamSegment) => void;

  constructor(callback: (segment: StreamSegment) => void) {
    this.callback = callback;
  }

  push(chunk: string): void {
    this.buffer += chunk;
    this.drainCompleteSegments();
  }

  flush(): void {
    if (!this.buffer) return;

    // If buffer contains an unclosed start marker, collapse to julian text
    const startIdx = this.buffer.indexOf(START_MARKER);
    if (startIdx >= 0) {
      const endIdx = this.buffer.indexOf(END_MARKER, startIdx);
      if (endIdx < 0) {
        // Unclosed marker — emit everything as julian
        this.emitJulian(this.buffer);
        this.buffer = '';
        return;
      }
    }

    // Drain any remaining complete segments
    this.drainCompleteSegments();

    // Emit any remaining buffer as julian text
    if (this.buffer.trim()) {
      this.emitJulian(this.buffer);
    }
    this.buffer = '';
  }

  private drainCompleteSegments(): void {
    while (true) {
      const startIdx = this.buffer.indexOf(START_MARKER);
      if (startIdx < 0) break;

      const endIdx = this.buffer.indexOf(END_MARKER, startIdx);
      if (endIdx < 0) break; // Incomplete marker — wait for more data

      // Emit julian text before the advisor marker
      const beforeText = this.buffer.slice(0, startIdx).replace(/\n$/, '');
      if (beforeText.trim()) {
        this.emitJulian(beforeText);
      }

      // Parse the advisor segment
      const markerContent = this.buffer.slice(startIdx + START_MARKER.length, endIdx);
      const colonIdx = markerContent.indexOf(':');
      if (colonIdx >= 0) {
        const jsonAndContent = markerContent.slice(colonIdx + 1);
        const firstNewline = jsonAndContent.indexOf('\n');
        if (firstNewline >= 0) {
          const jsonStr = jsonAndContent.slice(0, firstNewline);
          const advisorContent = jsonAndContent.slice(firstNewline + 1).replace(/\n$/, '');
          try {
            const meta = JSON.parse(jsonStr);
            this.callback({
              type: 'advisor',
              content: advisorContent,
              advisorId: meta.advisorId,
              advisorName: meta.advisorName,
            });
          } catch {
            // Malformed JSON — emit as julian
            this.emitJulian(this.buffer.slice(startIdx, endIdx + END_MARKER.length));
          }
        }
      }

      // Advance past the end marker
      this.buffer = this.buffer.slice(endIdx + END_MARKER.length);
      // Strip leading newline after end marker
      if (this.buffer.startsWith('\n')) {
        this.buffer = this.buffer.slice(1);
      }
    }
  }

  private emitJulian(content: string): void {
    if (content.trim()) {
      this.callback({ type: 'julian', content: content.trim() });
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/__tests__/parse-advisor-segments.test.ts`
Expected: All tests PASS (existing 6 + new 7 = 13 total)

**Step 5: Commit**

```bash
git add src/lib/parse-advisor-segments.ts src/lib/__tests__/parse-advisor-segments.test.ts
git commit -m "feat: add AdvisorStreamParser for incremental streaming bubble detection"
```

---

### ✅ Task 3: Add visual-identity foundation doc type

**Files:**
- Modify: `src/types/index.ts` (lines 357-372)
- Modify: `src/lib/foundation-deps.ts` (line 10)
- Modify: `src/lib/agent-tools/foundation.ts` (line 21)
- Modify: `src/app/project/[id]/page.tsx` (lines 43-50)
- Modify: `src/app/foundation/page.tsx` (lines 7-14)
- Modify: `src/lib/__tests__/foundation-types.test.ts` (line 33)
- Modify: `src/lib/__tests__/foundation-deps.test.ts` (lines 5-12)

**Step 1: Update test assertions to expect 7 types (will fail)**

In `src/lib/__tests__/foundation-types.test.ts`, change the assertion from 6 to 7 and add `'visual-identity'` to the types array:

```typescript
// Line 24-34: Update the test
it('FoundationDocType covers all 7 document types', () => {
  const types: FoundationDocType[] = [
    'strategy',
    'positioning',
    'brand-voice',
    'design-principles',
    'seo-strategy',
    'social-media-strategy',
    'visual-identity',
  ];
  expect(types).toHaveLength(7);
});
```

Also add `'visual-identity': 'pending'` to the `FoundationProgress.docs` object in the test at line 47.

In `src/lib/__tests__/foundation-deps.test.ts`, add `'visual-identity'` to the `ALL_TYPES` array at line 12.

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/__tests__/foundation-types.test.ts src/lib/__tests__/foundation-deps.test.ts`
Expected: FAIL — `'visual-identity'` is not a valid `FoundationDocType`, and `DOC_DEPENDENCIES` is missing it

**Step 3: Add visual-identity to all type/config files**

In `src/types/index.ts`, add `'visual-identity'` to the `FoundationDocType` union (after line 363) and to the `FOUNDATION_DOC_TYPES` array (after line 371).

In `src/lib/foundation-deps.ts`, add after line 10:
```typescript
'visual-identity': ['positioning', 'brand-voice'],
```

In `src/lib/agent-tools/foundation.ts`, add to `DOC_ADVISOR_MAP` after line 21:
```typescript
'visual-identity': 'copywriter',
```

In `src/app/project/[id]/page.tsx`, add to `FOUNDATION_LABELS` after line 49:
```typescript
'visual-identity': 'Visual Identity',
```

In `src/app/foundation/page.tsx`, add to `DOC_LABELS` after line 13:
```typescript
'visual-identity': 'Visual Identity',
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/__tests__/foundation-types.test.ts src/lib/__tests__/foundation-deps.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/types/index.ts src/lib/foundation-deps.ts src/lib/agent-tools/foundation.ts src/app/project/[id]/page.tsx src/app/foundation/page.tsx src/lib/__tests__/foundation-types.test.ts src/lib/__tests__/foundation-deps.test.ts
git commit -m "feat: add visual-identity foundation doc type"
```

---

### ✅ Task 4: Replace 8-stage model with 6-stage types

**Files:**
- Modify: `src/types/index.ts` (lines 517-567)

> **Warning:** This task changes shared types that are imported throughout the codebase. Existing tests will break until Task 11 updates them. Do not run `npm test` until after Task 11.

**Step 1: Replace `WEBSITE_BUILD_STEPS` (lines 517-526)**

Replace:
```typescript
export const WEBSITE_BUILD_STEPS: { name: string; checkpoint: boolean }[] = [
  { name: 'Extract Ingredients',  checkpoint: true  },
  { name: 'Design Brand Identity', checkpoint: false },
  { name: 'Write Hero',           checkpoint: true  },
  { name: 'Assemble Page',        checkpoint: true  },
  { name: 'Pressure Test',        checkpoint: false },
  { name: 'Advisor Review',       checkpoint: true  },
  { name: 'Build & Deploy',       checkpoint: false },
  { name: 'Verify',               checkpoint: false },
];
```

With:
```typescript
export const WEBSITE_BUILD_STEPS: { name: string; checkpoint: boolean }[] = [
  { name: 'Extract & Validate Ingredients', checkpoint: true  },  // 0
  { name: 'Write Hero',                     checkpoint: true  },  // 1
  { name: 'Write Page Sections',            checkpoint: true  },  // 2 (5 substages: 2a-2e)
  { name: 'Final Review',                   checkpoint: true  },  // 3
  { name: 'Build & Deploy',                 checkpoint: false },  // 4
  { name: 'Verify',                         checkpoint: false },  // 5
];
```

**Step 2: Add `REQUIRED_ADVISORS_PER_STAGE` constant**

Add after the `WEBSITE_BUILD_STEPS` definition:

```typescript
/** Advisor IDs that MUST be consulted before a copy-producing stage can advance.
 *  Key format: step index, or "2a"-"2e" for substages within step 2. */
export const REQUIRED_ADVISORS_PER_STAGE: Record<string, string[]> = {
  '0': ['april-dunford', 'copywriter'],
  '1': ['shirin-oreizy', 'copywriter'],
  '2a': ['shirin-oreizy', 'copywriter'],
  '2b': ['copywriter', 'oli-gardner'],
  '2c': ['copywriter'],
  '2d': ['shirin-oreizy', 'april-dunford'],
  '2e': ['shirin-oreizy', 'joanna-wiebe'],
};
```

**Step 3: Update `BuildSession` interface (lines 528-544)**

Replace the `BuildSession` interface:

```typescript
export interface BuildSession {
  ideaId: string;
  mode: BuildMode;
  currentStep: number;
  currentSubstep: number;  // For step 2 (Write Page Sections): 0-4 maps to substages a-e. Defaults to 0.
  steps: BuildStep[];
  artifacts: {
    ingredients?: string;
    heroContent?: string;
    substageContent?: {
      problemAwareness?: string;
      features?: string;
      howItWorks?: string;
      targetAudience?: string;
      objectionHandling?: string;
    };
    finalReviewResult?: string;
    siteUrl?: string;
    repoUrl?: string;
  };
  advisorCallsThisRound?: string[];  // Track which advisor IDs were called in the current round
  createdAt: string;
  updatedAt: string;
}
```

**Step 4: Update `StreamEndSignal` type (line 556-560)**

Add `substep` to the checkpoint variant and `repoUrl` to the complete variant:

```typescript
export type StreamEndSignal =
  | { action: 'checkpoint'; step: number; substep?: number; prompt: string }
  | { action: 'continue'; step: number }
  | { action: 'poll'; step: number; pollUrl: string }
  | { action: 'complete'; result: { siteUrl: string; repoUrl: string } };
```

**Step 5: Update `ChatRequestBody` (lines 562-567)**

Add `substep` field:

```typescript
export interface ChatRequestBody {
  type: 'mode_select' | 'user' | 'continue';
  mode?: BuildMode;
  content?: string;
  step?: number;
  substep?: number;  // For advancing substages within step 2
}
```

**Step 6: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: replace 8-stage website builder types with 6-stage model

Adds currentSubstep, REQUIRED_ADVISORS_PER_STAGE, StreamEndSignal substep, updated artifacts schema.
Tests will break until backend route is updated in subsequent tasks."
```

---

### ✅ Task 5: Rewrite landing-page-assembly framework prompt

**Files:**
- Modify: `src/lib/frameworks/prompts/landing-page-assembly/prompt.md`

**Step 1: Replace the framework prompt**

Replace the entire contents of `src/lib/frameworks/prompts/landing-page-assembly/prompt.md` with the new 6-stage framework:

```markdown
# Landing Page Assembly Framework (6 Stages)

Build a high-converting landing page through structured advisor collaboration. Every copy-producing stage (0, 1, 2a-2e) follows the advisor collaboration protocol. Decisions lock at each stage and are never revisited.

## Stage 0: Extract & Validate Ingredients (checkpoint)

Pull value props, hooks, features, and brand voice constraints from foundation docs. Before presenting to the user, consult April Dunford (positioning accuracy) and the Copywriter (voice alignment). Optionally consult Shirin Oreizy (behavioral framing).

Output: Extracted ingredients with advisor validation. User approves. LOCKED.

## Stage 1: Write Hero (checkpoint)

Draft headline, subheader, and CTA. Consult Shirin Oreizy (behavioral science) and the Copywriter (brand voice) independently. Synthesize and present recommendation with top 2-3 alternatives.

Output: Locked headline, subheader, CTA. Never revisited.

## Stage 2: Write Page Sections (5 substages, each a checkpoint)

Each substage follows the advisor collaboration protocol.

### 2a: Problem Awareness
Required advisors: Shirin Oreizy, Copywriter. Optional: Joanna Wiebe.

### 2b: Features (3-6 blocks)
Required advisors: Copywriter, Oli Gardner.

### 2c: How It Works
Required advisors: Copywriter. Optional: Oli Gardner.

### 2d: Target Audience
Required advisors: Shirin Oreizy, April Dunford.

### 2e: Objection Handling + Final CTA
Required advisors: Shirin Oreizy, Joanna Wiebe. Optional: Copywriter.

Output: All page sections locked individually per substage.

## Stage 3: Final Review (checkpoint)

Concise coherence check across all locked sections. Only surface issues if serious (e.g., a feature section undermines the hero's promise). No more than 200 words. If something requires reopening a locked section, flag it with a clear reason.

Output: Either "looks coherent, ready to build" or a specific concern.

## Stage 4: Build & Deploy

Generate code from locked copy + visual design tokens from foundation docs. Deploy to Vercel. No interactive checkpoints.

## Stage 5: Verify

Check live site, final polish.

## Advisor Collaboration Protocol

Every copy-producing stage (0, 1, 2a-2e) follows this exact sequence:

1. **Draft.** Write initial take based on locked ingredients and prior locked sections. Draft is NOT shown to user yet.
2. **Advisor consultation.** Call consult_advisor for each required advisor, passing your draft and asking for their independent take. Each advisor responds in their own message bubble.
3. **Synthesize (max 300 words).** Present to user: your recommendation incorporating advisor feedback, points of agreement, points of disagreement and why you sided with one, top 2-3 alternatives.
4. **User decides.** Approves recommendation, picks alternative, or provides direction. Section is LOCKED.

When you consult an advisor, do NOT repeat or paraphrase their response in your own message. The advisor's response appears as a separate message bubble automatically. After all advisor consultations, write your synthesis as a new message.

## Content Quality Rules

- Never suggest, request, or generate social proof (testimonials, user counts, customer logos, case studies). The target users are pre-launch startups. Social proof does not exist.
- Never use em dashes (--) in any generated copy, advisor responses, or chat messages. Use periods, commas, colons, or semicolons instead.
- Keep each message concise. The user is reading a chat, not a report.
- Before finalizing any copy, check it against the AI slop blocklist. If any pattern appears, rewrite that sentence. Every word must earn its place. If a competitor could say the same thing, it is not specific enough.

### AI Slop Blocklist (banned patterns)
- Filler openers: "Great question!", "That's a great point", "Absolutely!", "I'd be happy to"
- Vague intensifiers: "incredibly", "extremely", "absolutely", "truly", "remarkably", "fundamentally"
- Empty business jargon: "leverage", "optimize", "empower", "revolutionize", "cutting-edge", "game-changing", "next-level", "best-in-class", "world-class", "state-of-the-art"
- Padded transitions: "It's worth noting that", "It's important to understand", "At the end of the day", "In today's fast-paced world", "When it comes to"
- Sycophantic praise: "Excellent choice!", "Love that idea!", "What a great approach!"
- Generic closers: "Let me know if you have any questions", "Hope this helps!", "Feel free to reach out"
- Fake specificity: "Studies show...", "Research suggests...", "Experts agree..." without citations
- Emoji overuse: No emojis in copy unless brand voice explicitly calls for them
```

**Step 2: Commit**

```bash
git add src/lib/frameworks/prompts/landing-page-assembly/prompt.md
git commit -m "feat: rewrite landing-page-assembly framework for 6-stage advisor model"
```

---

### ✅ Task 6: Update advisor prompts with content quality rules

**Files:**
- Modify: all 14 files in `src/lib/advisors/prompts/*.md`

**Step 1: Add content quality rules to each advisor prompt**

Append the following block to the end of each of the 14 advisor prompt files in `src/lib/advisors/prompts/`:

```markdown

## Content Rules (apply to all responses)
- Never suggest, request, or generate social proof (testimonials, user counts, customer logos, case studies).
- Never use em dashes (-- or the unicode em dash character). Use periods, commas, colons, or semicolons.
- Avoid: "incredible", "extremely", "truly", "leverage", "optimize", "cutting-edge", "game-changing", "world-class", "state-of-the-art".
```

The 14 files are:
- `april-dunford.md`
- `copywriter.md`
- `joe-pulizzi.md`
- `joanna-wiebe.md`
- `julian-shapiro.md`
- `oli-gardner.md`
- `patrick-campbell.md`
- `richard-rumelt.md`
- `robb-wolf.md`
- `robbie-kellman-baxter.md`
- `rob-walling.md`
- `seo-expert.md`
- `seth-godin.md`
- `shirin-oreizy.md`

**Step 2: Commit**

```bash
git add src/lib/advisors/prompts/
git commit -m "feat: add content quality rules to all 14 advisor prompts"
```

---

### ✅ Task 7: Remove socialProofApproach and reduce advisor max_tokens

**Files:**
- Modify: `src/types/index.ts` (lines 186-193)
- Modify: `src/lib/painted-door-prompts.ts` (lines 96-98, 171)
- Modify: `src/lib/agent-tools/website-chat.ts` (max_tokens value)

**Step 1: Remove `socialProofApproach` from `BrandIdentity` type**

In `src/types/index.ts`, remove `socialProofApproach: string;` from the `landingPage` property in the `BrandIdentity` interface (line 191).

**Step 2: Remove social proof from `painted-door-prompts.ts`**

In `src/lib/painted-door-prompts.ts`:
- Remove lines 96-97 (the "Do NOT fabricate testimonials" instruction and the social proof approach description)
- Remove `"socialProofApproach"` from the JSON schema at line 171

**Step 3: Reduce `max_tokens` in `website-chat.ts`**

In `src/lib/agent-tools/website-chat.ts`, change `max_tokens: 2048` to `max_tokens: 1024`.

**Step 4: Commit**

```bash
git add src/types/index.ts src/lib/painted-door-prompts.ts src/lib/agent-tools/website-chat.ts
git commit -m "fix: remove socialProofApproach, reduce advisor max_tokens to 1024"
```

---

### ✅ Task 8: Rewrite assembleSystemPrompt for 6-stage model

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/route.ts` (lines 23-110)

**Step 1: Rewrite the assembleSystemPrompt function**

Replace the `assembleSystemPrompt` function (lines 23-110) with:

```typescript
export async function assembleSystemPrompt(
  ideaId: string,
  mode: BuildMode,
): Promise<string> {
  // 1. Julian's advisor prompt
  const advisorPrompt = getAdvisorSystemPrompt('julian-shapiro');

  // 2. Landing Page Assembly framework
  const framework = getFrameworkPrompt('landing-page-assembly');

  // 3. Foundation documents
  const foundationDocsRecord = await getAllFoundationDocs(ideaId);
  const nonNullDocs = Object.values(foundationDocsRecord).filter(
    (d): d is NonNullable<typeof d> => d !== null && d !== undefined
  );

  let foundationSection: string;
  if (nonNullDocs.length === 0) {
    foundationSection = 'No foundation documents are available yet. Note which documents would be helpful and proceed with the information you have.';
  } else {
    foundationSection = nonNullDocs
      .map((doc) => `### ${doc.type} (updated ${doc.editedAt || doc.generatedAt})\n${doc.content}`)
      .join('\n\n');
  }

  // 4. Idea analysis / content context
  const ctx = await buildContentContext(ideaId);
  const idea = await getIdeaFromDb(ideaId);
  let ideaSection = '';
  if (idea) {
    ideaSection = `### Product\n- **Name:** ${idea.name}\n- **Description:** ${idea.description}\n- **Target User:** ${idea.targetUser}\n- **Problem Solved:** ${idea.problemSolved}`;
    if (idea.url) ideaSection += `\n- **URL:** ${idea.url}`;
  }
  if (ctx) {
    ideaSection += `\n\n### Keywords\n${ctx.topKeywords.map((k) => `- ${k.keyword} (${k.intentType})`).join('\n')}`;
    ideaSection += `\n\n### Competitors\n${ctx.competitors}`;
  }

  // 5. Current site state (for regeneration)
  const existingSite = await getPaintedDoorSite(ideaId);
  let siteSection = '';
  if (existingSite?.status === 'live') {
    siteSection = `\n\n## Existing Site\nThis is a REBUILD. An existing site is live at ${existingSite.siteUrl}.\nReview what exists and propose targeted changes vs. a full rebuild where appropriate.`;
  }

  // 6. Mode instruction (updated for 6 stages)
  const modeInstruction = mode === 'interactive'
    ? `## Mode: Interactive ("Build with me")
You are in interactive mode. Follow the 6-stage process. At every copy-producing stage (0, 1, 2a-2e, 3), you MUST pause and present your work for user feedback before continuing. You MUST call consult_advisor for the required advisors at each stage before presenting your synthesis.

When you finish a checkpoint step, end your message by describing what you've completed and what you'd like feedback on.`
    : `## Mode: Autonomous ("You've got this")
You are in autonomous mode. Run through all 6 stages continuously without stopping. You MUST still call consult_advisor for the required advisors at each stage. Narrate your progress as you go.`;

  // 7. Advisor roster
  const advisorsWithExpertise = advisorRegistry.filter((a) => a.evaluationExpertise);
  const advisorRoster = advisorsWithExpertise
    .map((a) => `- **${a.id}** (${a.name}): ${a.evaluationExpertise}`)
    .join('\n');

  return `${advisorPrompt}

${framework ? `## FRAMEWORK\n${framework}\n` : ''}
---

## Your Task

You are building a landing page for a product. Follow the Landing Page Assembly framework through all 6 stages. Use the foundation documents below as your source of truth. Fill gaps where docs don't specify exact values.

You MUST call consult_advisor for the required advisors at EVERY copy-producing stage before presenting your recommendation to the user. This is mandatory, not optional.

${modeInstruction}

## Content Quality Rules
- Never suggest, request, or generate social proof (testimonials, user counts, customer logos, case studies). The target users are pre-launch startups. Social proof does not exist and should never be referenced.
- Never use em dashes (-- or unicode em dash). Use periods, commas, colons, or semicolons instead.
- Keep each message concise. The user is reading a chat, not a report.
- Before finalizing any copy, check it against the AI slop blocklist in the framework. If any pattern appears, rewrite that sentence.

## Foundation Documents
${foundationSection}

## Product & Analysis
${ideaSection}
${siteSection}

## Available Advisors for Consultation
You MUST use the consult_advisor tool for the required advisors at each stage.
${advisorRoster}

## Build Tools
You have access to all website build tools (assemble_site_files, create_repo, push_files, etc.) plus consult_advisor. Use them when you reach the appropriate step.

## Output
Respond conversationally. When you use a tool, explain what you're doing and why. When consulting an advisor, do NOT paraphrase their response. Their response appears as a separate message bubble.`;
}
```

> **Behavior change:** The system prompt now references 6 stages instead of 8, makes advisor consultation mandatory instead of optional, and includes content quality rules. The mode instruction references stages 0-3 instead of steps 1, 3, 4, 6.

**Step 2: Commit**

```bash
git add src/app/api/painted-door/[id]/chat/route.ts
git commit -m "feat: rewrite assembleSystemPrompt for 6-stage model with mandatory advisors"
```

---

### ✅ Task 9: Rewrite step advancement and advisor enforcement

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/route.ts` (lines 373-415, and continue signal handling at lines 165-175)

**Step 1: Replace `TOOL_COMPLETES_STEP` mapping**

Replace the existing `TOOL_COMPLETES_STEP` (lines 373-388) with:

```typescript
const TOOL_COMPLETES_STEP: Record<string, number> = {
  get_idea_context: 0,        // Extract & Validate Ingredients
  // Steps 0-3 are copy-producing — advanced via frontend continue signals + advisor enforcement
  assemble_site_files: 4,     // Build & Deploy
  create_repo: 4,             // Build & Deploy
  push_files: 4,              // Build & Deploy
  create_vercel_project: 4,   // Build & Deploy
  trigger_deploy: 4,          // Build & Deploy
  check_deploy_status: 4,     // Build & Deploy
  verify_site: 5,             // Verify
  finalize_site: 5,           // Verify
};
```

> **Behavior change:** Removed `design_brand` (step 1 no longer exists), `evaluate_brand`/`validate_code` (Pressure Test eliminated), `consult_advisor` (no longer triggers step advancement directly). Build & Deploy is now step 4 (was 6). Verify is now step 5 (was 7).

**Step 2: Replace `advanceSessionStep` function**

Replace the existing `advanceSessionStep` (lines 394-415) with:

First, update the existing import at the top of `route.ts` (around line 19) to include `REQUIRED_ADVISORS_PER_STAGE`:
```typescript
// Find the existing line: import { WEBSITE_BUILD_STEPS } from '@/types';
// Replace with:
import { WEBSITE_BUILD_STEPS, REQUIRED_ADVISORS_PER_STAGE } from '@/types';
```

Then replace the `advanceSessionStep` function:

```typescript
export function advanceSessionStep(
  session: BuildSession,
  toolNames: string[],
): void {
  let maxStep = -1;

  for (const name of toolNames) {
    const step = TOOL_COMPLETES_STEP[name];
    if (step === undefined) continue;
    if (step > maxStep) maxStep = step;
  }

  if (maxStep > session.currentStep) {
    // Mark all intermediate steps complete
    for (let i = 0; i <= maxStep && i < session.steps.length; i++) {
      session.steps[i].status = 'complete';
    }
    session.currentStep = maxStep;
    // Mark next step active if it exists
    if (maxStep + 1 < session.steps.length) {
      session.steps[maxStep + 1].status = 'active';
    }
  }
}

/** Track which advisors were called in this round */
export function trackAdvisorCall(session: BuildSession, advisorId: string): void {
  if (!session.advisorCallsThisRound) {
    session.advisorCallsThisRound = [];
  }
  if (!session.advisorCallsThisRound.includes(advisorId)) {
    session.advisorCallsThisRound.push(advisorId);
  }
}

/** Check if required advisors have been consulted for the current stage.
 *  Returns null if requirements met, or a message string if not. */
export function checkAdvisorRequirements(session: BuildSession): string | null {
  const stageKey = session.currentStep === 2
    ? `2${String.fromCharCode(97 + session.currentSubstep)}` // "2a", "2b", etc.
    : String(session.currentStep);

  const required = REQUIRED_ADVISORS_PER_STAGE[stageKey];
  if (!required) return null; // No requirements for this stage

  const called = session.advisorCallsThisRound || [];
  const missing = required.filter((id) => !called.includes(id));

  if (missing.length === 0) return null;
  return `You must consult the required advisors before presenting your recommendation. Missing: ${missing.join(', ')}.`;
}

/** Advance substep within step 2 (Write Page Sections).
 *  Returns true if all substeps are complete and step 2 should advance. */
export function advanceSubstep(session: BuildSession): boolean {
  if (session.currentStep !== 2) return false;

  session.currentSubstep += 1;
  session.advisorCallsThisRound = []; // Reset for new substep

  if (session.currentSubstep >= 5) {
    // All 5 substages complete — advance to step 3
    session.steps[2].status = 'complete';
    session.currentStep = 3;
    session.currentSubstep = 0;
    if (session.steps[3]) {
      session.steps[3].status = 'active';
    }
    return true;
  }
  return false;
}
```

**Step 3: Update mode_select session initializer (lines 142-153)**

The session creation for `mode_select` must include the new fields. Replace lines 142-153:

```typescript
const session: BuildSession = {
  ideaId,
  mode: body.mode,
  currentStep: 0,
  currentSubstep: 0,
  steps: WEBSITE_BUILD_STEPS.map((s) => ({
    name: s.name,
    status: 'pending' as const,
  })),
  artifacts: {},
  advisorCallsThisRound: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
```

**Step 4: Update continue signal handling**

Update the continue signal handler (around lines 165-175) to support substep advancement and reset advisor tracking:

```typescript
if (body.type === 'continue') {
  // Handle substep advancement within step 2
  if (body.substep !== undefined && session.currentStep === 2) {
    session.currentSubstep = body.substep;
    session.advisorCallsThisRound = [];
  } else if (body.step !== undefined && body.step > session.currentStep) {
    for (let i = 0; i <= body.step && i < session.steps.length; i++) {
      session.steps[i].status = 'complete';
    }
    session.currentStep = body.step;
    session.currentSubstep = 0;
    session.advisorCallsThisRound = [];
    if (body.step + 1 < session.steps.length) {
      session.steps[body.step + 1].status = 'active';
    }
  }
  await saveBuildSession(ideaId, session);
  // Push continue message to history...
}
```

**Step 4: Add advisor tracking in the agent loop**

In the agent loop where `consult_advisor` tool calls are processed (around lines 323-333), add tracking. Also handle advisor call failures gracefully — if the tool result is an error, still track the advisor (to prevent enforcement loops) but do NOT inject the advisor markers:

```typescript
if (toolUseBlocks[i].name === 'consult_advisor') {
  const advisorId = toolUseBlocks[i].input.advisorId as string;

  if (!toolResults[i].is_error) {
    trackAdvisorCall(session, advisorId);
    // ... existing marker injection code ...
  } else {
    // Track as called (prevent enforcement loop) but skip marker injection.
    // The advisor response won't appear as a bubble — Julian continues without it.
    trackAdvisorCall(session, advisorId);
    console.warn(`Advisor ${advisorId} call failed. Proceeding without their input.`);
  }
}
```

**Step 5: Add advisor enforcement check after each round**

After the tool execution loop completes each round, before emitting the signal, check advisor requirements. Use a retry counter (max 2) to prevent infinite loops if the LLM ignores enforcement:

```typescript
// At the top of the agent loop (before the while loop), initialize:
let advisorEnforcementRetries = 0;

// After tool execution, check if advisor requirements are met
const advisorCheck = checkAdvisorRequirements(session);
if (advisorCheck && session.currentStep <= 3 && advisorEnforcementRetries < 2) {
  advisorEnforcementRetries++;
  // Force another LLM turn with enforcement message
  history.push({ role: 'user', content: advisorCheck, timestamp: new Date().toISOString() });
  continue; // Continue the agent loop
}
// If enforcement retries exhausted, allow the stream to proceed with a warning
if (advisorCheck && advisorEnforcementRetries >= 2) {
  console.warn(`Advisor enforcement exhausted after ${advisorEnforcementRetries} retries at step ${session.currentStep}. Proceeding without full advisor coverage.`);
}
```

**Step 6: Commit**

```bash
git add src/app/api/painted-door/[id]/chat/route.ts
git commit -m "feat: rewrite step advancement with substep tracking and advisor enforcement"
```

---

### ✅ Task 10: Rewrite determineStreamEndSignal for 6-stage model

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/route.ts` (lines 417-452)

**Step 1: Replace determineStreamEndSignal**

Replace the existing function with:

```typescript
export function determineStreamEndSignal(session: BuildSession): StreamEndSignal {
  const stepConfig = WEBSITE_BUILD_STEPS[session.currentStep];

  // Complete: last step is done
  if (session.currentStep >= session.steps.length - 1 && session.steps[session.currentStep]?.status === 'complete') {
    return {
      action: 'complete',
      result: {
        siteUrl: session.artifacts.siteUrl || '',
        repoUrl: session.artifacts.repoUrl || '',
      },
    };
  }

  // Poll: Build & Deploy step (check by name, not index)
  if (stepConfig?.name === 'Build & Deploy') {
    return {
      action: 'poll',
      step: session.currentStep,
      pollUrl: `/api/painted-door/${session.ideaId}`,
    };
  }

  // Checkpoint: interactive mode at a checkpoint step
  if (session.mode === 'interactive' && stepConfig?.checkpoint) {
    // For substages within step 2, emit checkpoint at each substep boundary
    if (session.currentStep === 2) {
      const substageNames = ['Problem Awareness', 'Features', 'How It Works', 'Target Audience', 'Objection Handling'];
      return {
        action: 'checkpoint',
        step: session.currentStep,
        substep: session.currentSubstep,
        prompt: `Stage 2${String.fromCharCode(97 + session.currentSubstep)}: ${substageNames[session.currentSubstep] || 'Section'} is ready for your review.`,
      };
    }
    return {
      action: 'checkpoint',
      step: session.currentStep,
      prompt: `${stepConfig.name} is ready for your review.`,
    };
  }

  // Continue: autonomous mode or non-checkpoint step
  return {
    action: 'continue',
    step: session.currentStep,
  };
}
```

> **Behavior change:** The `complete` signal now includes `repoUrl` in addition to `siteUrl`. The `poll` check uses step name instead of hardcoded index 6 (now index 4). Checkpoint signals include optional `substep` field for stage 2 substages.

**Step 2: Commit**

```bash
git add src/app/api/painted-door/[id]/chat/route.ts
git commit -m "feat: rewrite determineStreamEndSignal for 6-stage + substep model"
```

---

### ✅ Task 11: Update all backend tests for 6-stage model

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts`
- Modify: `src/lib/__tests__/consult-advisor.test.ts`

This task updates all existing tests that reference the old 8-stage model. The goal is to get all tests passing again.

**Step 1: Update the `makeBuildSession` helper**

In `route.test.ts`, update `makeBuildSession` (around line 784):

```typescript
function makeBuildSession(overrides: Partial<BuildSession> = {}): BuildSession {
  return {
    ideaId: 'idea-1',
    mode: 'interactive',
    currentStep: 0,
    currentSubstep: 0,
    steps: WEBSITE_BUILD_STEPS.map((s) => ({ name: s.name, status: 'pending' as const })),
    artifacts: {},
    advisorCallsThisRound: [],
    createdAt: '2026-02-17T00:00:00Z',
    updatedAt: '2026-02-17T00:00:00Z',
    ...overrides,
  };
}
```

**Step 2: Update all inline session mocks**

Every `getBuildSession` mock that creates a session object needs `currentSubstep: 0` and `advisorCallsThisRound: []`. Search for all `mockResolvedValue({` calls that include `currentStep` and add the missing fields. There are approximately 15-20 such mocks across the test file.

**Step 3: Update `advanceSessionStep` tests**

Replace the existing `describe('advanceSessionStep')` block with tests for the new behavior:

```typescript
describe('advanceSessionStep', () => {
  it('advances step when tool maps to higher step', () => {
    const session = makeBuildSession({ currentStep: 0 });
    advanceSessionStep(session, ['assemble_site_files']);
    expect(session.currentStep).toBe(4); // Build & Deploy
  });

  it('does not move backward', () => {
    const session = makeBuildSession({ currentStep: 3 });
    advanceSessionStep(session, ['get_idea_context']); // step 0
    expect(session.currentStep).toBe(3); // unchanged
  });

  it('ignores unknown tools', () => {
    const session = makeBuildSession({ currentStep: 0 });
    advanceSessionStep(session, ['unknown_tool']);
    expect(session.currentStep).toBe(0);
  });

  it('does not advance on consult_advisor (tracked separately)', () => {
    const session = makeBuildSession({ currentStep: 1 });
    advanceSessionStep(session, ['consult_advisor']);
    expect(session.currentStep).toBe(1); // unchanged
  });

  it('marks intermediate steps complete when jumping', () => {
    const session = makeBuildSession({ currentStep: 0 });
    advanceSessionStep(session, ['create_repo']);
    expect(session.currentStep).toBe(4);
    for (let i = 0; i <= 4; i++) {
      expect(session.steps[i].status).toBe('complete');
    }
    expect(session.steps[5].status).toBe('active');
  });

  it('does not set active beyond steps array bounds', () => {
    const session = makeBuildSession({ currentStep: 4 });
    advanceSessionStep(session, ['finalize_site']);
    expect(session.currentStep).toBe(5);
    expect(session.steps[5].status).toBe('complete');
  });
});
```

**Step 4: Add tests for new advisor enforcement functions**

```typescript
import { trackAdvisorCall, checkAdvisorRequirements, advanceSubstep } from '../route';

describe('trackAdvisorCall', () => {
  it('adds advisor ID to tracking list', () => {
    const session = makeBuildSession();
    trackAdvisorCall(session, 'shirin-oreizy');
    expect(session.advisorCallsThisRound).toContain('shirin-oreizy');
  });

  it('does not duplicate advisor IDs', () => {
    const session = makeBuildSession();
    trackAdvisorCall(session, 'copywriter');
    trackAdvisorCall(session, 'copywriter');
    expect(session.advisorCallsThisRound).toHaveLength(1);
  });

  it('initializes tracking array if missing', () => {
    const session = makeBuildSession();
    session.advisorCallsThisRound = undefined;
    trackAdvisorCall(session, 'april-dunford');
    expect(session.advisorCallsThisRound).toEqual(['april-dunford']);
  });
});

describe('checkAdvisorRequirements', () => {
  it('returns null when all required advisors are called', () => {
    const session = makeBuildSession({ currentStep: 0 });
    session.advisorCallsThisRound = ['april-dunford', 'copywriter'];
    expect(checkAdvisorRequirements(session)).toBeNull();
  });

  it('returns message listing missing advisors', () => {
    const session = makeBuildSession({ currentStep: 0 });
    session.advisorCallsThisRound = ['april-dunford']; // missing copywriter
    const result = checkAdvisorRequirements(session);
    expect(result).toContain('copywriter');
  });

  it('returns null for non-copy-producing stages', () => {
    const session = makeBuildSession({ currentStep: 4 }); // Build & Deploy
    expect(checkAdvisorRequirements(session)).toBeNull();
  });

  it('uses substep key for step 2', () => {
    const session = makeBuildSession({ currentStep: 2, currentSubstep: 1 }); // 2b: Features
    session.advisorCallsThisRound = ['copywriter', 'oli-gardner'];
    expect(checkAdvisorRequirements(session)).toBeNull();
  });

  it('detects missing advisors for substep 2d', () => {
    const session = makeBuildSession({ currentStep: 2, currentSubstep: 3 }); // 2d: Target Audience
    session.advisorCallsThisRound = ['shirin-oreizy']; // missing april-dunford
    const result = checkAdvisorRequirements(session);
    expect(result).toContain('april-dunford');
  });
});

describe('advanceSubstep', () => {
  it('increments substep within step 2', () => {
    const session = makeBuildSession({ currentStep: 2, currentSubstep: 0 });
    const completed = advanceSubstep(session);
    expect(completed).toBe(false);
    expect(session.currentSubstep).toBe(1);
  });

  it('resets advisor tracking on substep advance', () => {
    const session = makeBuildSession({ currentStep: 2, currentSubstep: 0 });
    session.advisorCallsThisRound = ['shirin-oreizy', 'copywriter'];
    advanceSubstep(session);
    expect(session.advisorCallsThisRound).toEqual([]);
  });

  it('completes step 2 when all 5 substeps are done', () => {
    const session = makeBuildSession({ currentStep: 2, currentSubstep: 4 });
    session.steps[2].status = 'active';
    const completed = advanceSubstep(session);
    expect(completed).toBe(true);
    expect(session.currentStep).toBe(3);
    expect(session.steps[2].status).toBe('complete');
    expect(session.steps[3].status).toBe('active');
  });

  it('does nothing for non-step-2 stages', () => {
    const session = makeBuildSession({ currentStep: 1 });
    const completed = advanceSubstep(session);
    expect(completed).toBe(false);
  });
});
```

**Step 5: Update `determineStreamEndSignal` tests**

```typescript
describe('determineStreamEndSignal', () => {
  it('returns checkpoint for interactive mode at checkpoint step', () => {
    const session = makeBuildSession({ currentStep: 0 });
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('checkpoint');
    expect(signal).toHaveProperty('step', 0);
  });

  it('returns continue for autonomous mode even at checkpoint step', () => {
    const session = makeBuildSession({ mode: 'autonomous', currentStep: 0 });
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('continue');
  });

  it('returns poll for Build & Deploy step (step 4)', () => {
    const session = makeBuildSession({ currentStep: 4 });
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('poll');
    expect(signal).toHaveProperty('pollUrl', '/api/painted-door/idea-1');
  });

  it('returns complete when last step is complete', () => {
    const session = makeBuildSession({ currentStep: 5 });
    session.steps[5].status = 'complete';
    session.artifacts.siteUrl = 'https://example.vercel.app';
    session.artifacts.repoUrl = 'https://github.com/user/repo';
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('complete');
    if (signal.action === 'complete') {
      expect(signal.result.siteUrl).toBe('https://example.vercel.app');
      expect(signal.result.repoUrl).toBe('https://github.com/user/repo');
    }
  });

  it('does not return complete when last step is NOT complete', () => {
    const session = makeBuildSession({ currentStep: 5 });
    const signal = determineStreamEndSignal(session);
    expect(signal.action).not.toBe('complete');
  });

  it('returns checkpoint with substep info for step 2', () => {
    const session = makeBuildSession({ currentStep: 2, currentSubstep: 2 });
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('checkpoint');
    if (signal.action === 'checkpoint') {
      expect(signal.substep).toBe(2);
      expect(signal.prompt).toContain('2c');
      expect(signal.prompt).toContain('How It Works');
    }
  });

  it('returns continue for autonomous mode at checkpoint step', () => {
    const session = makeBuildSession({ mode: 'autonomous', currentStep: 3 });
    const signal = determineStreamEndSignal(session);
    expect(signal.action).toBe('continue');
  });
});
```

**Step 6: Update `assembleSystemPrompt` tests**

Update the existing `assembleSystemPrompt` tests to check for new content:
- Change `expect(prompt).toContain('checkpoint')` to verify 6-stage language
- Add test for content quality rules: `expect(prompt).toContain('social proof')` and `expect(prompt).toContain('em dash')`
- Update mode instruction checks: interactive should mention "6 stages", autonomous should mention "6 stages"

**Step 7: Update step advancement integration tests**

The test `'advances session when design_brand tool is called'` should be removed (no more `design_brand` tool in step mapping). Replace with a test for `assemble_site_files` advancing to step 4.

**Step 8: Add missing test cases from design testing strategy**

Add these additional test cases to cover gaps identified in the design doc's testing strategy:

```typescript
describe('out-of-order substep handling', () => {
  it('ignores substep continue signals when not at step 2', () => {
    const session = makeBuildSession({ currentStep: 1 });
    // Simulate a stale substep continue signal arriving for step 2
    const result = advanceSubstep(session);
    expect(result).toBe(false);
    expect(session.currentStep).toBe(1); // unchanged
  });
});

describe('advisor enforcement edge cases', () => {
  it('enforcement retry counter resets between stages', () => {
    // When moving to a new stage, the enforcement counter should not carry over
    const session = makeBuildSession({ currentStep: 0 });
    session.advisorCallsThisRound = [];
    const check1 = checkAdvisorRequirements(session);
    expect(check1).not.toBeNull(); // missing advisors

    // Simulate advancing to next stage
    session.currentStep = 1;
    session.advisorCallsThisRound = [];
    const check2 = checkAdvisorRequirements(session);
    expect(check2).not.toBeNull(); // missing advisors for new stage
    expect(check2).toContain('shirin-oreizy'); // stage 1 requires shirin
  });

  it('returns null for stages without advisor requirements (step 4, 5)', () => {
    const session4 = makeBuildSession({ currentStep: 4 });
    expect(checkAdvisorRequirements(session4)).toBeNull();

    const session5 = makeBuildSession({ currentStep: 5 });
    expect(checkAdvisorRequirements(session5)).toBeNull();
  });
});

describe('session initialization', () => {
  it('mode_select creates session with currentSubstep 0 and empty advisorCallsThisRound', () => {
    // This test verifies the session created by mode_select has the new fields.
    // The actual POST handler test should verify this. Add assertion to existing
    // mode_select integration test:
    // expect(savedSession.currentSubstep).toBe(0);
    // expect(savedSession.advisorCallsThisRound).toEqual([]);
  });
});
```

**Step 9: Run tests**

Run: `npm test`
Expected: All tests PASS

**Step 10: Commit**

```bash
git add src/app/api/painted-door/[id]/chat/__tests__/route.test.ts
git commit -m "test: update all backend tests for 6-stage model with advisor enforcement"
```

---

### ✅ Task 12: Update frontend for 6-stage model

**Files:**
- Modify: `src/app/website/[id]/build/page.tsx`

**Step 1: Update React import (line 3)**

The existing import is missing `useMemo`. Update:
```typescript
// Find: import { useEffect, useState, useRef } from 'react';
// Replace with:
import { useEffect, useState, useRef, useMemo } from 'react';
```

**Step 2: Update `STEP_DESCRIPTIONS` (lines 12-21)**

Replace with:

```typescript
const STEP_DESCRIPTIONS = [
  'Extract value props, validate with advisors',        // 0 — Extract & Validate
  'Draft headline, subhead, CTA with advisor input',    // 1 — Write Hero
  'Problem, features, how-it-works, audience, CTA',     // 2 — Write Page Sections
  'Coherence check across all locked sections',         // 3 — Final Review
  'Generate code, deploy to Vercel',                    // 4 — Build & Deploy
  'Check live site, final polish',                      // 5 — Verify
];
```

**Step 3: Fix status bar sync (derive currentStep from steps array)**

Remove the `currentStep` state variable (line 38):
```typescript
// REMOVE: const [currentStep, setCurrentStep] = useState(0);
```

Add a derived value instead:
```typescript
const derivedStep = useMemo(() => {
  const activeIdx = steps.findIndex((s) => s.status === 'active');
  return activeIdx >= 0 ? activeIdx : steps.filter((s) => s.status === 'complete').length;
}, [steps]);
```

Replace all references to `currentStep` with `derivedStep` throughout the component, EXCEPT where `setCurrentStep` was called. Those `setCurrentStep` calls should be replaced with `updateStepStatus` calls that set the appropriate step statuses (which will cause `derivedStep` to recalculate).

**Step 4: Fix polling closure (use signal-based ref)**

Add refs to track the latest signal step and current substep:
```typescript
const lastSignalStepRef = useRef(0);
const currentSubstepRef = useRef(0);
```

In `handleSignal`, update the ref:
```typescript
function handleSignal(signal: StreamEndSignal) {
  lastSignalStepRef.current = signal.step ?? derivedStep;
  // ... rest of handler
}
```

In `startPolling`, use the ref instead of closing over state:
```typescript
function startPolling() {
  pollRef.current = setInterval(async () => {
    // ...
    if (data.status === 'complete') {
      streamResponse({ type: 'continue', step: lastSignalStepRef.current + 1 });
    }
  }, 3000);
}
```

**Step 5: Add substage progress indicator for stage 2**

Add a substage indicator that shows progress through the 5 substages when step 2 is active. In the sidebar `StepItem` for step 2, add:

```typescript
const SUBSTAGE_LABELS = ['Problem Awareness', 'Features', 'How It Works', 'Target Audience', 'Objection Handling'];
```

When step 2 is active, render a mini-progress row below the step name showing which substage is current. Update `currentSubstepRef.current` from the last checkpoint signal's `substep` field in `handleSignal`:

```typescript
// In handleSignal, when a checkpoint signal for step 2 arrives:
if (signal.action === 'checkpoint' && signal.substep !== undefined) {
  currentSubstepRef.current = signal.substep;
}
```

**Step 6: Update step reconciliation**

Add reconciliation on session load (around line 80) — force any step at index < derivedStep to `'complete'` if it's still showing `'active'`:

```typescript
// After loading session, reconcile step statuses
if (data.buildSession) {
  const loadedSteps = data.buildSession.steps;
  const activeIdx = loadedSteps.findIndex((s) => s.status === 'active');
  if (activeIdx >= 0) {
    for (let i = 0; i < activeIdx; i++) {
      if (loadedSteps[i].status !== 'complete') {
        loadedSteps[i].status = 'complete';
      }
    }
  }
  setSteps(loadedSteps);
}
```

**Step 7: Update status bar step count**

In the status bar (lines 622-630), change `8` to `steps.length` and use `derivedStep` instead of `currentStep`:
```typescript
Step {Math.min(derivedStep + 1, steps.length)} of {steps.length}
```

**Step 8: Update mode-select UI (lines 424, 453, 465-480)**

The mode-select screen references "8 steps" and has 8-item step pill arrays. Update:
- Change any "8 steps" text to "6 stages"
- Update the step pill arrays from 8 items to 6 items matching `WEBSITE_BUILD_STEPS`
- Update any preview/description text that references the old stage names

**Step 9: Handle substep continue signals**

When the user approves a substage checkpoint, send a continue signal with the substep:

```typescript
// In the "Continue" button handler for stage 2 substage checkpoints:
streamResponse({ type: 'continue', step: 2, substep: currentSubstepRef.current + 1 });
```

**Step 10: Commit**

```bash
git add src/app/website/[id]/build/page.tsx
git commit -m "feat: update frontend for 6-stage model with derived step and substage progress"
```

---

### ✅ Task 13: Integrate AdvisorStreamParser in frontend streaming

**Files:**
- Modify: `src/app/website/[id]/build/page.tsx`

**Step 1: Replace post-stream segment parsing with incremental parser**

Import the `AdvisorStreamParser`:
```typescript
import { AdvisorStreamParser } from '@/lib/parse-advisor-segments';
```

In `streamResponse`, instead of accumulating all text and parsing at the end, create an `AdvisorStreamParser` instance that emits segments as they complete:

```typescript
// Inside streamResponse, before the stream loop:
const segments: StreamSegment[] = [];
const parser = new AdvisorStreamParser((seg) => {
  segments.push(seg);
  // Update messages state to add completed segments as separate bubbles
  // ...real-time update logic...
});

// During the stream loop, push each chunk to the parser:
parser.push(chunkText);

// After stream ends:
parser.flush();
```

The existing post-stream `parseStreamSegments` call (lines 192-208) should be replaced with the segments already collected by the parser. Keep the `parseStreamSegments` import for any backward compatibility needs.

**Step 2: Update message rendering for incremental advisor bubbles**

Instead of updating a single placeholder message during streaming and splitting at the end, the parser's callback should append new `ChatMessage` objects to the messages array as advisor segments complete. Julian text continues to update the current placeholder; advisor segments create new entries.

**Step 3: Wire copy quality validation into the stream**

Import `validateCopyQuality` and run it on each completed segment's content. If flags are found, add a visual indicator (e.g., a subtle warning icon or muted text) on the message bubble to signal potential AI slop. This is an informational check for the developer/user — it does NOT block the stream.

```typescript
import { validateCopyQuality } from '@/lib/copy-quality';

// In the parser callback, after pushing a segment:
const flags = validateCopyQuality(seg.content);
if (flags.length > 0) {
  // Attach quality flags to the message for optional UI rendering
  console.warn(`Copy quality flags in ${seg.type} segment:`, flags.map(f => f.category));
}
```

> **Note:** Full UI rendering of copy quality flags is optional for v1. The `console.warn` provides developer visibility. If UI rendering is desired, add a `qualityFlags` field to the `ChatMessage` type and render a small indicator.

**Step 4: Commit**

```bash
git add src/app/website/[id]/build/page.tsx
git commit -m "feat: integrate AdvisorStreamParser for incremental advisor bubble rendering"
```

---

### ✅ Task 14: Update architecture documentation

**Files:**
- Modify: `docs/architecture.md`

**Step 1: Update the Website flow in the Primary User Flows diagram**

In the `Website` subgraph (around line 313-317), update:
```mermaid
D1c --> D1d["Chat-driven agent loop<br/>Julian Shapiro leads 6-stage build<br/>with mandatory consult_advisor"]
```

**Step 2: Update the Quick Reference tables**

Update the Agent Tools section to note that `consult_advisor` is now mandatory at every copy-producing stage, and that `design_brand` is removed from the step mapping.

**Step 3: Add a note about the 6-stage model**

Add a brief section or update the Website Agent description to mention: "6-stage build process with substages in stage 2, code-level advisor enforcement, and copy quality validation."

**Step 4: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: update architecture for 6-stage website builder model"
```

---

### ✅ Task 15: Full build and test verification

**Files:** None (verification only)

**Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests PASS with 0 failures

**Step 2: Run the production build**

Run: `npm run build`
Expected: Build succeeds with exit code 0. This catches TypeScript errors that vitest misses.

**Step 3: Run linting**

Run: `npm run lint`
Expected: No errors

**Step 4: If any verification fails, fix the issues and re-run**

This is the final quality gate. Every failure must be resolved before this task is marked complete.

**Step 5: Commit any fixes**

If fixes were needed:
```bash
git add -A
git commit -m "fix: resolve build/test/lint issues from 6-stage migration"
```

---

## Decision Log

### Summary

| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | Task ordering | Standalone modules first, types, then backend, then frontend | Big-bang single commit; interleaved backend/frontend |
| 2 | Broken test window | Accept broken tests between Tasks 4-10, fix all in Task 11 | Update tests alongside each code change; feature flags |
| 3 | `consult_advisor` no longer in TOOL_COMPLETES_STEP | Remove entirely; advisor calls tracked via separate `trackAdvisorCall` | Keep in mapping with new step number; use as advancement trigger with enforcement |
| 4 | Step reconciliation approach | Force stale `active` states to `complete` on load + derive step from array | Add explicit reconciliation API call; keep dual state with sync |
| 5 | Substep tracking location | `BuildSession.currentSubstep` field persisted to Redis | Separate Redis key; frontend-only tracking; encode in step index |

### Appendix: Decision Details

#### Decision 1: Task ordering
**Chose:** Standalone modules first (copy-quality, AdvisorStreamParser, visual-identity), then type changes, then backend route, then tests, then frontend.
**Why:** Standalone modules can be written and tested independently without breaking existing code. This lets early tasks produce green test suites and commits. The type changes are the "point of no return" that break downstream code, so they come after all standalone work is done. Backend and frontend are separated because they have no compile-time dependency on each other (they communicate via HTTP/JSON), so they can be updated independently.
**Alternatives rejected:**
- Big-bang single commit: Too large to review, debug, or revert if something goes wrong.
- Interleaved backend/frontend: Creates more broken intermediate states and harder-to-debug failures.

#### Decision 2: Broken test window
**Chose:** Accept that tests break between Tasks 4 (type changes) and 11 (test updates). The plan explicitly warns the executor not to run tests in this window.
**Why:** Updating tests alongside each code change would require duplicating the same test infrastructure updates across 6 tasks (each would need to update the `makeBuildSession` helper and session mocks). Consolidating test updates into one task is cleaner and avoids repeated merge conflicts on the test file. The feature branch provides safety.
**Alternatives rejected:**
- Feature flags to run old and new code in parallel: Over-engineering for a feature branch that will be merged atomically.
- Update tests in each task: High redundancy and merge conflict risk on the test file.

#### Decision 3: consult_advisor removal from TOOL_COMPLETES_STEP
**Chose:** Remove `consult_advisor` from the tool-to-step mapping entirely. Advisor calls are tracked via the new `trackAdvisorCall` function and enforced via `checkAdvisorRequirements`.
**Why:** In the old model, `consult_advisor` was mapped to step 5 (Advisor Review) with a gate at step 4. In the new model, advisor calls happen at EVERY copy-producing stage and should NOT advance the step. Step advancement for copy-producing stages is done via frontend `continue` signals after the user approves. Keeping `consult_advisor` in the mapping would conflate two concerns: advisor tracking (which advisors were called) and step advancement (which stage to move to).
**Alternatives rejected:**
- Keep in mapping with conditional logic: Adds complexity to an already complex function.
- Use as advancement trigger: Would cause premature step advancement before user approval.

#### Decision 4: Step reconciliation approach
**Chose:** Derive `currentStep` from the `steps` array (find first `active`, or count `complete` steps) + force stale `active` states to `complete` on session load.
**Why:** This eliminates the root cause of Bug 3 (status bar desync) by removing the separate `currentStep` state variable that could diverge from the `steps` array. The reconciliation on load handles Bug 2 (steps stuck "in progress") by cleaning up stale state.
**Alternatives rejected:**
- Explicit reconciliation API call: Adds network overhead and complexity for something that can be done client-side.
- Keep dual state with manual sync: This is exactly what caused the bug. Same approach would re-introduce the same bug.

#### Decision 5: Substep tracking location
**Chose:** `BuildSession.currentSubstep` as a field persisted to Redis alongside the session.
**Why:** The substep state must survive page refreshes and browser reconnections (the user might close and reopen the builder mid-stage-2). Persisting to Redis via the existing `saveBuildSession` call ensures consistency. The field is lightweight (single integer) and aligns with the existing `currentStep` pattern.
**Alternatives rejected:**
- Separate Redis key: Fragments session state across multiple keys, complicating load/save.
- Frontend-only tracking: Lost on page refresh, creating a confusing UX where progress resets.
- Encode in step index (e.g., step 2.3): Breaks the integer step index assumption throughout the codebase.
