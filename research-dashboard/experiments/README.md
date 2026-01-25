# Experiments

This folder contains learnings and outputs from each product idea tested.

---

## Folder Structure

Each tested idea gets its own folder:

```
experiments/
├── README.md (this file)
├── habit-tracker/
│   ├── analysis.md      # Full analysis and recommendation
│   ├── keywords.md      # Keyword research details
│   ├── competitors.md   # Competitor analysis
│   └── learnings.md     # Post-experiment insights
├── sleep-coach/
│   └── ...
└── meal-planner/
    └── ...
```

---

## File Templates

### analysis.md

```markdown
# Analysis: [Idea Name]

## Summary
- **Score:** X.X/10
- **Confidence:** High/Medium/Low
- **Recommendation:** Test First / Test Later / Don't Test

## Scoring Breakdown

| Dimension | Weight | Score | Reasoning |
|-----------|--------|-------|-----------|
| SEO Opportunity | 50% | X | ... |
| Competitive Landscape | 20% | X | ... |
| Willingness to Pay | 15% | X | ... |
| Differentiation Potential | 10% | X | ... |
| Expertise Alignment | 5% | X | ... |
| **Overall** | 100% | X.X | |

## Willingness to Pay
**Rating:** Strong/Moderate/Weak/Unknown

**Evidence:**
- ...

## Key Risks
1. ...
2. ...

## Next Steps (if testing)
1. ...
2. ...

---
*Analysis completed: [Date]*
```

### keywords.md

```markdown
# Keyword Research: [Idea Name]

## Summary
[2-3 sentences]

## Top 10 Keywords

| Keyword | Volume | KD | Intent | Score |
|---------|--------|----|---------|----|
| ... | ... | ... | ... | ... |

## Clusters

### Cluster 1: [Theme]
- **Opportunity Score:** X/10
- **Keywords:** ...
- **Content Opportunity:** ...

## Data Limitations
[Note any gaps]

---
*Research completed: [Date]*
```

### competitors.md

```markdown
# Competitor Analysis: [Idea Name]

## Market Maturity: [Crowded/Emerging/Nascent]
[Reasoning]

## Competitors

| Name | URL | Pricing | Strengths | Weaknesses |
|------|-----|---------|-----------|------------|
| ... | ... | ... | ... | ... |

## Differentiation Opportunities
1. ...
2. ...
3. ...

---
*Analysis completed: [Date]*
```

### learnings.md (post-experiment)

```markdown
# Learnings: [Idea Name]

## Experiment Summary
- **Duration:** [Start date] to [End date]
- **Outcome:** Success / Partial / Failed
- **Key Metric:** [What we measured and result]

## What Worked
1. ...

## What Didn't Work
1. ...

## Surprises
1. ...

## Recommendations for Future
1. ...

---
*Documented: [Date]*
```

---

## Naming Conventions

- Use lowercase with hyphens: `habit-tracker`, `sleep-coach`
- Match the product name used in analysis
- Keep names short but descriptive

---

## Updating Experiments

- **During analysis:** Create analysis.md, keywords.md, competitors.md
- **During testing:** Update with new findings
- **After experiment:** Add learnings.md with retrospective
- **Files are append-only:** Don't delete historical data, add updates

---

## Cross-Referencing

When insights from one experiment inform another:
- Add links: `See also: [[habit-tracker/learnings]]`
- Tag common themes for easy discovery

---

*Experiments folder initialized: January 2025*
