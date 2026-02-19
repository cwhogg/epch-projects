# Website Builder: Advisor Integration & Stage Redesign

**Date:** 2026-02-18
**Status:** Draft
**Scope:** Restructure the website builder from 8 stages to 6, integrate advisor collaboration into every copy-producing stage, fix bugs, add content quality enforcement.

---

## Problem Statement

The current 8-stage website builder flow has several structural and UX issues:

1. Advisors are bolted on at the end (stages 5-6) instead of woven into each decision
2. Julian promises to consult advisors but skips the calls (prompt says "use when a decision falls outside your core expertise" -- too optional)
3. The Pressure Test stage revisits decisions (hero, CTA) that should already be locked
4. Message bubbles from different advisors render in the same bubble
5. Brand Identity shows "in progress" even after advancing past it
6. Bottom status bar desyncs from sidebar progress
7. Advisors suggest social proof for pre-launch startups
8. Responses are too long, especially in Pressure Test
9. Generated copy shows AI slop patterns (em dashes, filler phrases, vague intensifiers)

---

## New Stage Architecture

Replace the 8-stage flow with 6 stages. Advisor collaboration is mandatory at every copy-producing stage. Decisions are locked at each stage and never revisited.

### Stage 1: Extract & Validate Ingredients (checkpoint)

Julian pulls value props, hooks, features, and brand voice constraints from foundation docs. Before presenting to the user, he consults 2-3 relevant advisors to validate the pull is correct and complete.

**Required advisors:** April Dunford (positioning accuracy), copywriter (voice alignment)
**Optional advisor:** Shirin Oreizy (behavioral framing)

**Output:** Extracted ingredients with advisor validation. User approves. LOCKED.

### Stage 2: Write Hero (checkpoint)

Julian drafts headline, subheader, and CTA. He then consults Shirin (behavioral science) and the copywriter (brand voice) independently. Each advisor responds in their own message bubble. Julian synthesizes and presents recommendation.

**Required advisors:** Shirin Oreizy, copywriter
**Output:** Locked headline, subheader, CTA. Never revisited.

### Stage 3: Write Page Sections (5 substages, each a checkpoint)

Each substage follows the same advisor collaboration protocol as the hero.

| Substage | Section | Required Advisors | Optional |
|----------|---------|-------------------|----------|
| 3a | Problem Awareness | Shirin, copywriter | Joanna Wiebe |
| 3b | Features (3-6 blocks) | copywriter, Oli Gardner | -- |
| 3c | How It Works | copywriter | Oli Gardner |
| 3d | Target Audience | Shirin, April Dunford | -- |
| 3e | Objection Handling + Final CTA | Shirin, Joanna Wiebe | copywriter |

**Output:** All page sections locked individually per substage.

**Substage progression mechanics:** Substages advance via user "continue" signals, not tool calls. After the user approves substage 3a, the frontend sends `{ type: 'continue', step: 2, substep: 1 }` to advance to 3b. The backend tracks the current substep in `BuildSession.currentSubstep` (new field, integer, defaults to 0). `advanceSessionStep` advances substeps within stage 3 before advancing to stage 4. `determineStreamEndSignal` emits checkpoint signals at each substep boundary within stage 3. When all 5 substeps are complete, the parent step (stage 3) auto-completes and stage 4 becomes active.

### Stage 4: Final Review (checkpoint)

Concise coherence check across all locked sections. Julian reviews the complete page as a whole. Only surfaces issues if serious (e.g., a feature section undermines the hero's promise). If something requires reopening a locked section, it must be flagged with a clear reason.

**Output:** Either "looks coherent, ready to build" or a specific concern. Short -- no more than 200 words.

### Stage 5: Build & Deploy

Generate code from locked copy + visual design tokens from foundation docs. Deploy to Vercel. No interactive checkpoints.

### Stage 6: Verify

Check live site, final polish. Unchanged from current behavior.

---

## Advisor Collaboration Protocol

Every copy-producing stage (1, 2, 3a-3e) follows this exact sequence:

1. **Julian drafts.** Writes initial take based on locked ingredients and prior locked sections. Draft is NOT shown to user yet -- it's context for advisor calls.

2. **Advisor consultation (parallel).** Julian calls `consult_advisor` for each required advisor, passing his draft and asking for their independent take. Each advisor responds as a separate message bubble (via `<<<ADVISOR_START>>>` markers). User watches in real-time.

3. **Julian synthesizes (max 300 words).** Presents to user:
   - His recommendation incorporating advisor feedback
   - Points of agreement between advisors
   - Points of disagreement and why he sided with one
   - Top 2-3 alternatives

4. **User decides.** Approves recommendation, picks alternative, or provides direction. Section is LOCKED.

### Enforcement: Code-Level + Prompt-Level (Belt and Suspenders)

**Primary enforcement (code-level):** `advanceSessionStep` refuses to advance past a copy-producing stage (1, 2, 3a-3e) until the required number of `consult_advisor` tool calls have been detected in the current round. The backend tracks which advisor IDs were called per stage. A new `REQUIRED_ADVISORS_PER_STAGE` mapping specifies the minimum advisor calls needed:

```
Stage 1: ['april-dunford', 'copywriter'] (2 required)
Stage 2: ['shirin-oreizy', 'copywriter'] (2 required)
Stage 3a: ['shirin-oreizy', 'copywriter'] (2 required)
Stage 3b: ['copywriter', 'oli-gardner'] (2 required)
Stage 3c: ['copywriter'] (1 required)
Stage 3d: ['shirin-oreizy', 'april-dunford'] (2 required)
Stage 3e: ['shirin-oreizy', 'joanna-wiebe'] (2 required)
```

If Julian produces a checkpoint signal without having called the required advisors, the backend forces another LLM turn with a system message: "You must consult the required advisors before presenting your recommendation."

**Secondary enforcement (prompt-level):** System prompt states: "You MUST call consult_advisor for [specific advisors] before presenting your recommendation to the user."

### Advisor Call Failure Handling

When a `consult_advisor` call fails (API timeout, rate limit, malformed response):

1. **Retry once** with the same advisor and question.
2. **If retry fails:** Skip that advisor with a user-visible notice: "Could not reach [Advisor Name]. Proceeding with available input." Render as a system message bubble (distinct from Julian or advisor styling).
3. **Stage still locks** if at least one advisor responded successfully. If ALL required advisor calls fail, block the stage and surface an error: "Unable to consult any advisors. Please try again."
4. **UI rendering:** Failed advisor calls show a dimmed/gray bubble with the failure notice, not a broken or empty bubble.

---

## Content Quality Rules

### No Social Proof

System prompt rule: "Never suggest, request, or generate social proof (testimonials, user counts, customer logos, case studies). The target users are pre-launch startups. Social proof does not exist and should never be referenced."

Remove from landing-page-assembly framework:
- Step 4: "Gather social proof signals"
- Step 11: "Social proof strip"

Remove from brand identity JSON schema:
- `socialProofApproach` field

### No Em Dashes

System prompt rule: "Never use em dashes (--) in any generated copy, advisor responses, or chat messages. Use periods, commas, colons, or semicolons instead."

Apply to all advisor prompts in `src/lib/advisors/prompts/*.md`.

### AI Slop Prevention Blocklist

The following patterns are banned from all generated copy and chat messages:

**Filler openers:** "Great question!", "That's a great point", "Absolutely!", "I'd be happy to"

**Vague intensifiers:** "incredibly", "extremely", "absolutely", "truly", "remarkably", "fundamentally"

**Empty business jargon:** "leverage", "optimize", "empower", "revolutionize", "cutting-edge", "game-changing", "next-level", "best-in-class", "world-class", "state-of-the-art"

**Padded transitions:** "It's worth noting that", "It's important to understand", "At the end of the day", "In today's fast-paced world", "When it comes to"

**Hedging chains:** Stacking of hedging words ("it seems like it might potentially be")

**Sycophantic praise:** "Excellent choice!", "Love that idea!", "What a great approach!"

**Generic closers:** "Let me know if you have any questions", "Hope this helps!", "Feel free to reach out"

**Fake specificity:** "Studies show...", "Research suggests...", "Experts agree..." without citations

**Rhyming/alliterative marketing:** Forced tricolon patterns ("Simple, Scalable, Secure")

**Emoji overuse:** No emojis in copy unless brand voice explicitly calls for them

**Prompt-level instruction:** "Before finalizing any copy, check it against the AI slop blocklist. If any pattern appears, rewrite that sentence. Every word must earn its place. If a competitor could say the same thing, it's not specific enough."

**Post-processing validation (deterministic backup):** Add a `validateCopyQuality` function that runs regex checks against the blocklist on all generated copy before displaying to the user. This function checks Julian's text and each advisor's response. If blocklist patterns are detected, append a warning to the message: "[Copy quality flag: detected potentially generic phrasing]". This is a safety net, not a rewrite engine. The prompt instruction handles prevention; the post-processing catches what slips through.

### Response Length Limits

- Advisor responses: `max_tokens: 1024` (down from 2048)
- Julian's synthesis messages: max 300 words (prompt instruction)
- Overall agent: `max_tokens: 4096` stays, but prompt says "Keep each message concise. The user is reading a chat, not a report."

---

## Bug Fixes

### Bug 1: Advisor Responses in Same Message Bubble

**Root cause:** Advisor markers are parsed into separate bubbles only at stream end. During streaming, user sees raw text with markers combined in one bubble. Also, Julian sometimes paraphrases advisor responses in his own text instead of letting the tool injection handle it.

**Fix:**
1. **Incremental parsing with buffered marker detection:** During streaming, maintain a buffer of accumulated text. On each chunk arrival, check if the buffer contains a complete `<<<ADVISOR_END>>>` marker. When detected, flush the completed segment as a separate message bubble. Handle chunk-boundary splitting: if `<<<ADVISOR_STA` appears at the end of a chunk, hold it in the buffer until the next chunk completes or invalidates the marker. If the stream ends with an unclosed `<<<ADVISOR_START>>>` (no matching `<<<ADVISOR_END>>>`), collapse the unclosed segment into Julian's text (same fallback as current `parseStreamSegments`).
2. **Implementation approach:** Convert `parseStreamSegments` into a stateful streaming parser class `AdvisorStreamParser` with methods `push(chunk)` and `flush()`. `push` appends to internal buffer, emits completed segments via callback. `flush` is called at stream end to emit any remaining buffered text. The existing pure function stays for backward compatibility in non-streaming contexts.
3. **Prompt instruction:** "When you consult an advisor, do NOT repeat or paraphrase their response in your own message. The advisor's response appears as a separate message bubble automatically. After all advisor consultations, write your synthesis as a new message."

### Bug 2: Steps Stuck "In Progress"

**Root cause:** Session's `currentStep` advances but intermediate `steps[i].status` values may remain `active` if the corresponding tool was never called or errored.

**Fix:** On session load and after each signal update, reconcile the steps array: for any step at index < derived active step index, if `status !== 'complete'`, force it to `complete`. This uses the derived step value from Bug 3's fix. Also resolved by new 6-stage system removing Brand Identity as a separate stage.

### Bug 3: Bottom Status Bar Out of Sync

**Root cause:** `currentStep` state and `steps` state are updated independently and can diverge.

**Fix:** Remove separate `currentStep` state variable. Derive from `steps` array:
```
const activeIdx = steps.findIndex(s => s.status === 'active');
const derivedStep = activeIdx >= 0 ? activeIdx : steps.filter(s => s.status === 'complete').length;
```
Both sidebar and bottom bar read from same derived value.

**Polling closure fix:** The `startPolling` interval closure currently captures `currentStep`. With the derived approach, the polling continuation must read the step from the signal payload (which already carries the step index) rather than from component state. Change `streamResponse({ type: 'continue', step: currentStep + 1 })` to pass the step from the signal: `streamResponse({ type: 'continue', step: signal.step + 1 })`. Store the latest signal step in a ref (`lastSignalStepRef`) for the polling interval to read.

### Bug 4: Julian Not Calling Advisors

**Root cause:** System prompt makes advisor consultation optional ("use when a decision falls outside your core expertise").

**Fix:** Addressed by Advisor Collaboration Protocol's code-level enforcement. The backend refuses to advance past copy-producing stages until required advisor calls are detected.

---

## Updated Artifacts Schema

The `BuildSession.artifacts` object must be updated for the new 6-stage model:

```typescript
artifacts: {
  // Stage 1 output
  ingredients?: string;
  // Stage 2 output (locked hero)
  heroContent?: string;
  // Stage 3 outputs (locked per substage)
  substageContent?: {
    problemAwareness?: string;
    features?: string;
    howItWorks?: string;
    targetAudience?: string;
    objectionHandling?: string;
  };
  // Stage 4 output
  finalReviewResult?: string;
  // Stage 5 outputs
  siteUrl?: string;
  repoUrl?: string;
};
```

Removed fields: `brandIdentity` (visual identity now comes from foundation docs), `pressureTestResults` (Pressure Test stage eliminated), `reviewResults` (Advisor Review stage eliminated, replaced by per-stage advisor integration).

---

## Files to Modify

1. **`src/types/index.ts`** -- Replace `WEBSITE_BUILD_STEPS` with new 6-stage definition. Update `BuildSession` with `currentSubstep` field. Update `BuildSession.artifacts` schema (remove `brandIdentity`, `pressureTestResults`, `reviewResults`; add `substageContent`, `finalReviewResult`, `repoUrl`). Add `REQUIRED_ADVISORS_PER_STAGE` constant. Add `ChatRequestBody` substep field for continue signals.

2. **`src/app/api/painted-door/[id]/chat/route.ts`** -- Rewrite `assembleSystemPrompt` with new stage instructions, mandatory advisor calls, content quality rules, AI slop blocklist, response length caps. Update `TOOL_COMPLETES_STEP` mapping (remove `evaluate_brand`, `validate_code` entries for Pressure Test; remove `consult_advisor` entry since advisor calls no longer trigger step advancement). Add `REQUIRED_ADVISORS_PER_STAGE` enforcement in `advanceSessionStep`. Add substep tracking logic. Update `determineStreamEndSignal` to use name-based step check (`stepConfig.name === 'Build & Deploy'`) instead of hardcoded `session.currentStep === 6`. Add substep-level checkpoint signals. Remove the `consult_advisor` gating logic (`currentStep < 4` check on line 402).

3. **`src/lib/frameworks/prompts/landing-page-assembly/prompt.md`** -- Rewrite framework for 6 stages. Remove social proof steps (4, 11). Remove Pressure Test phase entirely. Add advisor collaboration protocol instructions per stage. Add AI slop blocklist. Ban em dashes.

4. **`src/lib/agent-tools/website-chat.ts`** -- Reduce `max_tokens` for advisor calls from 2048 to 1024.

5. **`src/app/website/[id]/build/page.tsx`** -- Update `STEP_DESCRIPTIONS` for 6 stages. Add substage progress indicator for stage 3. Fix status bar sync (derive step from steps array, use signal-based ref for polling). Add frontend step reconciliation. Create `AdvisorStreamParser` class for incremental bubble parsing during streaming.

6. **`src/lib/parse-advisor-segments.ts`** -- Add new `AdvisorStreamParser` class alongside existing `parseStreamSegments` function. Stateful parser with `push(chunk)` and `flush()` methods.

7. **`src/lib/painted-door-prompts.ts`** -- Remove `socialProofApproach` from brand identity JSON schema. Remove social proof references from all prompts.

8. **`src/lib/advisors/prompts/*.md`** -- Add "Never suggest social proof" and "Never use em dashes" to each advisor prompt. Reference AI slop blocklist.

9. **`src/lib/copy-quality.ts`** (new file) -- `validateCopyQuality` function for post-processing AI slop detection. Regex-based checks against the blocklist. Returns array of flagged patterns.

### Prerequisite Task: Add `visual-identity` Foundation Doc Type

Add `visual-identity` as a new `FoundationDocType`. This affects the following files and must be done as a separate task before the main builder redesign:

**Type/config changes:**
- `src/types/index.ts` -- Add `'visual-identity'` to `FoundationDocType` union and `FOUNDATION_DOC_TYPES` array
- `src/lib/foundation-deps.ts` -- Add `visual-identity` to `DOC_DEPENDENCIES`
- `src/lib/agent-tools/foundation.ts` -- Add to `DOC_ADVISOR_MAP`
- `src/lib/foundation-config.ts` -- Add label and generation config

**UI changes:**
- `src/app/project/[id]/page.tsx` -- Add to `FOUNDATION_LABELS`
- `src/app/foundation/page.tsx` -- Add to `DOC_LABELS`

**Test updates:**
- `src/lib/__tests__/foundation-types.test.ts` -- Update assertion from 6 to 7 document types
- `src/lib/__tests__/foundation-deps.test.ts` -- Add `visual-identity` dependency test

**Generation:** The visual-identity doc should be generated by the brand strategist agent (reuse existing `buildBrandIdentityPrompt` with `visualOnly = true`), producing colors, typography, and spacing tokens as structured content. If the visual-identity doc does not exist when the builder starts, fall back to generating it on-the-fly using `design_brand` tool (graceful degradation).

---

## Testing Strategy

- **Unit tests** for `advanceSessionStep` with new 6-stage + substage logic:
  - Substep advancement within stage 3 (3a -> 3b -> ... -> 3e)
  - Out-of-order substep completion (3c completes while 3b pending)
  - All substeps complete triggers parent stage completion
  - Code-level advisor enforcement: stage refuses to advance without required advisor calls
  - Stage advancement with partial advisor failures (1 of 2 succeeded)
- **Unit tests** for `determineStreamEndSignal` with new checkpoint patterns:
  - Substep-level checkpoints within stage 3
  - Name-based deploy polling check (not index-based)
- **Unit tests** for `AdvisorStreamParser`:
  - Complete marker in single chunk
  - Marker split across two chunks
  - Unclosed marker at stream end (fallback to julian text)
  - Multiple advisor segments in sequence
  - JSON metadata split across chunks
- **Unit tests** for `validateCopyQuality`:
  - Each blocklist category detected correctly
  - Clean text passes without false positives
  - Em dash detection
- **Unit test** for frontend step reconciliation (stale `active` states forced to `complete`)
- **Unit tests** for `consult_advisor` error handling:
  - API timeout returns retry then graceful skip
  - Rate limit returns user-visible notice
  - All advisors fail blocks the stage
- **Integration test** for `assembleSystemPrompt` verifying AI slop blocklist, no-social-proof, no-em-dash rules in output
- **Manual test** of full 6-stage flow: advisor bubbles appear separately, stages lock correctly, substage progress renders, code-level enforcement prevents advancement without advisor calls

---

## Decision Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| 6 stages (down from 8) | Pressure Test and Advisor Review are redundant when advisors are integrated per stage | Keep 8 stages; 5 stages (too compressed) |
| Substages in stage 3 with individual locks | Hero is a single decision; page sections are 5 distinct decisions needing separate locks. User confirmed preference for per-section approval. | Single approval for all sections; 2-3 grouped checkpoints |
| Code-level enforcement for mandatory advisor calls (primary) + prompt instruction (secondary) | Prompt-only enforcement already failed (Bug 4). Code-level enforcement via `advanceSessionStep` is deterministic and uses existing infrastructure (`TOOL_COMPLETES_STEP` pattern). Prompt instruction kept as a hint to guide LLM behavior. | Prompt-only enforcement (unreliable, same layer that already failed); code-only without prompt hint (LLM wouldn't know to make the calls) |
| Derive currentStep from steps array + signal-based ref for polling | Eliminates status bar desync at root. Polling closure reads from signal ref instead of stale state. | Sync two state variables (fragile); keep separate state with manual reconciliation |
| AI slop blocklist: prompt-level + deterministic post-processing | Prompt instruction handles prevention. Post-processing regex catches what slips through. Two layers are more reliable than one. | Prompt-only (probabilistic, will miss some); post-processing only (doesn't prevent generation, just flags after); fine-tuning (overkill for this use case) |
| Remove social proof entirely | Pre-launch startups never have it; even placeholder framing is misleading | Keep placeholder approach; make it optional |
| Incremental streaming parser as new class (not modifying existing function) | Existing `parseStreamSegments` is a pure function used in non-streaming contexts. New `AdvisorStreamParser` class handles stateful streaming separately. | Modify existing function to be stateful (breaks non-streaming callers); keep end-of-stream-only parsing (doesn't fix the UX issue) |
