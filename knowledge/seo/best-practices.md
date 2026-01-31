# SEO Best Practices

Reference guide for agents doing SEO analysis and content creation.

---

## Keyword Difficulty Assessment

When keyword difficulty tools (Ahrefs, SEMrush) are available, use their scoring. When unavailable, assess difficulty via SERP observation:

| Assessment Method | How to Evaluate |
|-------------------|-----------------|
| **Tool-based (KD 0-100)** | KD 0-30 target aggressively, 31-50 need strong content, 51+ avoid for new sites |
| **SERP observation** | Check who ranks in top 5, content quality, domain authority signals |

### SERP-Based Difficulty Proxy

| SERP Signal | Difficulty Level |
|-------------|-----------------|
| Forums/Reddit in top 5, thin content ranking | Low — target aggressively |
| Mix of small sites and some authority sites | Medium — good opportunity with strong content |
| All top 5 are major brands or authority domains | High — avoid for new sites |
| Knowledge panels, ads dominating SERP | Very High — do not target |

**Default filter:** Target keywords where SERP observation shows Low or Medium difficulty.

---

## Search Volume Thresholds

| Volume | B2C Classification | B2B SaaS Classification | Notes |
|--------|-------------------|------------------------|-------|
| 10,000+ | High volume | High volume | Usually high competition. Rarely worth targeting directly. |
| 2,000-10,000 | Medium volume | Medium-High | Good if difficulty is low. Long-tail variations often better. |
| 200-2,000 | Sweet spot | Medium | Ideal for niche B2C. Enough traffic to matter, low enough to rank. |
| 50-200 | Long-tail | **Sweet spot** | For B2B SaaS: 50-200/month is the ideal range. High-intent niche queries. |
| 20-50 | Very low | Long-tail | B2B: Still valuable if high commercial intent. Multiple long-tails add up. |
| < 20 | Skip | Very low | Only for extremely high-intent commercial keywords. |

**B2C default filter:** 200+ monthly searches, or 50+ if clear commercial intent.
**B2B SaaS default filter:** 50+ monthly searches, or 20+ if clear transactional intent. Do not dismiss low-volume keywords — in B2B, 20 searches/month with high intent can drive significant ARR.

---

## Search Intent Types

| Intent | Signals | Value for B2C | Value for B2B SaaS |
|--------|---------|---------------|-------------------|
| **Transactional** | "buy," "pricing," "discount," "coupon," "demo" | Highest — ready to purchase | Highest — ready to buy or trial |
| **Commercial** | "best," "vs," "review," "top," "alternative" | High — comparing options | High — evaluating solutions |
| **Informational** | "how to," "what is," "guide," "tips" | Medium — building awareness | Medium — top of funnel content |
| **Navigational** | Brand names, specific product names | Low — already decided | Low — already aware |

**Priority order:** Transactional > Commercial > Informational

---

## B2B SaaS Keyword Patterns ($1M ARR Focus)

### Problem-Aware Queries
```
how to automate [process]
why is [process] so slow
[process] keeps failing
how to reduce [metric] errors
[department] workflow bottleneck
```

### Solution-Aware Queries
```
[solution type] software for [team size]
[solution type] platform for [industry]
best [solution type] for startups
[solution type] that integrates with [tool]
```

### Comparison/Buyer Queries
```
[competitor] alternative
[competitor] vs [competitor]
cheaper alternative to [competitor]
[solution type] pricing comparison
[solution type] ROI calculator
```

### Community-Signal Queries
```
reddit [solution type] recommendation
what [solution type] do you use
[solution type] self-hosted vs cloud
anyone tried [competitor]
```

---

## Niche Vertical Keyword Templates

### Healthcare Consumer
- Symptom searches: "why do I [symptom]", "[condition] getting worse"
- Product searches: "best [product type] for [condition]", "[product type] app"
- Comparison: "[app] vs [app]", "best [product type] apps [year]"
- Community: "reddit [condition] what helps", "[product type] recommendation"

### General Niche
- Problem: "how to [solve problem]", "[task] for beginners"
- Solution: "best [product type]", "[product type] for [audience]"
- Comparison: "[product] alternative", "top [product type] [year]"
- Community: "reddit [product type] recommendation", "best way to [task]"

---

## Community/Forum Mapping by Vertical

### B2B SaaS
| Source Type | Where to Look |
|-------------|---------------|
| Reddit | r/SaaS, r/startups, r/Entrepreneur, r/smallbusiness, r/devops, r/sysadmin |
| Forums | Hacker News, Indie Hackers, Product Hunt, Stack Overflow |
| Review Sites | G2, Capterra, TrustRadius, GetApp, Product Hunt |
| Social | Twitter/X (tech), LinkedIn, Discord (dev communities) |

### Healthcare Consumer
| Source Type | Where to Look |
|-------------|---------------|
| Reddit | r/health, r/fitness, r/nutrition, r/sleep, r/mentalhealth, r/loseit |
| Forums | HealthBoards, Patient.info, MyFitnessPal forums |
| Review Sites | App Store reviews, Google Play reviews, Trustpilot |
| Social | Instagram (wellness), TikTok (health), Facebook groups |

---

## Ideal Target Keywords

A keyword is a strong opportunity if it meets ALL criteria:

- [ ] Difficulty: Low-Medium (via tool KD 0-30 or SERP observation)
- [ ] Volume: Sweet spot for vertical (B2C: 200-2,000, B2B SaaS: 50-200)
- [ ] Intent: Commercial or Transactional
- [ ] Length: 3+ words (long-tail)
- [ ] SERP: No major brands dominating top 5
- [ ] Content gap: Weak/outdated/thin content currently ranking

---

## SERP Analysis

### Green Flags (Opportunity Exists)

- Forums (Reddit, Quora) ranking in top 10
- Content older than 2 years in top positions
- Thin content (< 500 words) ranking well
- Low Domain Rating sites (DR < 30) in top 5
- "People Also Ask" boxes present (content gap signal)
- Missing featured snippets for question queries
- Individual blog posts outranking vendor/brand pages

### Red Flags (Avoid)

- Major brands or authority domains in all top 5 positions
- Top results have 100+ referring domains
- All top content is comprehensive (3000+ words, well-structured)
- SERP features dominated by ads and knowledge panels
- Results are homogeneous (all same type/angle)

### Authority Domains by Vertical

- **B2B SaaS:** G2, Capterra, Gartner, TrustRadius, GetApp
- **Healthcare:** WebMD, Mayo Clinic, Cleveland Clinic, Healthline, NIH
- **General:** Amazon, NYTimes, CNET, PCMag

### Generic Domains (Forum/UGC — signal opportunity if ranking)
Wikipedia, YouTube, Reddit, Quora, Medium, Forbes, LinkedIn

---

## Content Gap Analysis

A content gap exists when one of these 5 types is present:

### 1. Format Gap
All results are guides/articles, but a tool, calculator, or template would serve better.
- **Detection:** All top results are text-based; query implies interactive need.

### 2. Freshness Gap
Top content is 2+ years old with outdated information.
- **Detection:** Published dates visible; industry has changed since publication.

### 3. Depth Gap
Top content is thin, lacks detail users need.
- **Detection:** Top results < 800 words; PAA questions go unanswered; forums ranking.

### 4. Angle Gap
All content takes the same approach; alternative perspective unrepresented.
- **Detection:** All results target same audience; missing practitioner perspective.

### 5. Audience Gap
Content exists but not for specific audience (e.g., "for startups", "for beginners").
- **Detection:** Results are generic, not audience-specific; audience qualifier in query not reflected.

---

## Scoring Keywords

### Opportunity Score (1-10)

Factors and approximate weights:

| Factor | Weight |
|--------|--------|
| Search volume (classified by vertical) | 25% |
| Competitiveness (SERP observation or KD) | 25% |
| Content gap presence and type | 20% |
| Intent alignment with purchase behavior | 20% |
| Community signal strength | 10% |

### Intent Value Multipliers

| Intent | Multiplier |
|--------|-----------|
| Transactional | 1.5x |
| Commercial | 1.2x |
| Informational | 1.0x |
| Navigational | 0.5x |

---

## Idea Scoring Dimensions & Weights

| Dimension | Weight | What it measures |
|-----------|--------|------------------|
| SEO Opportunity | 30% | Volume, difficulty, content gaps |
| Competitive Landscape | 20% | Room to differentiate, market maturity |
| Willingness to Pay | 25% | Evidence users pay for solutions |
| Differentiation Potential | 20% | Unique angle available |
| Expertise Alignment | 5% | Owner's ability to execute |

**Formula:**
```
Overall = (SEO × 0.30) + (Competitive × 0.20) + (WTP × 0.25) + (Differentiation × 0.20) + (Expertise × 0.05)
```

### Recommendations

| Overall Score | Confidence | Recommendation |
|--------------|------------|----------------|
| >= 7 | High/Medium | Tier 1 |
| 5-7 | Any | Tier 2 |
| >= 7 | Low | Tier 2 |
| < 5 | Any | Tier 3 |

---

## Quick Reference Filters

### "Quick Win" Keywords
- Difficulty: Low (SERP observation) or KD 0-10
- Volume: 100+ (B2C) or 30+ (B2B SaaS)
- Intent: Any

### "Core Opportunity" Keywords
- Difficulty: Low-Medium or KD 0-30
- Volume: Sweet spot for vertical
- Intent: Commercial or Transactional

### "Long-Tail Gold" Keywords
- Difficulty: Low or KD 0-20
- Volume: 50-500 (B2C) or 20-100 (B2B SaaS)
- Intent: Commercial or Transactional
- Words: 4+

---

## Tools Reference

| Tool | Use For |
|------|---------|
| Claude (Anthropic API) | Primary keyword research, content gap analysis, synthesis |
| OpenAI GPT-4o-mini (optional) | Secondary keyword perspective, pain-point focus |
| SerpAPI (optional) | Real SERP data validation, competitor domain detection |
| Ahrefs/SEMrush (when available) | Keyword difficulty scores, volume data, backlink analysis |
| Google Search Console | Your site's actual ranking data |
| Google Trends | Trend direction, seasonality |
| Upstash Redis | Caching analysis results |

---

## SEO Knowledge Module

The codebase includes a structured SEO knowledge base at `src/lib/seo-knowledge.ts` that provides:

- Keyword pattern templates by vertical (B2B SaaS, healthcare consumer, general niche)
- SERP analysis criteria with green/red flags and authority domains
- Content gap type definitions with detection signals
- Scoring framework with weights and intent multipliers
- Community/forum mappings by vertical
- Prompt builder functions for injecting knowledge into LLM prompts

---

## Updating This Guide

This guide should be updated when:

- Scoring weights change in `src/lib/seo-analysis.ts`
- New SERP features emerge
- Algorithm updates shift ranking factors
- Learnings from experiments reveal new patterns
- New verticals are added to the knowledge module

---

*Last updated: January 2026*
