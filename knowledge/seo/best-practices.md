# SEO Best Practices

Reference guide for agents doing SEO analysis and content creation.

---

## Keyword Difficulty (Ahrefs Scale 0-100)

| Range | Label | Guidance |
|-------|-------|----------|
| 0-10 | Very Easy | Target aggressively. Quick wins for new sites. |
| 11-30 | Easy | Strong opportunities. Should rank within 3-6 months with good content. |
| 31-50 | Medium | Need exceptional content + some backlinks. Consider only for high-value keywords. |
| 51-70 | Hard | Requires significant authority. Avoid for new sites. |
| 71+ | Very Hard | Dominated by major brands. Do not target. |

**Default filter:** KD 0-30 for all new site opportunities.

---

## Search Volume Thresholds

| Volume | Classification | Notes |
|--------|----------------|-------|
| 10,000+ | High volume | Usually high competition. Rarely worth targeting directly. |
| 2,000-10,000 | Medium volume | Good if KD is low. Often long-tail variations are better. |
| 200-2,000 | Sweet spot | Ideal for niche B2C. Enough traffic to matter, low enough to rank. |
| 50-200 | Long-tail | Good if high intent. Multiple long-tails can add up. |
| < 50 | Very low | Only worth it for extremely high-intent commercial keywords. |

**Default filter:** 200+ monthly searches, or 50+ if clear commercial intent.

---

## Search Intent Types

| Intent | Signals | Value for B2C |
|--------|---------|---------------|
| **Transactional** | "buy," "pricing," "discount," "coupon" | Highest — ready to purchase |
| **Commercial** | "best," "vs," "review," "top," "alternative" | High — comparing options |
| **Informational** | "how to," "what is," "guide," "tips" | Medium — building awareness |
| **Navigational** | Brand names, specific product names | Low — already decided |

**Priority order:** Transactional > Commercial > Informational

---

## Ideal Target Keywords

A keyword is a strong opportunity if it meets ALL criteria:

- [ ] KD: 0-30 (prefer 0-15)
- [ ] Volume: 200-2,000/month (or 50+ if high intent)
- [ ] Intent: Commercial or Transactional
- [ ] Length: 3+ words (long-tail)
- [ ] SERP: No major brands dominating top 5
- [ ] Content gap: Weak/outdated content currently ranking

---

## Long-Tail Keyword Strategy

Long-tail keywords (3-5+ words) are ideal because:

- Lower competition than head terms
- Higher intent (more specific = closer to action)
- Easier to create focused content
- Can rank faster

### Long-Tail Modifiers to Look For

**Comparison:** vs, versus, or, compared to, alternative
**Best/Top:** best, top, #1, leading
**Problem:** help, fix, solve, stop, prevent
**Specificity:** for [audience], for [use case], without [limitation]
**Questions:** how to, what is, why does, can I, should I

### Example Transformations

| Head Term | Long-Tail Version |
|-----------|-------------------|
| habit tracker | best habit tracker app for iphone |
| meal planning | how to meal plan for weight loss |
| sleep app | sleep app without subscription |

---

## SERP Analysis

### Green Flags (Opportunity Exists)

- Forums (Reddit, Quora) ranking in top 10
- Content older than 2 years in top positions
- Thin content (< 500 words) ranking well
- Low Domain Rating sites (DR < 30) in top 5
- "People Also Ask" boxes (content gaps)
- Missing featured snippets for question queries

### Red Flags (Avoid)

- Major brands (Amazon, WebMD, Mayo Clinic, etc.) in all top 5 positions
- Top results have 100+ referring domains
- All top content is comprehensive (3000+ words, well-structured)
- SERP features dominated by ads and knowledge panels
- Results are homogeneous (all same type/angle)

### How to Check

1. Search the keyword in incognito mode
2. Note the top 5 results: site, type, apparent quality
3. Use Ahrefs/Moz to check DR and backlinks of ranking pages
4. Look for patterns across top 10

---

## Content Gap Analysis

A content gap exists when:

1. **Format gap:** All results are guides, but a tool/calculator would serve better
2. **Freshness gap:** Top content is 2+ years old with outdated info
3. **Depth gap:** Top content is thin, lacks detail users need
4. **Angle gap:** All content takes same approach, alternative perspective unrepresented
5. **Audience gap:** Content exists but not for specific audience (e.g., "for beginners")

### Finding Gaps

- Read top 3-5 results for the keyword
- Check comments/reviews for unmet needs
- Look at "People Also Ask" for unanswered questions
- Search Reddit/forums for complaints about existing content

---

## Keyword Clustering

Group keywords by:

### Topic Clusters

Keywords that can be served by a single piece of content or closely related pages.

Example cluster: "habit tracking"
- best habit tracker app
- free habit tracker
- habit tracker template
- how to track habits
- daily habit tracker

### Intent Clusters

Keywords with same intent that might need similar content types.

- Commercial cluster: best X, top X, X reviews
- Informational cluster: how to X, X guide, X tips

### Priority Clusters

Rank clusters by opportunity score:

```
Opportunity Score = (Total Volume × Intent Weight) / Average KD

Intent Weight:
- Transactional: 1.5
- Commercial: 1.2
- Informational: 1.0
```

---

## Scoring Keywords

Rate each keyword opportunity 1-10:

| Score | Meaning |
|-------|---------|
| 9-10 | Perfect fit: Low KD, good volume, commercial intent, clear gap |
| 7-8 | Strong opportunity: Meets most criteria with minor concerns |
| 5-6 | Moderate: Mixed signals, worth testing with caveats |
| 3-4 | Weak: High difficulty or low intent, only if no alternatives |
| 1-2 | Poor: Major red flags, do not pursue |

---

## Quick Reference Filters

### "Quick Win" Keywords
- KD: 0-10
- Volume: 100+
- Intent: Any

### "Core Opportunity" Keywords
- KD: 0-30
- Volume: 200-2,000
- Intent: Commercial or Transactional

### "Long-Tail Gold" Keywords
- KD: 0-20
- Volume: 50-500
- Intent: Commercial or Transactional
- Words: 4+

---

## Tools Reference

| Tool | Use For |
|------|---------|
| Ahrefs | Keyword data, competitor analysis, SERP analysis |
| Google Search Console | Your site's actual ranking data |
| Google Trends | Trend direction, seasonality |
| AnswerThePublic | Question-based keyword ideas |
| AlsoAsked | "People Also Ask" mining |

---

## Updating This Guide

This guide should be updated when:

- Ahrefs scoring methodology changes
- New SERP features emerge
- Algorithm updates shift ranking factors
- Learnings from experiments reveal new patterns

---

*Last updated: January 2025*
