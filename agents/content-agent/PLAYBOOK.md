# Content Agent — Playbook

## How to Use

### Step 1: Run Research First

Content generation requires a completed analysis. Ensure the idea has been analyzed with the research agent (analysis detail page shows scores and SEO data).

### Step 2: Generate Content Calendar

1. Navigate to the analysis detail page (`/analyses/[id]`)
2. Scroll to the "Content Generation" section below SEO Deep Dive
3. Click **Generate Content** (or **View Content** if a calendar already exists)
4. Wait for the calendar to generate (single Claude API call, usually <30s)
5. Review the strategy summary and prioritized content pieces

### Step 3: Select and Generate Content

1. On the content calendar page, review each proposed piece
2. Check the boxes next to pieces you want to generate
3. Use "Select All Pending" for bulk selection
4. Click **Generate Selected**
5. Watch the progress page — each piece generates sequentially
6. Generation redirects back to the calendar when complete

### Step 4: Review Generated Content

1. Click any completed piece title (green checkmark) to view it
2. Content renders as formatted markdown with the YAML frontmatter stripped
3. Use **Copy** to copy raw markdown to clipboard
4. Use **Download** to save as `.md` file
5. Content is also saved to `experiments/[idea-name]/content/` on disk

## Tips

- **Re-generate calendar**: Click "Regenerate Calendar" to get a fresh set of content recommendations
- **Partial generation**: If generation fails partway through (Vercel timeout), already-completed pieces are saved. Return to the calendar and generate the remaining pieces.
- **Content quality**: Each piece gets the full research context (SEO data, competitor analysis, expertise profile). The prompts are type-specific, not generic.
- **Stale data warning**: If the analysis is old, the content may reference outdated competitor data. Consider re-analyzing first.

## Troubleshooting

| Issue | Resolution |
|-------|------------|
| Calendar generation fails | Check that the analysis has SEO data (seoData field in analysis_content). Re-analyze if needed. |
| Content piece is blank | Check API logs for Claude API errors. May hit rate limits with multiple pieces. |
| Vercel timeout (504) | Content generates sequentially. Select fewer pieces per batch, or deploy with longer timeout. |
| Files not appearing in experiments/ | Only works in development. Vercel deployments don't have persistent filesystem. |
| "No analysis found" error | The idea needs a completed research analysis before content generation. |

## File Organization

Generated files follow this structure:

```
experiments/
  [idea-slug]/
    content/
      _calendar.md          # Index with strategy + piece table
      blog-[slug].md        # Each blog post
      landing-page.md       # Landing page copy
      comparison-[slug].md  # Comparison articles
      faq-[slug].md         # FAQ pages
    competitors.md          # From research agent
    analysis.md             # From research agent
    keywords.md             # From research agent
```

## Content Types Deep Dive

### Blog Post
- Targets informational/commercial keywords from SEO research
- Uses People Also Ask as H2/H3 headings
- References competitor gaps as opportunities
- 1500-3000 words with YAML frontmatter
- Best for: building organic traffic and topical authority

### Landing Page
- Conversion-focused copy with clear CTA sections
- Uses competitor weaknesses for differentiation
- Includes FAQ from real PAA data
- Best for: converting search traffic to signups

### Comparison Article
- Honest "X vs Y" format with overview table
- Uses real competitor pricing and feature data
- Balanced treatment — acknowledges competitor strengths
- Best for: capturing high-intent "alternative to" searches

### FAQ Page
- Schema-friendly Q&A format
- Directly uses People Also Ask questions from SERP validation
- Organized by category
- Best for: quick win targeting many long-tail queries simultaneously
