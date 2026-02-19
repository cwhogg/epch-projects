# Fix Autonomous Mode Chain — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Fix the "You've got this" autonomous mode so the 6-stage website build actually progresses through all stages instead of stalling on step 1.

**Source Design Doc:** `N/A` — this is a bugfix identified via systematic debugging.

**Architecture:** Three bugs prevent autonomous mode from working: (1) the `streamingRef` concurrent-stream guard blocks the `handleSignal` → `streamResponse` chain because `handleSignal` is called inside the try block while `streamingRef.current` is still `true`; (2) the autonomous system prompt tells the LLM to "run through all 6 stages continuously" instead of processing one stage per HTTP request; (3) the no-signal fallback path dumps raw advisor tags into the message instead of parsing them.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest

---

## Bug Summary

| # | Bug | Location | Severity |
|---|-----|----------|----------|
| 1 | `streamingRef` guard blocks autonomous chain — `handleSignal` calls `streamResponse` while `streamingRef.current` is still true, so the call returns at line 162. The continue chain never fires. | `page.tsx:162,273,288,316` | Critical |
| 2 | System prompt says "run through all 6 stages continuously without stopping" — causes the LLM to produce all content in one massive response | `route.ts:74-75` | High |
| 3 | No-signal fallback dumps raw `fullText` with `<<<ADVISOR_START>>>` markers as one message | `page.tsx:277-282` | Medium |

---

### Task 1: Replace existing autonomous prompt test with a failing test (Bug 2)

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts:123-128`

**Step 1: Replace the entire `it(...)` block at lines 123-128**

The existing test is named `'includes mode instruction for autonomous with 6 stages'` and asserts `toContain('6 stages')`. This test must be **fully replaced** (not supplemented) because the old `toContain('6 stages')` assertion at line 126 will fail after the prompt change in Task 2. Delete the entire block and replace with:

```typescript
it('autonomous prompt scopes LLM to current stage only', async () => {
  const prompt = await assembleSystemPrompt('idea-1', 'autonomous');
  // Must tell LLM to do ONLY the current stage
  expect(prompt).toContain('current stage');
  // Must NOT tell LLM to run through all stages
  expect(prompt).not.toContain('all 6 stages');
  expect(prompt).not.toContain('without stopping');
  // Should still require advisor consultation
  expect(prompt).toContain('consult_advisor');
  expect(prompt).toContain('Narrate');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/api/painted-door/[id]/chat/__tests__/route.test.ts -t "autonomous prompt scopes"`
Expected: FAIL — current prompt contains "all 6 stages" and "without stopping"

---

### Task 2: Fix autonomous mode system prompt (Bug 2)

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/route.ts:74-75`

**Step 1: Update the autonomous mode instruction**

Replace lines 74-75:

```typescript
// OLD:
: `## Mode: Autonomous ("You've got this")
You are in autonomous mode. Run through all 6 stages continuously without stopping. You MUST still call consult_advisor for the required advisors at each stage. Narrate your progress as you go.`;

// NEW:
: `## Mode: Autonomous ("You've got this")
You are in autonomous mode. Complete ONLY the current stage. You will be automatically advanced to the next stage — do not attempt to work ahead. You MUST call consult_advisor for the required advisors at this stage before finishing. Narrate your progress as you go.`;
```

**Step 2: Run test to verify it passes**

Run: `npm test -- --run src/app/api/painted-door/[id]/chat/__tests__/route.test.ts -t "autonomous prompt scopes"`
Expected: PASS

**Step 3: Run full test suite to check for regressions**

Run: `npm test -- --run`
Expected: All tests pass. In particular, verify the old `toContain('6 stages')` assertion no longer exists (it was replaced in Task 1).

**Step 4: Commit**

```
git add src/app/api/painted-door/[id]/chat/route.ts src/app/api/painted-door/[id]/chat/__tests__/route.test.ts
git commit -m "fix: scope autonomous mode prompt to current stage only

The prompt told the LLM to 'run through all 6 stages continuously without
stopping', causing it to produce massive responses covering multiple stages
in one HTTP request. The client architecture expects one stage per request.
Now the prompt says 'complete ONLY the current stage'."
```

---

### Task 3: Fix streamingRef blocking autonomous chain (Bug 1)

No automated test — the `streamingRef` bug is in the React client (`page.tsx`) which has no test infrastructure. Verified via `npm run build` + manual testing (see Decision 4 and Post-Automation section).

**Files:**
- Modify: `src/app/website/[id]/build/page.tsx:308-317`

**Step 1: Defer `streamResponse` calls in `handleSignal` using `setTimeout`**

The `continue` case in `handleSignal` calls `streamResponse` while `streamingRef.current` is still `true` (we're inside the try block at line 273, before the finally at line 288). The call returns immediately at line 162.

Fix: wrap the `streamResponse` calls in `setTimeout(() => ..., 0)` so they execute after the current `streamResponse`'s finally block resets `streamingRef.current = false`.

Also store the timeout handle in a ref so it can be cancelled on unmount (see Step 2).

Replace the `continue` case (lines 308-317):

```typescript
// OLD:
case 'continue':
  // For substep advancement within step 2
  if (signal.step === 2 && currentSubstepRef.current < 4) {
    currentSubstepRef.current += 1;
    updateStepStatus(signal.step, 'active');
    streamResponse({ type: 'continue', step: 2, substep: currentSubstepRef.current });
  } else {
    updateStepStatus(signal.step, 'complete');
    streamResponse({ type: 'continue', step: signal.step + 1 });
  }
  break;

// NEW:
case 'continue':
  // For substep advancement within step 2
  if (signal.step === 2 && currentSubstepRef.current < 4) {
    currentSubstepRef.current += 1;
    updateStepStatus(signal.step, 'active');
    // Defer: streamingRef.current is still true inside the try block.
    // setTimeout lets the finally block reset it before the next stream starts.
    continueTimerRef.current = setTimeout(() => streamResponse({ type: 'continue', step: 2, substep: currentSubstepRef.current }), 0);
  } else {
    updateStepStatus(signal.step, 'complete');
    continueTimerRef.current = setTimeout(() => streamResponse({ type: 'continue', step: signal.step + 1 }), 0);
  }
  break;
```

**Step 2: Add `continueTimerRef` and clean it up on unmount**

Near the other refs (around lines 31-34 where `streamingRef`, `lastSignalStepRef`, `currentSubstepRef` are declared), add:

```typescript
const continueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

In the existing cleanup `useEffect` (around lines 78-82 where `pollRef` is cleaned up), add cleanup for the timer:

```typescript
// Inside the existing useEffect cleanup return:
return () => {
  if (pollRef.current) clearInterval(pollRef.current);
  if (continueTimerRef.current) clearTimeout(continueTimerRef.current);
};
```

**Step 3: Run full test suite**

Run: `npm test -- --run`
Expected: All tests pass (no backend test regressions from the client change)

**Step 4: Run build to verify no type errors**

Run: `npm run build`
Expected: Build succeeds (lesson from `docs/lessons-learned/` — always verify build, not just tests)

**Step 5: Commit**

```
git add src/app/website/[id]/build/page.tsx
git commit -m "fix: defer autonomous chain streamResponse calls with setTimeout

handleSignal is called inside streamResponse's try block, where
streamingRef.current is still true. The continue case's streamResponse
call returned immediately at the guard check (line 162). Using setTimeout
defers the call until the finally block resets streamingRef to false.
Added continueTimerRef with cleanup on unmount to prevent stale calls."
```

---

### Task 4: Fix no-signal fallback to parse advisor tags (Bug 3)

**Files:**
- Modify: `src/app/website/[id]/build/page.tsx:277-282`

> **Behavior change:** The fallback path now parses advisor tags into separate message bubbles instead of dumping raw text. Unlike the signal-present path (lines 245-254), copy quality validation (`validateCopyQuality`) is intentionally omitted here — the no-signal path is an error recovery path where flagging copy quality is not useful.

**Step 1: Parse advisor tags in the fallback path**

Replace lines 277-282:

```typescript
// OLD:
} else {
  // No signal — move streaming content to permanent messages
  setStreamingSegments([]);
  setMessages((prev) => [...prev, { role: 'assistant' as const, content: fullText, timestamp: new Date().toISOString() }]);
  setClientState('waiting_for_user');
}

// NEW:
} else {
  // No signal — still parse advisor tags before storing as messages
  const fallbackSegments: StreamSegment[] = [];
  const fallbackParser = new AdvisorStreamParser((seg) => fallbackSegments.push(seg));
  fallbackParser.push(fullText);
  fallbackParser.flush();

  const fallbackMessages = fallbackSegments.length > 0
    ? fallbackSegments.map((seg) => ({
        role: 'assistant' as const,
        content: seg.content,
        timestamp: new Date().toISOString(),
        ...(seg.type === 'advisor' ? {
          metadata: { advisorConsultation: { advisorId: seg.advisorId, advisorName: seg.advisorName } },
        } : {}),
      }))
    : [{ role: 'assistant' as const, content: fullText, timestamp: new Date().toISOString() }];

  setStreamingSegments([]);
  setMessages((prev) => [...prev, ...fallbackMessages]);
  setClientState('waiting_for_user');
}
```

Note: `StreamSegment` and `AdvisorStreamParser` are already imported at line 8 of this file. Verify the imports exist before proceeding.

**Step 2: Run build to verify no type errors**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```
git add src/app/website/[id]/build/page.tsx
git commit -m "fix: parse advisor tags in no-signal fallback path

When the stream ends without a __SIGNAL__ line, the fallback path dumped
raw fullText (including <<<ADVISOR_START>>> markers) as one message.
Now it uses AdvisorStreamParser to split into proper segments first.
Copy quality validation is intentionally omitted in this error recovery path."
```

---

### Task 5: Improve continue message with step name (minor enhancement)

**Files:**
- Modify: `src/app/api/painted-door/[id]/chat/route.ts:211-217`
- Modify: `src/app/api/painted-door/[id]/chat/__tests__/route.test.ts` (add test in the `Integration: full chat flow` describe block)

**Step 1: Write test for improved continue message**

Add a test inside the `Integration: full chat flow` describe block (where `setupDefaultMocks`, `mockStreamResponse`, `makeRequest`, and `paramsPromise` are defined):

```typescript
it('continue message includes step name for LLM context', async () => {
  // Setup mocks for step 1 (Write Hero)
  await setupDefaultMocks();
  const { getBuildSession, getConversationHistory, saveConversationHistory } = await import('@/lib/painted-door-db');
  const steps = WEBSITE_BUILD_STEPS.map((s) => ({ name: s.name, status: 'pending' as const }));
  steps[0].status = 'complete';
  (getBuildSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    ideaId: 'idea-1',
    mode: 'autonomous',
    currentStep: 0,
    currentSubstep: 0,
    steps,
    artifacts: {},
    advisorCallsThisRound: [],
    createdAt: '2026-02-17T00:00:00Z',
    updatedAt: '2026-02-17T00:00:00Z',
  });
  (getConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (saveConversationHistory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

  mockStreamResponse('Hero content here.');

  const request = makeRequest({ type: 'continue', step: 1 });
  await POST(request, paramsPromise);

  // The history save should contain a user message with the step name
  const savedHistory = (saveConversationHistory as ReturnType<typeof vi.fn>).mock.calls[0][1];
  const continueMsg = savedHistory.find((m: { role: string }) => m.role === 'user');
  expect(continueMsg.content).toContain('Write Hero');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/api/painted-door/[id]/chat/__tests__/route.test.ts -t "continue message includes step name"`
Expected: FAIL — current message is `Continue to the next step (step N).`

**Step 3: Update the continue message to include step name**

Replace lines 211-217 in `route.ts`:

```typescript
// OLD:
} else if (body.type === 'continue') {
  history.push({
    role: 'user',
    content: `Continue to the next step (step ${(body.step ?? session.currentStep) + 1}).`,
    timestamp: new Date().toISOString(),
  });
}

// NEW:
} else if (body.type === 'continue') {
  const stepIdx = body.step ?? session.currentStep;
  const stepName = WEBSITE_BUILD_STEPS[stepIdx]?.name ?? `step ${stepIdx + 1}`;
  history.push({
    role: 'user',
    content: `Continue. Now work on stage ${stepIdx + 1}: ${stepName}.`,
    timestamp: new Date().toISOString(),
  });
}
```

Note: `WEBSITE_BUILD_STEPS` is already imported at line 19 of route.ts.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/app/api/painted-door/[id]/chat/__tests__/route.test.ts -t "continue message includes step name"`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm test -- --run`
Expected: All tests pass

**Step 6: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 7: Commit**

```
git add src/app/api/painted-door/[id]/chat/route.ts src/app/api/painted-door/[id]/chat/__tests__/route.test.ts
git commit -m "fix: include step name in continue message for LLM context

Changed 'Continue to the next step (step N).' to
'Continue. Now work on stage N: Step Name.' so the LLM knows
exactly which stage to produce content for."
```

---

### Task 6: Final verification

**Step 1: Run full test suite**

Run: `npm test -- --run`
Expected: All tests pass, 0 failures

**Step 2: Run production build**

Run: `npm run build`
Expected: Build succeeds with exit 0

**Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

---

## Manual Steps (Post-Automation)

> Complete these steps after all tasks finish.

- [ ] **End-to-end manual test**: Run `npm run dev`, navigate to a website build page, select "You've got this" autonomous mode, and verify:
  1. The sidebar progress advances past step 1
  2. Each stage gets its own message bubble (not one huge message)
  3. Advisor responses appear in distinct bubbles (no raw `<<<ADVISOR_START>>>` tags)
  4. The build progresses through all 6 stages to completion
- [ ] **Deploy and verify on Vercel**: Push to main, wait for Vercel deployment, test on production

---

## Eval Scenarios

The system prompt change (Task 2) affects LLM behavior. Consider adding an eval scenario for the `advisor-chat` surface that verifies:
- Autonomous mode produces content for only the current stage (not all stages)
- Required advisors are consulted before the stage finishes

This is deferred — not blocking for this bugfix.

---

## Decision Log

### Summary
| # | Decision | Choice Made | Alternatives Considered |
|---|----------|------------|------------------------|
| 1 | How to fix streamingRef blocking | `setTimeout(..., 0)` deferral with `continueTimerRef` cleanup | Move flag reset before handleSignal, use React state + useEffect |
| 2 | How to scope autonomous prompt | "Complete ONLY the current stage" | Add step number to prompt, use separate prompts per step |
| 3 | Where to parse tags in fallback | Inline AdvisorStreamParser in fallback path | Extract shared helper, use parseStreamSegments instead |
| 4 | Whether to add page component tests | Skip — verify via build + manual test | Create full page test harness with React Testing Library |

### Appendix: Decision Details

#### Decision 1: streamingRef fix approach
**Chose:** `setTimeout(() => streamResponse(...), 0)` to defer the next stream call until after the finally block resets `streamingRef.current`. Store the timeout handle in `continueTimerRef` and cancel it in the component's cleanup `useEffect` to prevent stale calls after unmount.
**Why:** This is the minimal change that fixes the issue. The setTimeout ensures the JavaScript event loop processes the finally block (which resets `streamingRef = false`) before the new `streamResponse` call checks the guard. The `streamResponse` function re-arms the guard (`streamingRef.current = true`) immediately on entry, so there is no window for a third concurrent call. The `continueTimerRef` cleanup prevents the deferred call from running against an unmounted component.
**Alternatives rejected:**
- *Move `streamingRef.current = false` before `handleSignal` call:* This would allow the inner `streamResponse` to start, but then the outer finally block would reset `streamingRef = false` while the inner stream is in progress — potentially allowing a third concurrent stream.
- *Use React state + useEffect:* Would require a `pendingAction` state that a useEffect watches. More complex, more code, and introduces a render cycle delay. The setTimeout approach is simpler and more direct.

#### Decision 2: Autonomous prompt scoping
**Chose:** Replace "Run through all 6 stages continuously" with "Complete ONLY the current stage. You will be automatically advanced."
**Why:** The client architecture expects one stage per HTTP request. The `handleSignal` → `streamResponse` chain handles automatic progression. The LLM just needs to focus on one stage and trust the system to advance it. Saying "automatically advanced" prevents the LLM from trying to do future stages.
**Alternatives rejected:**
- *Add step number to prompt dynamically:* This would require passing the current step into `assembleSystemPrompt`. The function already receives `mode` but not step info. After Task 5 is implemented, the continue user message will include the step name (`Continue. Now work on stage N: Step Name.`), making dynamic prompt injection redundant.
- *Separate prompt templates per step:* Over-engineered for this fix. The framework document already describes each stage in detail.

#### Decision 3: Fallback tag parsing
**Chose:** Inline `AdvisorStreamParser` usage in the no-signal fallback path, mirroring the signal-present path above it.
**Why:** The code pattern is identical to lines 245-266 (the signal-present final parse). Duplicating the pattern keeps it local and readable. A shared helper would save ~10 lines but add indirection for a path that should rarely execute.
**Alternatives rejected:**
- *Extract shared `parseToMessages` helper:* Premature abstraction — only two call sites, and they differ slightly (signal path runs copy quality validation, fallback doesn't — see behavior change note in Task 4).
- *Use standalone `parseStreamSegments`:* The class-based `AdvisorStreamParser` is already imported and used in this file. Consistency with the existing code is more important than using the function-based alternative.

#### Decision 4: No page component tests
**Chose:** Skip creating a page component test harness. Verify the client-side fixes via `npm run build` (catches type errors) and manual testing.
**Why:** The page component has no existing tests. Creating a proper test harness would require mocking `fetch`, `ReadableStream`, React state, and the entire streaming pipeline — a significant effort orthogonal to this bugfix. The `setTimeout` fix is a 2-line change with clear semantics. The fallback parsing mirrors existing code. The build step catches type errors (lesson from `docs/lessons-learned/`), and the manual test in Post-Automation verifies runtime behavior. Note: `npm run build` does NOT verify the setTimeout deferral behavior at runtime — that requires the manual test.
**Alternatives rejected:**
- *Create full React Testing Library test file:* Would be the ideal long-term investment but is out of scope for this bugfix. Could be a follow-up task.
