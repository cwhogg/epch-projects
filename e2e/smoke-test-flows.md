# Smoke Test Flows

Natural language checklist for post-deploy smoke testing via Playwright MCP. Claude reads this file and executes each flow in the browser.

## How to Use

1. Push to main (Vercel auto-deploys)
2. Open Claude Code in the project directory
3. Tell Claude which URL to test:
   > "Smoke test the app at [URL]. Follow the flows in e2e/smoke-test-flows.md."
4. Claude reads this file, opens a browser via Playwright MCP, and executes each flow
5. Claude reports results conversationally — what worked, what broke, what looked off

**Quick scope:** Say "Run quick smoke tests" — run only `[QUICK]` tagged flows.
**Full scope:** Say "Run full smoke tests" — run all flows including interactive journeys.

---

## Prerequisites

**For all flows:** Navigate to `/analysis` first to confirm the app is responding and identify existing analyses. Note at least one analysis ID for use in flows G1, F1, and P1. If the leaderboard is empty, skip interactive flows that require existing data.

**For generation flows (G2, F1, P1):** These consume API credits (Anthropic, OpenAI). Only run against analyses that already have generated data. Verify the analysis has content/foundation/painted-door data before triggering generation. If data does not exist, skip the flow rather than triggering generation.

---

## When Things Go Wrong

If any flow encounters an unexpected state:
- **Error page or error toast:** Screenshot the page, report the error text, and move to the next flow.
- **Loading spinner that doesn't resolve:** Wait up to 120 seconds. If still loading, screenshot and report as timeout.
- **Empty state when data is expected:** Report what's missing and move on — this may indicate a data issue rather than a code bug.
- **Unexpected redirect:** Report the actual URL vs expected URL and continue.

Do not retry failed flows. Report failures as-is so they can be investigated.

---

## Quick Flows (render checks)

### C1: Home Page Load [QUICK]
- Navigate to the app URL
- Verify page renders with the main heading visible
- Verify 6 pipeline stage cards render (Ideation, Analysis, Website, Content, Testing, Optimization)
- Verify counts load (Website count should always be >= 2; Analysis count depends on data)
- Note the page load time

### C2: Analysis Leaderboard [QUICK]
- Navigate to `/analysis`
- Verify leaderboard section renders with ranked ideas (table on desktop, cards on mobile)
- Scroll down to "All Analyses" grid — verify score ring visualizations visible (Comp, WTP, Diff, SEO on each card)
- Verify new idea action button present (full "New Idea" text on desktop, `+` icon on mobile)
- Click into a top idea — verify redirect to `/analyses/{id}`

### C3: Content Dashboard [QUICK]
- Navigate to `/content`
- Verify content calendar cards render (or empty state if no calendars exist)
- Verify each card shows idea name, piece counts, target site
- Verify active/paused status visible

---

## Standard Flows (deeper render checks)

### C4: Website Dashboard
- Navigate to `/website`
- Verify site cards render (SecondLook, N of One always present, plus any painted door sites)
- Verify signup counts visible on cards
- Verify status badges (Live/Deploying/Generating/Pushing/Failed)

### C5: Testing Dashboard
- Navigate to `/testing`
- Verify program cards render with publish counts
- Verify analytics component loads without error

### C6: Foundation Hub
- Navigate to `/foundation`
- Verify idea cards render with progress bars and completion counts
- Verify doc type pills visible (Strategy, Positioning, Brand Voice, Design Principles, SEO Strategy, Social Media)

---

## Interactive Flows

### I1: Create New Idea
- Navigate to `/ideas/new`
- Verify form renders with fields: Product Name (required), One-Line Description, Target User, plus optional fields (Problem Solved, URL, etc.)
- Fill in test data:
  - Product name: "Smoke Test Product [timestamp]"
  - Description: "Automated smoke test — safe to delete"
  - Target user: "Test users"
- Click "Analyze Idea"
- Verify redirect to `/ideas/{id}/analyze`
- **Note:** This creates real data in Redis. Run cleanup flow (T1) after the test suite completes.

### I2: Analysis Completes
- On the analyze page, wait for analysis to complete (timeout: 120s)
- If analysis fails, report the error and skip to the next flow
- Once complete, verify redirect to `/analyses/{id}`
- Verify scores section renders (6 score rings: SEO, Competition, WTP, Differentiation, Expertise, Overall)
- Verify Key Risks section populated
- Verify SEO Deep Dive section loads

### G1: View Content Calendar
- Navigate to an existing analysis's content page: `/analyses/{id}/content` (use an ID from the Prerequisites step)
- Verify content pieces listed (or auto-generation triggers for new calendars)
- Verify piece cards show title, status, selection checkbox

### G2: Generate Content
- **Prerequisite:** Only run if the analysis already has content pieces that can be selected. Skip if calendar is empty or all pieces are already generated.
- On the content calendar, select 1-2 pieces via checkboxes
- Click "Generate Selected"
- Verify redirect to `/analyses/{id}/content/generate`
- Verify progress UI renders: progress bar, step list with status icons
- Wait for the page's built-in polling to show completion (timeout: 120s)
- Verify success state appears
- Verify auto-redirect back to content page

### G3: Publish Check
- On the content calendar, verify "Publish Next" button visible
- Optionally click to publish one piece
- Verify piece status updates

### F1: Generate Foundation Docs
- Navigate to an existing analysis's foundation page: `/analyses/{id}/foundation`
- **Prerequisite:** Only click "Generate All" if some docs are missing. Skip if all 6 docs already exist.
- If generating, verify progress updates (Strategy completes first, then Positioning, then remaining docs cascade)
- Wait for completion (timeout: 180s — 6 docs may take longer)

### F2: Doc Completion
- After generation, verify 6 doc cards show content
- Expand at least one doc — verify content text renders (displayed as formatted text, not raw HTML)
- Verify version numbers visible on completed doc cards (e.g., "v1")

### P1: Painted Door Site Generation
- Navigate to an existing analysis's painted door page: `/analyses/{id}/painted-door`
- **Prerequisite:** Only proceed if generation hasn't been run yet. If the site is already deployed, skip to P2.
- If not yet started, verify generation auto-triggers
- Verify progress steps render (8 steps: Brand Identity, Assemble Files, Create GitHub Repo, Push Files, Create Vercel Project, Wait for Deploy, Register Publish Target, Verify)

### P2: Site Deployed
- Wait for painted door generation to complete (timeout: 180s)
- Verify deployed site URL appears
- Verify "See Site" button links to external URL
- Verify "Create Content" link navigates to content page

---

## Cleanup Flow

### T1: Delete Smoke Test Data
- Navigate to `/analysis`
- Find the "Smoke Test Product" entry created by I1
- Click into the analysis detail page
- Click the delete button and confirm deletion
- Verify the analysis is removed from the leaderboard

---

## Test Data Considerations

- **Read-only flows (C1-C6, G1):** Safe to run anytime, no side effects
- **Write flows (I1, I2):** Create test data in Redis. Always run T1 cleanup afterward
- **Generation flows (G2, F1, P1):** Consume API credits (Anthropic, OpenAI). Only run against analyses that already have generated data — check before triggering
- **Cleanup flow (T1):** Deletes the smoke test analysis. Run after completing all flows
