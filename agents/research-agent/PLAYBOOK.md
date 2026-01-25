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

**Time estimate:** 15 minutes per idea

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

**Time estimate:** 20 minutes per idea

### Step 2.1: Generate Seed Keywords

Brainstorm 20-30 keywords based on:

**Product-focused:**
- `[product type] app`
- `[product type] tool`
- `best [product type]`
- `free [product type]`

**Problem-focused:**
- `how to [solve problem]`
- `[problem] help`
- `[problem] tips`

**Alternative-focused:**
- `[competitor] alternative`
- `[competitor] vs`
- `apps like [competitor]`

**Question-based:**
- `what is the best way to [goal]`
- `why is [problem] hard`
- `how do I [task]`

### Step 2.2: Research Keywords

**If Ahrefs available:**
- Pull volume, KD, CPC for each keyword
- Expand with "Also rank for" suggestions

**If Ahrefs unavailable (CRITICAL):**
- **DO NOT fabricate volume or difficulty numbers**
- **DO NOT estimate ranges like "5,000-10,000 volume"**
- Conduct SERP analysis ONLY:
  - Who currently ranks?
  - Are there content gaps (forums, outdated content)?
  - What's the competitor presence?
- Mark all volume/KD fields as "Unknown - no data"
- State clearly: "Cannot assess without Ahrefs/SEMrush access"
- SEO Opportunity score must be marked "?/10 (Unknown)"

### Step 2.3: Filter Opportunities

**Only if Ahrefs data is available:**

Apply filters from `/knowledge/seo/best-practices.md`:

- KD: 0-30 (prioritize 0-15)
- Volume: 200+ (or 50+ if high intent)
- Intent: Commercial or Transactional
- Length: 3+ words preferred

**If no Ahrefs data:** Skip filtering. Cannot filter without data.

### Step 2.4: Analyze SERPs

For top 10 filtered keywords:

1. Search each keyword
2. Note top 5 results:
   - Site name and type (brand, blog, tool)
   - Content type (guide, listicle, tool page)
   - Approximate word count
   - Last updated (if visible)

3. Look for green flags:
   - Forums/Reddit in results
   - Outdated content (2+ years old)
   - Thin content (< 500 words)
   - Low-authority sites ranking

4. Note red flags:
   - All major brands in top 5
   - Top results have massive backlink profiles

### Step 2.5: Cluster Keywords

Group keywords by:

- **Topic/theme** (e.g., "tracking habits" vs "building habits")
- **Intent** (informational vs commercial)
- **Content type needed** (guide vs tool vs comparison)

### Step 2.6: Score Clusters

**Only if Ahrefs data is available:**

Rate each cluster 1-10:

| Factor | Weight |
|--------|--------|
| Total volume | 30% |
| Average difficulty | 30% |
| Content gap size | 25% |
| Commercial intent | 15% |

**If no Ahrefs data:**
- Do NOT assign numeric scores to clusters
- Describe qualitative assessment only (e.g., "content gap appears to exist")
- Mark cluster scores as "Unknown"

### Step 2.7: Write Output

Create `/experiments/[idea-name]/keywords.md` with:

```markdown
# Keyword Research: [Idea Name]

## Summary
[2-3 sentences on SEO opportunity]

## Top 10 Keywords

| Keyword | Volume | KD | Intent | Opportunity Score |
|---------|--------|----|---------|--------------------|
| ... | ... | ... | ... | ... |

## Keyword Clusters

### Cluster 1: [Theme]
**Opportunity Score:** X/10
**Total Volume:** X,XXX
**Avg Difficulty:** XX

Keywords:
- keyword 1 (vol, KD)
- keyword 2 (vol, KD)

**Content Opportunity:** [What to create]

### Cluster 2: [Theme]
...

## SERP Analysis

### [Top Keyword 1]
- **Top Results:** [who ranks]
- **Content Gaps:** [opportunities]
- **Recommendation:** [what to create]

## Data Limitations
[Note any gaps in data, especially if Ahrefs unavailable]
```

---

## CHECKPOINT 2: Human Review

**Present to human:**
- Top 10 keywords per idea
- Cluster opportunity scores
- SERP analysis highlights

**Ask:**
- Do these opportunities look realistic?
- Any keywords to add or remove?
- Thoughts on content priorities?

**Wait for approval before proceeding.**

---

## Phase 3: Willingness-to-Pay Analysis

**Time estimate:** 10 minutes per idea

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

**Time estimate:** 10 minutes total

### Step 4.1: Score Each Dimension

For each idea, score 1-10:

| Dimension | Weight | Score | Reasoning |
|-----------|--------|-------|-----------|
| SEO Opportunity | 50% | X | [brief reason] |
| Competitive Landscape | 20% | X | [brief reason] |
| Willingness to Pay | 15% | X | [brief reason] |
| Differentiation Potential | 10% | X | [brief reason] |
| Alignment with Expertise | 5% | X | [brief reason] |

### Step 4.2: Calculate Weighted Score

```
Overall = (SEO × 0.50) + (Competitive × 0.20) + (WTP × 0.15) + (Diff × 0.10) + (Expertise × 0.05)
```

### Step 4.3: Assign Confidence

**High:** Strong data across all dimensions
**Medium:** Good data with some gaps
**Low:** Significant data gaps or conflicting signals

### Step 4.4: Make Recommendation

- **Test First:** Score ≥ 7, High/Medium confidence
- **Test Later:** Score 5-7, or high score with Low confidence
- **Don't Test:** Score < 5, or major red flags

### Step 4.5: Identify Risks

For each idea, list:
- Key uncertainties
- What could invalidate the opportunity
- Dependencies or assumptions

### Step 4.6: Define Next Steps

For "Test First" recommendations:
- Priority content to create (3-5 pieces)
- Landing page recommendations
- Success metrics to track
- Timeline suggestion

### Step 4.7: Write Final Output

Create `/experiments/[idea-name]/analysis.md` with full analysis.

Create ranking summary:

```markdown
# Idea Prioritization Summary

## Ranking

| Rank | Idea | Score | Confidence | Recommendation |
|------|------|-------|------------|----------------|
| 1 | [Name] | X.X | [H/M/L] | Test First |
| 2 | [Name] | X.X | [H/M/L] | Test Later |
| 3 | [Name] | X.X | [H/M/L] | Don't Test |

## Recommendation

**Test First:** [Idea Name]

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

*Playbook v1 — January 2025*
