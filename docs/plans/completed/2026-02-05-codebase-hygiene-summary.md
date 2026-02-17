# Codebase Hygiene Plan — Summary

A cleanup pass across the codebase. Nothing here changes what the app does — it just makes the code safer, faster, easier to debug, and less repetitive. 20 tasks across 7 areas.

---

## 1. Safety Nets

**Make sure secrets can't accidentally get committed, and patch known vulnerabilities.**

We add `.env` files to `.gitignore` so API keys never end up in git. We also run `npm audit fix` to patch 3 known security issues in Next.js.

## 2. Test Coverage

**Add tests for the functions most likely to silently break.**

We install Vitest (a fast test runner) and write tests for 6 groups of existing functions that currently have zero coverage. These are all "parse some text, return structured data" functions — the kind where a small regex change can silently produce wrong results with no error. The functions already exist and work; we're just adding a safety net so we'll know if they break later.

What gets tested:
- How LLM output gets parsed into scores, recommendations, and risks
- How the publish pipeline decides which content piece to publish next
- How markdown gets transformed before going to production repos
- How analytics data gets grouped by week and how alerts are triggered
- How SEO keyword data gets parsed and compared
- How analysis markdown files get read from disk as a fallback

## 3. Code Deduplication

**Stop maintaining the same logic in multiple places.**

Several functions are copy-pasted across 2-3 files. When one copy gets updated, the others don't. We pull these into shared modules:

- **Redis connection** — the same "connect to Redis" code exists in 3 files. Now it's one file.
- **LLM JSON parsing** — the same "extract JSON from an AI response" code exists in 4 places. Now it's one function.
- **Common utilities** — `slugify`, fuzzy text matching, and score label formatting are each duplicated 2-3 times. Now they're in one place.
- **Leaderboard sorting** — the logic that ranks ideas by tier and confidence is duplicated between the database path and the file-system fallback path. Now it's one shared function.

## 4. Centralized Configuration

**Put model names and API clients in one place.**

The Claude model name (`claude-sonnet-4-20250514`) appears as a string literal 12 times across the codebase. Same for the Anthropic API client — it's instantiated fresh in 5 different files. We create a single config file for model names and a single shared client, so changing the model later is a one-line edit.

## 5. Loading Performance

**Make pages load faster by not fetching things we don't need upfront.**

Three changes:
- **Fonts** — instead of the browser fetching fonts from Google's servers (which blocks rendering), Next.js bundles them with the app. Same fonts, no network delay.
- **Heavy components** — the chart library (recharts, ~400KB) and markdown renderer (~100KB) only load when they're actually needed on screen, not upfront.
- **Google API dependency** — we only use Search Console, but we were importing the entire Google API library (~50MB). Switching to just the Search Console package speeds up serverless cold starts.

## 6. Fix Wasteful Data Fetching

**Stop fetching the same data twice on the analysis page.**

The analysis page calls the database to get all analyses, then calls a leaderboard function that internally fetches all analyses again. We fetch once and build the leaderboard in memory from that single result.

## 7. Error Visibility

**Make silent failures show up in logs.**

14 `catch` blocks across the codebase swallow errors without logging anything. When something goes wrong in these spots, there's no trace in Vercel logs. We add lightweight `console.debug` messages so failures are visible without changing how the app behaves.

## 8. Consistent Colors

**Replace ~127 hardcoded color values with named variables.**

Inline styles throughout the UI use raw hex codes like `#34d399`. The CSS already defines named variables like `--accent-emerald`. We replace the raw values with the named variables so colors are defined in one place and can be updated consistently.

---

## What's Not Changing

This pass explicitly avoids anything that changes app behavior: no new features, no component restructuring, no auth changes, no caching strategy changes. Every task is either additive (tests, logging) or mechanical replacement (same logic, better organized).
