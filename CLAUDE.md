# EPCH Projects

AI-powered product research and validation platform. Entrepreneurs submit product ideas and the system automates the entire validation pipeline: market research, strategic documents, SEO content generation, landing page deployment, and performance analytics. Five AI agents orchestrate the work through a shared pause/resume runtime.

- **GitHub repo**: `cwhogg/epch-projects` (Chris's account)
- **Vercel deployment**: Deployed through Chris's Vercel account to `epch-projects.vercel.app`
- Eric's Vercel account (`bigchewy`) hosts separate projects — do not confuse with this one

## Stack

- Next.js 16 / React 19 / TypeScript
- Tailwind CSS 4 (Fraunces serif + DM Sans body fonts)
- Deployed on Vercel with cron jobs (publish Mon/Wed/Fri, analytics Sun)
- Upstash Redis (all persistence), GitHub API (content publishing), Vercel API (site deployment)
- Anthropic SDK (claude-sonnet-4-6 for agents, claude-haiku-4-5 for eval judge), OpenAI SDK (gpt-4o-mini for SEO cross-reference), SerpAPI, Google Search Console API

## Architecture

**Pipeline stages** (each maps to a top-level route):

1. **Ideas** (`/ideas/new`) — Submit product ideas with optional documents
2. **Analysis** (`/analysis`) — Research agent scores 5 dimensions (SEO, competition, WTP, differentiation, expertise) → Tier 1/2/3 recommendation
3. **Foundation** (`/foundation`) — Foundation agent generates 7 strategic docs (strategy, positioning, brand-voice, design-principles, seo-strategy, social-media, visual-identity) with advisor assignments
4. **Website** (`/website`) — Website agent builds painted-door landing pages via GitHub repos + Vercel deployment with interactive chat builder
5. **Content** (`/content`) — Content agent generates SEO-optimized pieces (blog posts, comparisons, FAQs) with multi-turn critique pipeline
6. **Testing** (`/testing`) — Analytics agent monitors GSC performance, tracks email signups, generates weekly reports

**Key modules:**

| Module | Purpose |
|--------|---------|
| `src/lib/agent-runtime.ts` | Shared agentic loop with pause/resume, Redis state persistence (2hr TTL) |
| `src/lib/agent-tools/*.ts` | Stateless tool definitions per agent domain (research, content, foundation, website, analytics, common) |
| `src/lib/db.ts` | High-level data access — CRUD for all entities, delegates to Redis or filesystem fallback |
| `src/lib/redis.ts` | Upstash Redis singleton with TTL management |
| `src/lib/anthropic.ts` | Anthropic client singleton |
| `src/lib/advisors/` | Advisor prompt management (14 advisors: Seth Godin, April Dunford, Oli Gardner, etc.) |
| `src/lib/frameworks/` | Framework loader, registry, prompt builder |
| `src/lib/llm-utils.ts` | JSON parsing with fallback strategies (handles code fences, trailing commas, comments) |

**No auth.** Single-user dashboard. Cron endpoints protected by `CRON_SECRET`.

## Design Principles

**Read `docs/design/design-principles.md` before any UI work.** The design system uses a "warm editorial" aesthetic:

- Warm off-white base (`#FAF9F7`), coral accent (`#ff6b5b`), stone neutrals
- Three-tier color system: coral for action, traffic-light for semantic, stage colors for decoration only
- Interactive cards with hover lift + coral glow; static cards for data display
- Every screen should answer: "what's the state of things, and what do I do next?"

## Development Philosophy

This is a two-person side project for validating product ideas. Optimize for speed and clarity over robustness.

- **Simplicity over edge cases.** Don't add defensive code for scenarios that won't happen in practice.
- **Agents are the core abstraction.** All AI work flows through the agent runtime with tool definitions. Don't bypass it with raw API calls.
- **Foundation docs flow downstream.** Strategy → positioning → {brand-voice, design-principles, visual-identity, seo-strategy, social-media}. Respect the dependency chain.
- **Website builder is a renderer, not a creator.** Creative decisions happen in Foundation docs. The website builder assembles them deterministically.

## Naming Conventions

- **Components**: PascalCase (`PipelineCard.tsx`, `ScoreRing.tsx`)
- **Library modules**: kebab-case (`agent-runtime.ts`, `content-prompts.ts`)
- **API routes**: kebab-case following Next.js conventions (`/api/painted-door/[id]/chat`)
- **Tests**: `__tests__/` directories adjacent to implementation, `.test.ts` suffix

## Key Patterns

### Agent Tools
```ts
{
  name: 'tool_name',
  description: '...',
  input_schema: { type: 'object', properties: {...} },
  execute: async (input) => { /* implementation */ }
}
```

### LLM Clients
Singleton pattern via `getAnthropic()`, `getOpenAI()`, `getRedis()`. Never construct clients directly.

### Data Access
All persistence through `src/lib/db.ts`. Redis hash-based storage (HSET/HGET) for collections, string keys for individual objects. Filesystem fallback (`data/ideas.json`, `experiments/`) for local dev without Redis.

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build (catches TypeScript errors tests miss)
- `npm run lint` — eslint
- `npm test` — run tests once (vitest)
- `npm run test:watch` — run tests in watch mode
- `npm run eval --all` — run all eval scenarios
- `npm run eval --scenario <name>` — run single eval scenario

## Eval System

Scenario-based evals in `e2e/`. Config in `e2e/eval-config.ts` maps LLM surface patterns (glob-based) to scenarios. Five scoring dimensions: output-length, instruction-following, voice, structured-output, scoring-accuracy. Judge model: claude-haiku-4-5. Thresholds: pass >= 4, warn == 3, fail < 3.

## Documentation

- `docs/architecture.md` — Visual architecture reference (12 Mermaid diagrams)
- `docs/design/design-principles.md` — Complete design system
- `docs/design/brand-identity-spec.md` — Brand spec (colors, typography, components)
- `docs/design/prompting_best_practices.md` — 13 prompting principles
- `docs/plans/` — Implementation plans (archived to `completed/` when done)
- `docs/kanban/` — Project management (todo, in_progress, done, did_not_complete)
- `docs/Agent Tools & Skills.md` — Catalog of all 53 tools across 6 agents

## Workflow

- Always `git pull` before starting any work (including before creating worktrees)
- No PRs — commit and push directly to main
- Worktrees are fine for parallel development, just pull first
- When finishing a development branch: merge to main locally, push, delete the branch
- Keep the Vercel audit from the finishing skill — catch deployment issues before they hit production

## Finishing Work

After completing implementation, always run the `finishing-a-development-branch` skill. It runs tests and offers options to merge, create a PR, or keep the branch.

**Stay in planning mode.** When asked to brainstorm or write a plan, do NOT make code changes. Stay in planning mode until the user explicitly says to implement.
