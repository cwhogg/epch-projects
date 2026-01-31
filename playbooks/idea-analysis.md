# Idea Analysis Playbook

Quick-reference guide for analyzing niche product ideas targeting $1M ARR.

---

## Overview

**Purpose:** Evaluate product ideas for SEO opportunity, competitive landscape, willingness to pay, and differentiation potential.

**Output:** Prioritized recommendation (Tier 1 / Tier 2 / Tier 3) with supporting analysis

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

| Phase | Output |
|-------|--------|
| 1. Competitive Analysis | competitors.md |
| 2. SEO Opportunity (Dual-LLM Pipeline) | keywords.md |
| 3. Willingness to Pay | (in analysis.md) |
| 4. Scoring & Synthesis | analysis.md |

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

## Phase 2: SEO Opportunity (Dual-LLM Pipeline)

### Checklist

- [ ] Prepare product context (name, description, target user, problem)
- [ ] Run dual-LLM keyword generation (Claude + OpenAI in parallel)
- [ ] Cross-reference LLM results (identify agreed and unique keywords)
- [ ] SERP validate top 8 keywords (if SerpAPI configured)
- [ ] Detect content gaps (Format, Freshness, Depth, Angle, Audience)
- [ ] Synthesize into final keyword report

### Pipeline Steps

**Step 1: Dual-LLM Generation**
- Claude generates 15-20 keywords (senior SEO strategist perspective) with opportunity scores and gap types
- OpenAI generates 15-20 keywords (scrappy founder perspective) with pain-point focus
- Vertical-specific knowledge context injected into both prompts from `src/lib/seo-knowledge.ts`

**Step 2: Cross-Reference**
- Fuzzy match keywords across both lists
- Agreed keywords = highest confidence
- Merge: agreed first, then Claude-unique, then OpenAI-unique

**Step 3: SERP Validation**
- Top 8 keywords validated against live Google SERPs via SerpAPI
- Content gap detection: forum ranking, PAA presence, thin content, authority domain analysis
- Green/red flags identified per keyword

**Step 4: Synthesis**
- All data sources combined into narrative and structured report
- Scoring guidelines applied from knowledge base

### SERP Signals

| Green Flags | Red Flags |
|-------------|-----------|
| Reddit/forums ranking | Authority domains in all top 5 |
| Thin content in results | Few unique domains in top 5 |
| People Also Ask present | All content comprehensive |
| Few organic results | Ads/knowledge panels dominating |

### Content Gap Types

| Type | Signal |
|------|--------|
| Format | All text articles, query needs interactive tool |
| Freshness | Top content 2+ years old |
| Depth | Thin content, PAA unanswered, forums ranking |
| Angle | All same perspective, no comparison content |
| Audience | Generic content, no audience-specific versions |

### CHECKPOINT 2
Pause. Present keyword opportunities with scores and SERP validation. Get approval.

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
| SEO Opportunity | 30% | ___ |
| Competitive Landscape | 20% | ___ |
| Willingness to Pay | 25% | ___ |
| Differentiation Potential | 20% | ___ |
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
Overall = (SEO × 0.30) + (Comp × 0.20) + (WTP × 0.25) + (Diff × 0.20) + (Exp × 0.05)
```

### Recommendation

| Overall Score | Confidence | Recommendation |
|--------------|------------|----------------|
| >= 7 | High/Medium | Tier 1 |
| 5-7 | Any | Tier 2 |
| >= 7 | Low | Tier 2 |
| < 5 | Any | Tier 3 |

### CHECKPOINT 3
Pause. Present final ranking and recommendation. Get final approval.

---

## Outputs

### Per Idea (in `/experiments/[idea-name]/`)

1. `competitors.md` — Competitor table, market maturity, differentiation
2. `keywords.md` — Top keywords with scores, SERP validation, LLM cross-reference
3. `analysis.md` — Full analysis with scoring and recommendation

### Summary

Prioritized ranking table with:
- Idea name
- Overall score
- Confidence level
- Recommendation (Tier 1 / Tier 2 / Tier 3)
- Primary reasoning

---

## Post-Analysis

If recommendation is Tier 1:

1. Define priority content (3-5 pieces)
2. Specify landing page updates
3. Set success metrics
4. Begin content creation phase

---

*Playbook v2 — January 2026*
