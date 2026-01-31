# Research Agent Playbook

Step-by-step guide for analyzing product ideas.

---

## Pre-Flight Checklist

- [ ] Received 2-3 product ideas with required fields
- [ ] Read `/knowledge/seo/best-practices.md`
- [ ] Created `/experiments/[idea-name]/` folder for each idea
- [ ] Confirmed tools available (web search, web fetch)

---

## Phase 1: Competitive Analysis

### Step 1.1: Find Competitors

For each idea:

1. Search `"[product type] apps"` or `"[product type] tools"`
2. Search `"best [product type]"` and `"[product type] alternatives"`
3. Search `"[problem] solution"` and `"how to [solve problem]"`
4. Check Product Hunt, G2, Capterra for the category
5. Note any from user's existing knowledge

**Target:** 5-10 competitors per idea

### Step 1.2: Analyze Each Competitor

For each competitor, document:

| Field | How to Find |
|-------|-------------|
| Name & URL | Direct |
| One-line description | Homepage headline |
| Target audience | Homepage, About page |
| Pricing | Pricing page |
| Strengths | Features, reviews, positioning |
| Weaknesses | Reviews, gaps, user complaints |

### Step 1.3: Assess Market Maturity

Evaluate based on:

- Number of established players (5+ = crowded)
- Funding/acquisition activity
- Search trend direction (Google Trends)
- Content volume in SERPs

**Rate as:** Crowded / Emerging / Nascent

### Step 1.4: Identify Differentiation

Look for:

- Underserved user segments
- Missing features across competitors
- Pricing gaps (too expensive, no free tier, etc.)
- UX/design opportunities
- Positioning angles not taken

### Step 1.5: Write Output

Create `/experiments/[idea-name]/competitors.md` with:

```markdown
# Competitor Analysis: [Idea Name]

## Summary
[2-3 sentences on competitive landscape]

## Market Maturity: [Crowded/Emerging/Nascent]
[Reasoning]

## Competitors

| Name | URL | Pricing | Target | Strengths | Weaknesses |
|------|-----|---------|--------|-----------|------------|
| ... | ... | ... | ... | ... | ... |

## Differentiation Opportunities
1. [Opportunity 1]
2. [Opportunity 2]
3. [Opportunity 3]
```

---

## CHECKPOINT 1: Human Review

**Present to human:**
- Competitor tables for each idea
- Market maturity assessments
- Differentiation opportunities

**Ask:**
- Are competitors accurate?
- Any missing competitors?
- Thoughts on differentiation angles?

**Wait for approval before proceeding.**

---

## Phase 2: SEO Opportunity Analysis

Uses the dual-LLM + SERP validation pipeline implemented in `src/lib/seo-analysis.ts`.

### Step 2.1: Prepare Product Context

For each idea, gather:
- Product name, description, target user, problem solved
- Any existing URLs or document content
- The system auto-detects the vertical (B2B SaaS, healthcare consumer, general niche) via `detectVertical()` in `src/lib/seo-knowledge.ts`
- Knowledge context is injected into LLM prompts automatically

### Step 2.2: Dual-LLM Keyword Generation (Parallel)

Two LLM analyses run in parallel:

**Claude (senior SEO strategist):**
- Receives keyword pattern templates, SERP evaluation framework, content gap types, and community sources for the detected vertical
- Generates 15-20 keywords with: intent type, estimated volume/competition, content gap hypothesis, opportunity score (1-10), and gap type classification

**OpenAI GPT-4o-mini (scrappy founder):**
- Receives pain-point patterns and community language sources for the detected vertical
- Generates 15-20 keywords focused on: frustration queries, "[competitor] alternative" patterns, community-language queries, and high buying-intent searches

If OpenAI is not configured, Claude runs alone.

### Step 2.3: Cross-Reference Results

- Compare keyword lists using fuzzy matching (exact, containment, 60% word overlap)
- Identify agreed keywords (both LLMs suggested) — these are highest confidence
- Flag Claude-unique and OpenAI-unique keywords
- Merge into single prioritized list: agreed first, then Claude-unique, then OpenAI-unique

### Step 2.4: SERP Validation (Top 8 Keywords)

If SerpAPI is configured:
- Query Google for top 8 keywords (filtered by relevance to $1M ARR)
- For each SERP result, detect:
  - Content gaps using knowledge base criteria (forum presence, PAA questions, authority domain matching)
  - Gap types: Format, Freshness, Depth, Angle, Audience
  - Green flags: forums ranking, thin content, PAA present, few organic results
  - Red flags: authority domains dominating, few unique domains in top 5

If SerpAPI is not configured, skip this step and note in report.

### Step 2.5: Content Gap Detection

For each SERP-validated keyword:
- **Depth gap:** Few organic results, forums ranking, thin snippets
- **Audience gap:** Generic/big sites dominating, not specialized
- **Angle gap:** Low-relevance snippets, homogeneous results
- **Format gap:** All text articles but query implies interactive need
- **Freshness gap:** Top content is outdated (checked via authority domain patterns)

### Step 2.6: Synthesis

- Claude synthesizes all data sources (Claude keywords, OpenAI keywords, SERP validation)
- Scoring guidelines injected from knowledge base
- Generates narrative with: highest-confidence opportunities, validated content gaps, content strategy, and cautions
- Produces markdown report with keyword table, SERP validation section, LLM cross-reference, content strategy, and difficulty assessment

### Step 2.7: Write Output

Create `/experiments/[idea-name]/keywords.md` with the generated markdown report.

---

## CHECKPOINT 2: Human Review

**Present to human:**
- Top keywords with opportunity scores and gap types
- SERP validation results (if available)
- LLM cross-reference summary
- Content strategy recommendation

**Ask:**
- Do these opportunities look realistic?
- Any keywords to add or remove?
- Thoughts on content priorities?

**Wait for approval before proceeding.**

---

## Phase 3: Willingness-to-Pay Analysis

### Step 3.1: Find Paid Products

Search for:
- `[product type] pricing`
- `[product type] subscription`
- `[product type] premium`

Document:
- Product names
- Pricing models (subscription, one-time, freemium)
- Price points

### Step 3.2: Search Purchase Signals

Look for:
- `"[product type] worth it"`
- `"[product type] review"`
- `"should I pay for [product type]"`
- `"[product] vs [competitor]"` (comparison shopping)

Note:
- Volume of these queries
- Sentiment in discussions
- Price sensitivity signals

### Step 3.3: Rate Willingness to Pay

**Strong:**
- Multiple successful paid products
- Clear purchase-intent search volume
- Users discussing value positively

**Moderate:**
- Some paid products exist
- Mixed signals on value
- Price sensitivity evident

**Weak:**
- Mostly free alternatives
- Users expect free solutions
- Low purchase-intent search volume

**Unknown:**
- Insufficient data to assess

### Step 3.4: Document Findings

Add to `/experiments/[idea-name]/analysis.md`:

```markdown
## Willingness to Pay

**Rating:** [Strong/Moderate/Weak/Unknown]

**Evidence:**
- [Paid product 1]: $X/month - [notes]
- [Paid product 2]: $X/month - [notes]

**Purchase Intent Signals:**
- [Signal 1]
- [Signal 2]

**Reasoning:**
[Why this rating]
```

---

## Phase 4: Scoring & Synthesis

### Step 4.1: Score Each Dimension

For each idea, score 1-10:

| Dimension | Weight | Score | Reasoning |
|-----------|--------|-------|-----------|
| SEO Opportunity | 30% | X | [brief reason] |
| Competitive Landscape | 20% | X | [brief reason] |
| Willingness to Pay | 25% | X | [brief reason] |
| Differentiation Potential | 20% | X | [brief reason] |
| Alignment with Expertise | 5% | X | [brief reason] |

### Step 4.2: Calculate Weighted Score

```
Overall = (SEO × 0.30) + (Competitive × 0.20) + (WTP × 0.25) + (Diff × 0.20) + (Expertise × 0.05)
```

### Step 4.3: Assign Confidence

**High:** Strong data across all dimensions
**Medium:** Good data with some gaps
**Low:** Significant data gaps or conflicting signals

### Step 4.4: Make Recommendation

- **Tier 1:** Score >= 7, High/Medium confidence
- **Tier 2:** Score 5-7, or high score with Low confidence
- **Tier 3:** Score < 5, or major red flags

### Step 4.5: Identify Risks

For each idea, list:
- Key uncertainties
- What could invalidate the opportunity
- Dependencies or assumptions

### Step 4.6: Define Next Steps

For Tier 1 recommendations:
- Priority content to create (3-5 pieces)
- Landing page recommendations
- Success metrics to track

### Step 4.7: Write Final Output

Create `/experiments/[idea-name]/analysis.md` with full analysis.

Create ranking summary:

```markdown
# Idea Prioritization Summary

## Ranking

| Rank | Idea | Score | Confidence | Recommendation |
|------|------|-------|------------|----------------|
| 1 | [Name] | X.X | [H/M/L] | Tier 1 |
| 2 | [Name] | X.X | [H/M/L] | Tier 2 |
| 3 | [Name] | X.X | [H/M/L] | Tier 3 |

## Recommendation

**Tier 1:** [Idea Name]

**Reasoning:**
[3-5 sentences on why this idea should be tested first]

## Next Steps for [Winning Idea]

1. [Priority content piece 1]
2. [Priority content piece 2]
3. [Landing page update]
4. [Success metric to track]
```

---

## CHECKPOINT 3: Human Review

**Present to human:**
- Prioritized ranking table
- Scoring breakdown for each idea
- Recommendation with reasoning
- Proposed next steps

**Ask:**
- Does the scoring feel right?
- Agree with the priority order?
- Any concerns with the recommendation?
- Ready to proceed with testing?

**Wait for final approval.**

---

## Post-Analysis Checklist

- [ ] All output files created in `/experiments/[idea-name]/`
- [ ] Checkpoints completed and approved
- [ ] Final recommendation documented
- [ ] Next steps clearly defined
- [ ] Human has approved moving forward

---

*Playbook v2 — January 2026*
