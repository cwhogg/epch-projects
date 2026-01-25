# Research Dashboard

A Next.js dashboard for managing product idea research and analysis.

## Features

- **Leaderboard**: View ranked product ideas by recommendation (Test First / Test Later / Don't Test)
- **Analysis Detail**: View full analysis including scores, risks, competitor analysis, and keyword research
- **Add Ideas**: Submit new product ideas with description, target user, problem solved, URLs, and documentation

## Local Development

```bash
npm install
npm run dev
```

The dashboard will be available at http://localhost:3000.

## Data Sources

The dashboard reads analysis data from markdown files in the `experiments` folder:

- `experiments/[idea-name]/analysis.md` - Main analysis with scores and recommendations
- `experiments/[idea-name]/competitors.md` - Competitor analysis
- `experiments/[idea-name]/keywords.md` - Keyword research

Product ideas are stored in `data/ideas.json`.

## Running the Research Agent

To analyze a new product idea:

1. Add the idea through the dashboard
2. Run Claude Code with the research agent playbook:

```bash
claude "Analyze the idea: [idea-name] following the research agent playbook at agents/research-agent/PLAYBOOK.md"
```

The agent will create analysis files in `experiments/[idea-name]/`.

## Vercel Deployment

This project is ready for Vercel deployment. The `experiments` folder is included in the project directory.

To deploy:

```bash
vercel
```

Or connect to GitHub and deploy automatically via Vercel dashboard.

Note: For production use with multiple users or dynamic data, consider migrating to a database backend.
