# EPCH Projects

Next.js app deployed on Vercel. Two collaborators (Eric, Chris) pushing directly to main.

## Workflow

- Always `git pull` before starting any work (including before creating worktrees)
- No PRs — commit and push directly to main
- Worktrees are fine for parallel development, just pull first
- When finishing a development branch: merge to main locally, push, delete the branch
- Keep the Vercel audit from the finishing skill — catch deployment issues before they hit production

## Stack

- Next.js 16 / React 19 / TypeScript
- Tailwind CSS 4
- Deployed on Vercel
- Upstash Redis, Anthropic SDK, OpenAI SDK, SerpAPI, Google APIs

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run lint` — eslint
