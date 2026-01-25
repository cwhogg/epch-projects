# Idea Analysis Playbook

Quick-reference guide for analyzing B2C product ideas.

---

## Overview

**Purpose:** Evaluate product ideas for SEO opportunity, competitive landscape, and willingness to pay.

**Time:** 30-60 minutes per idea

**Output:** Prioritized recommendation with supporting analysis

---

## Input Requirements

Each idea needs:

| Field | Example |
|-------|---------|
| Product name | HabitFlow |
| Description | Daily habit tracker with AI coaching |
| Target user | Professionals wanting to build better habits |
| Problem solved | Inconsistency in habit formation |
| Existing assets | habitflow.app (landing page) |

**Minimum:** 2-3 ideas to compare

---

## Process Summary

| Phase | Time | Output |
|-------|------|--------|
| 1. Competitive Analysis | 15 min | competitors.md |
| 2. SEO Opportunity | 20 min | keywords.md |
| 3. Willingness to Pay | 10 min | (in analysis.md) |
| 4. Scoring & Synthesis | 10 min | analysis.md |

---

## Phase 1: Competitive Analysis

### Checklist

- [ ] Find 5-10 competitors via search
- [ ] Document: name, URL, pricing, target, strengths, weaknesses
- [ ] Assess market maturity (Crowded/Emerging/Nascent)
- [ ] Identify 3+ differentiation opportunities

### Search Queries

```
"[product type] apps"
"best [product type]"
"[problem] solution"
"[competitor] alternative"
```

### Market Maturity Criteria

| Maturity | Signals |
|----------|---------|
| Crowded | 5+ established players, frequent "best of" lists, venture funding |
| Emerging | 2-4 players, growing search trends, room for differentiation |
| Nascent | < 2 players, unclear demand, high risk/reward |

### CHECKPOINT 1
Pause. Present competitor findings. Get approval.

---

## Phase 2: SEO Opportunity

### Checklist

- [ ] Generate 20-30 seed keywords
- [ ] Pull data (Ahrefs or manual SERP analysis)
- [ ] Filter: KD 0-30, Volume 200+, Commercial intent
- [ ] Analyze SERPs for top 10 keywords
- [ ] Cluster by theme and intent
- [ ] Score clusters 1-10

### Seed Keyword Patterns

| Type | Pattern |
|------|---------|
| Product | `[product type] app`, `best [product type]`, `free [product type]` |
| Problem | `how to [solve problem]`, `[problem] help` |
| Comparison | `[competitor] alternative`, `[product] vs` |
| Question | `what is the best [solution]`, `how do I [task]` |

### Filter Criteria

Pass if ALL true:
- KD: 0-30
- Volume: 200+ (or 50+ if high intent)
- Intent: Commercial or Transactional
- SERP: No brand dominance, content gaps exist

### SERP Signals

| Green Flags | Red Flags |
|-------------|-----------|
| Reddit/forums ranking | Major brands in all top 5 |
| Outdated content (2+ years) | High DR sites only |
| Thin content in results | Top results have 100+ backlinks |
| Low DR sites ranking | All content is comprehensive |

### CHECKPOINT 2
Pause. Present keyword opportunities. Get approval.

---

## Phase 3: Willingness to Pay

### Checklist

- [ ] Find paid products in the space
- [ ] Document pricing models and price points
- [ ] Search for purchase-intent signals
- [ ] Rate: Strong / Moderate / Weak / Unknown

### Search Queries

```
"[product type] pricing"
"[product type] worth it"
"[product type] review"
"should I pay for [product type]"
```

### Rating Criteria

| Rating | Evidence |
|--------|----------|
| Strong | Multiple paid products, clear purchase signals, positive value discussion |
| Moderate | Some paid products, mixed signals, price sensitivity evident |
| Weak | Mostly free, users expect free, low purchase-intent search volume |
| Unknown | Insufficient data |

---

## Phase 4: Scoring & Synthesis

### Scoring Dimensions

| Dimension | Weight | Score 1-10 |
|-----------|--------|------------|
| SEO Opportunity | 50% | ___ |
| Competitive Landscape | 20% | ___ |
| Willingness to Pay | 15% | ___ |
| Differentiation Potential | 10% | ___ |
| Expertise Alignment | 5% | ___ |

### Scoring Guide

| Score | Meaning |
|-------|---------|
| 8-10 | Exceptional |
| 6-7 | Good with caveats |
| 4-5 | Mixed signals |
| 1-3 | Significant concerns |

### Calculate Overall

```
Overall = (SEO × 0.50) + (Comp × 0.20) + (WTP × 0.15) + (Diff × 0.10) + (Exp × 0.05)
```

### Recommendation

| Overall Score | Confidence | Recommendation |
|--------------|------------|----------------|
| ≥ 7 | High/Medium | Test First |
| 5-7 | Any | Test Later |
| ≥ 7 | Low | Test Later |
| < 5 | Any | Don't Test |

### CHECKPOINT 3
Pause. Present final ranking and recommendation. Get final approval.

---

## Outputs

### Per Idea (in `/experiments/[idea-name]/`)

1. `competitors.md` — Competitor table, market maturity, differentiation
2. `keywords.md` — Top keywords, clusters, SERP analysis
3. `analysis.md` — Full analysis with scoring and recommendation

### Summary

Prioritized ranking table with:
- Idea name
- Overall score
- Confidence level
- Recommendation
- Primary reasoning

---

## Post-Analysis

If recommendation is "Test First":

1. Define priority content (3-5 pieces)
2. Specify landing page updates
3. Set success metrics
4. Begin content creation phase

---

*Playbook v1 — January 2025*
