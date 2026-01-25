# Agent-Powered Market Testing Organization

## Project Plan — Draft v1

---

## Executive Summary

We're building an agent-powered organization to test B2C healthcare and consumer products and find one that can sustain itself with paying customers. The goal is a niche $1M ARR business, not a venture-scale play.

**Success definition:** One product with paying customers in 6 months.

**Approach:** Use autonomous AI agents to analyze ideas, create SEO content, drive organic traffic, and measure results — learning what works through real experiments.

---

## Strategic Context

### What We Have
- 5-10 functional prototypes/demos (mostly healthcare and personal coaching)
- Some existing landing pages
- Deep bench of consultants available if needed
- B2B pharma network available for later (if a B2B idea emerges)
- Technical stack: Claude Code ↔ GitHub ↔ Vercel

### What We're Building
- A system of coordinated AI agents that can:
  - Analyze and prioritize product ideas
  - Identify SEO opportunities
  - Create optimized content
  - Measure and learn from results
  - Operate autonomously with human oversight at key checkpoints

### Constraints & Principles
- **Patient timeline** — no pressure to scale fast
- **Lean by default** — low spend, organic-first distribution
- **Sequential testing** — one idea at a time, not parallel
- **Learn by doing** — go/no-go criteria emerge from data
- **Dual purpose** — find a winning product AND learn to build agent systems

---

## The Testing Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   1. RESEARCH AGENT analyzes ideas                              │
│      ↓                                                          │
│   2. Pick one idea to test                                      │
│      ↓                                                          │
│   3. Build/refine landing page                                  │
│      ↓                                                          │
│   4. CONTENT AGENT creates SEO-optimized content                │
│      ↓                                                          │
│   5. Measure: clicks → registrations → paid conversions         │
│      ↓                                                          │
│   6. KILL or DOUBLE DOWN (stage-gate decision)                  │
│      ↓                                                          │
│   7. Learn and refine go/no-go criteria                         │
│      ↓                                                          │
│   8. Repeat with next idea if needed                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Stage Gates
Each idea passes through gates. Kill at any stage if signal isn't there:

1. **Clicks** — Is anyone finding and clicking on our content?
2. **Registration** — Are visitors signing up / engaging?
3. **Paid conversion** — Will anyone pay?

*Note: Specific go/no-go thresholds will be defined after we see data from early experiments.*

---

## Phase 1: Organizational Design — Agent Roles

### Core Agents (Build Order)

| Priority | Agent | Purpose |
|----------|-------|---------|
| 1 | **Research Agent** | Analyze ideas, competitive landscape, SEO opportunities, prioritize what to test |
| 2 | **Knowledge Manager** | Maintain shared context, agent expertise, update playbooks based on learnings |
| 3 | **Content Agent** | Create SEO-optimized content targeting identified keywords |
| 4 | **Analytics Agent** | Track clicks, registrations, conversions; surface insights |
| 5 | **Optimization Agent** | Iterate on content/pages based on performance data |

### Supporting Agents (Build Later)

| Agent | Purpose |
|-------|---------|
| **User Research Agent** | Monitor Reddit, forums for pain points and demand signals |
| **Distribution Agent** | Explore non-SEO channels (social, communities, Product Hunt) |
| **Feedback Synthesis Agent** | Aggregate user feedback, identify patterns |

### Agent Architecture Principles

- **Autonomous by default** — agents run independently, pause at checkpoints for human review
- **Shared memory** — consolidated database (not per-idea) so agents can build on each other's work
- **Orchestrated** — findings flow automatically between agents
- **On-demand initially** — manually triggered while we build trust, move to scheduled/event-driven later

---

## Phase 2: Research Agent — Deep Scope

### Mission
Analyze B2C healthcare and consumer product ideas and deliver a prioritized ranking based on competitive landscape, SEO opportunity, and realistic potential to attract paying users.

### Inputs
- List of 2-3+ product ideas (description, target user, problem solved)
- Access to Ahrefs API for keyword data
- Web search for competitive intelligence

### Core Tasks

**1. Competitive Analysis (per idea)**
- Find existing products/services solving similar problems
- Analyze positioning, pricing, feature sets
- Identify gaps and differentiation opportunities
- Assess market maturity (crowded vs. emerging)

**2. SEO Opportunity Analysis (per idea)**
- Identify relevant keywords and search terms
- Assess search volume (is anyone looking?)
- Assess competition/difficulty (can we rank?)
- Find long-tail opportunities (lower volume but winnable)
- Estimate traffic potential if we rank

**3. Willingness-to-Pay Signals (per idea)**
- Look for existing paid products in the space
- Note pricing models and price points
- Search for complaints about current solutions (signal of unmet need)
- Reddit/forum signals of frustration

**4. Prioritization & Scoring**
- Score each idea on key dimensions
- Provide clear reasoning for each score
- Rank ideas with confidence levels
- Recommend which to test first and why

### Outputs
- **Idea Scorecard** — structured analysis per idea
- **Keyword Opportunities** — prioritized list of target keywords per idea
- **Recommendation** — which idea to test first with reasoning

### Checkpoints (Human Review)
1. After competitive analysis — "Does this match your understanding of the market?"
2. After keyword research — "Do these keywords align with how your target users think?"
3. Before final recommendation — "Here's my ranking. Agree?"

### Tools & Data Sources
- **Ahrefs API** — keyword volume, difficulty, SERP analysis
- **Web search** — competitive research, market landscape
- **Web fetch** — deep reading of competitor sites, pricing pages
- **Reddit/forums** — demand signals, pain points (future enhancement)

---

## Phase 3: Technical Architecture

### Stack

**Core (Phase 1)**
- **Claude Code** — agent development and orchestration
- **GitHub** — version control, CI/CD
- **Vercel** — hosting for landing pages and any agent endpoints
- **Ahrefs** — SEO data (API access)
- **Supabase** — consolidated memory database, agent state
- **Obsidian** — knowledge management, agent specs, documentation

**Analytics & Optimization (Phase 2+)**
- **Posthog / Mixpanel** — product analytics (beyond page views), user behavior tracking
- **Google Analytics / Vercel Analytics** — traffic and conversion tracking

**Payments & Email (When Ready for Paid Conversion)**
- **Stripe** — payment processing
- **Resend / Postmark** — transactional email

**Automation & Orchestration (As Complexity Grows)**
- **n8n / Zapier** — workflow automation between tools, agent orchestration

### Memory Architecture
- **Supabase** as the single shared database across all agents and ideas
- Stores: research findings, keyword data, performance metrics, learnings, agent expertise
- Avoids per-idea DB sprawl ($10/mo each adds up)
- Enables agents to reference past work and build on it
- **Obsidian** for human-readable documentation, agent specs, and playbooks

### Agent Interaction Model
```
┌────────────────┐
│     Human      │
│   (oversight)  │
└───────┬────────┘
        │ triggers / reviews
        ▼
┌────────────────┐      ┌────────────────┐
│    Research    │─────▶│    Content     │
│     Agent      │      │     Agent      │
└───────┬────────┘      └───────┬────────┘
        │                       │
        │                       ▼
        │               ┌────────────────┐
        │               │   Analytics    │
        │               │     Agent      │
        │               └───────┬────────┘
        │                       │
        ▼                       ▼
┌─────────────────────────────────────────┐
│       Shared Memory (Supabase)          │
└─────────────────────────────────────────┘
                    ▲
                    │ reads/writes expertise,
                    │ playbooks, learnings
                    ▼
┌─────────────────────────────────────────┐
│   Knowledge Manager + Obsidian Vault    │
└─────────────────────────────────────────┘
```

---

## Immediate Next Steps

### Week 1-2: Research Agent Build
1. Sign up for Ahrefs, get API access
2. Define input format for ideas (simple markdown or JSON)
3. Build Research Agent v1:
   - Competitive analysis module
   - Ahrefs integration for keyword research
   - Scoring framework
   - Output templates
4. Run against 2-3 real ideas
5. Review outputs, refine logic

### Week 3-4: First Experiment
1. Pick winning idea from Research Agent output
2. Ensure landing page exists
3. Scope Content Agent (or create content manually for v1)
4. Publish first SEO content
5. Set up basic analytics (clicks, registrations)
6. Wait and measure

### Ongoing
- Refine go/no-go criteria based on real data
- Build additional agents as needed
- Remove checkpoints as trust builds
- Document learnings in shared memory

---

## Open Questions

1. **Agent framework** — Pure Claude Code, or evaluate LangGraph/CrewAI for orchestration?
2. **Content creation** — Build Content Agent next, or create content manually while Research Agent matures?
3. **Analytics setup** — What's already in place? Google Analytics? Vercel Analytics? Need to set up?
4. **Obsidian sync** — How do we want agents to read/write to Obsidian? Local vault + GitHub sync? Obsidian API?
5. **Knowledge Manager scope** — What expertise and context should be seeded from day one vs. learned over time?

---

## Appendix: Agent Development Framework

For each agent we build, we'll define:

| Component | Description |
|-----------|-------------|
| **Mission** | One-sentence purpose |
| **Backstory & Persona** | Role definition, expertise areas, decision-making style |
| **Inputs** | What it needs to run |
| **Tasks** | What it does, step by step |
| **Outputs** | What it produces |
| **Checkpoints** | Where humans review before proceeding |
| **Tools** | APIs, data sources, capabilities |
| **Success Metrics** | How we know it's working |

Each agent gets a dedicated markdown specification file that serves as its "operating system."

---

*Document version: Draft v1*
*Last updated: January 2025*
