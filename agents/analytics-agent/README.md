# Analytics Agent

**Status:** Implemented

## Purpose

Weekly performance tracking for published content on the secondlook site. Fetches Google Search Console data, matches page-level metrics to published content pieces, stores weekly snapshots, detects significant changes, and generates structured reports.

## How It Works

1. **Vercel Cron** runs every Sunday at 9:00 UTC (`/api/cron/analytics`)
2. Fetches GSC page-level and query+page data for a 7-day window
3. Matches GSC page URLs to published pieces by slug
4. Stores per-piece weekly snapshots in Redis (26-week TTL)
5. Compares vs previous week to detect significant changes
6. Generates a weekly report stored in Redis (52-week TTL)

## Change Detection

Alerts are generated when pieces have >= 10 impressions in at least one week:

| Condition | Severity |
|-----------|----------|
| Clicks up >= 50% | Positive |
| Clicks down >= 30% | Warning |
| Position improved by >= 5 | Positive |
| Position dropped by >= 5 | Warning |
| First appearance (>= 10 impressions) | Info |
| Had >5 clicks, now 0 | Warning |

## Endpoints

- `GET /api/cron/analytics` — Cron trigger (requires `CRON_SECRET`)
- `POST /api/cron/analytics` — Manual trigger from dashboard
- `GET /api/analytics/report` — Latest report (or `?week=2026-W05` for specific week)

## Dashboard

The `/analytics` page shows:
- Summary cards with week-over-week deltas
- Performance alerts (color-coded by severity)
- Per-piece performance table (sortable)
- Unmatched pages section
- Week selector for historical reports
- "Run Now" button for manual triggers

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANALYTICS_SITE_URL` | GSC property URL for secondlook (required) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | GSC authentication (existing) |
| `UPSTASH_REDIS_REST_URL` | Redis connection (existing) |
| `UPSTASH_REDIS_REST_TOKEN` | Redis auth (existing) |
| `CRON_SECRET` | Cron endpoint auth (existing) |

## Redis Keys

| Key | Type | TTL |
|-----|------|-----|
| `analytics:snapshot:{weekId}` | Hash | 26 weeks |
| `analytics:site_snapshot:{weekId}` | String | 26 weeks |
| `analytics:report:{weekId}` | String | 52 weeks |
| `analytics:report:latest` | String | None |
| `analytics:alerts` | List | Capped at 100 |
