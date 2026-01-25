# EPCH Projects Vault

Agent-powered organization to test B2C healthcare and consumer products.

**Goal:** One product with paying customers in 6 months.

---

## Vault Structure

```
├── agents/                 # Agent specifications and playbooks
│   ├── research-agent/     # Market research and idea analysis
│   ├── content-agent/      # SEO content creation
│   ├── analytics-agent/    # Traffic and conversion tracking
│   ├── optimization-agent/ # A/B testing and improvements
│   └── knowledge-manager/  # Vault organization and updates
│
├── knowledge/              # Domain knowledge for agents
│   ├── seo/                # SEO best practices and guides
│   └── healthcare/         # Healthcare domain knowledge
│
├── playbooks/              # Step-by-step processes
│   └── idea-analysis.md    # How to analyze product ideas
│
└── experiments/            # Learnings from each product test
    └── [idea-name]/        # One folder per idea tested
```

---

## Source of Truth Hierarchy

1. **Agent SPEC.md files** — Authoritative definition of what each agent does
2. **Playbooks** — Step-by-step execution guides
3. **Knowledge files** — Reference material agents pull from
4. **Experiment folders** — Outputs and learnings (append-only)

---

## Current Status

- **Active Agent:** Research Agent
- **Phase:** Awaiting product ideas for analysis
- **Next Step:** Provide 2-3 product ideas in input format

---

## How to Provide Product Ideas

Create a list with this format for each idea:

```
**Product Name:** [Name]
**Description:** [One sentence]
**Target User:** [Who is this for]
**Problem Solved:** [What pain point]
**Existing Assets:** [URLs to landing pages, demos, etc.]
```

---

## Working Principles

- **Niche focus:** $1M ARR target, not venture-scale
- **Sequential testing:** One idea at a time
- **Data-driven:** Learn go/no-go criteria from real results
- **Simple stack:** Obsidian for knowledge, Vercel for hosting, Ahrefs for SEO
- **Human checkpoints:** Agents pause for review at key decisions

---

*Last updated: January 2025*
