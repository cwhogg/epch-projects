'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

const TrafficCharts = dynamic(() => import('./TrafficCharts'), { ssr: false });

interface SourceEntry {
  source: string;
  views: number;
}

interface DomainEntry {
  domain: string;
  views: number;
}

interface PageEntry {
  path: string;
  views: number;
}

interface DailyEntry {
  day: string;
  views: number;
  uniqueVisitors: number;
}

interface CampaignEntry {
  campaign: string;
  source: string;
  views: number;
}

interface BlogEntry {
  path: string;
  views: number;
  fromTwitter: number;
  fromGoogle: number;
  fromDirect: number;
}

export interface TrafficData {
  total: number;
  days: number;
  sources: SourceEntry[];
  domains: DomainEntry[];
  topPages: PageEntry[];
  daily: DailyEntry[];
  campaigns: CampaignEntry[];
  blogPosts: BlogEntry[];
}

const SOURCE_COLORS: Record<string, string> = {
  twitter: '#1DA1F2',
  google: '#4285F4',
  search_other: '#34A853',
  direct: '#94918C',
  referral: '#ff6b5b',
};

const SOURCE_LABELS: Record<string, string> = {
  twitter: 'Twitter/X',
  google: 'Google',
  search_other: 'Other Search',
  direct: 'Direct',
  referral: 'Referral',
};

function fmt(n: number): string {
  return n.toLocaleString();
}

export default function TrafficSourcesPanel({ filterPath }: { filterPath?: string }) {
  const [data, setData] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/traffic?days=${days}`);
      if (res.status === 503) {
        setError('not_configured');
        return;
      }
      if (!res.ok) {
        setError('Failed to fetch traffic data');
        return;
      }
      const result = await res.json();
      setData(result);
      setError(null);
    } catch {
      setError('Failed to fetch traffic data');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (error === 'not_configured') return null;

  if (error) {
    return (
      <div className="card-static p-4" style={{ borderLeft: '3px solid var(--color-danger)' }}>
        <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="card-static p-6 animate-shimmer" style={{ height: 80 }} />
        ))}
      </div>
    );
  }

  // Filter blog posts if filterPath given (e.g. for per-idea view)
  const blogPosts = filterPath
    ? data.blogPosts.filter((b) => b.path.startsWith(filterPath))
    : data.blogPosts;

  const topPages = filterPath
    ? data.topPages.filter((p) => p.path.startsWith(filterPath))
    : data.topPages;

  return (
    <section className="space-y-6">
      {/* Header + range selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2
          className="text-lg font-display flex items-center gap-2"
          style={{ color: 'var(--text-primary)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          Site Traffic — {fmt(data.total)} views
        </h2>
        <div className="flex gap-1.5">
          {[7, 14, 30, 60, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
              style={{
                background: days === d ? 'var(--accent-coral)' : 'var(--bg-secondary)',
                color: days === d ? '#fff' : 'var(--text-muted)',
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {data.total === 0 ? (
        <div className="card-static p-8 text-center" style={{ color: 'var(--text-muted)' }}>
          No page views recorded yet.
        </div>
      ) : (
        <>
          {/* Source summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {data.sources.map((s) => (
              <div key={s.source} className="card-static p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: SOURCE_COLORS[s.source] || '#6B7280' }}
                  />
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    {SOURCE_LABELS[s.source] || s.source}
                  </span>
                </div>
                <p className="text-xl font-display" style={{ color: 'var(--text-primary)' }}>
                  {fmt(s.views)}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {data.total > 0 ? `${((s.views / data.total) * 100).toFixed(0)}%` : '0%'}
                </p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <TrafficCharts daily={[...data.daily].reverse()} sources={data.sources} />

          {/* Top pages + Referrer domains */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top pages */}
            <div className="card-static p-5">
              <h3
                className="text-sm font-display mb-3 flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Top Pages
              </h3>
              <div className="space-y-1.5">
                {topPages.slice(0, 12).map((p, i) => (
                  <div key={p.path} className="flex justify-between items-center text-xs">
                    <span className="truncate max-w-[280px]" style={{ color: 'var(--text-secondary)' }}>
                      <span style={{ color: 'var(--text-muted)' }} className="mr-1.5">{i + 1}.</span>
                      {p.path}
                    </span>
                    <span className="font-mono ml-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {fmt(p.views)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Referrer domains */}
            <div className="card-static p-5">
              <h3
                className="text-sm font-display mb-3 flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Referrer Domains
              </h3>
              {data.domains.length > 0 ? (
                <div className="space-y-1.5">
                  {data.domains.slice(0, 12).map((d, i) => (
                    <div key={d.domain} className="flex justify-between items-center text-xs">
                      <span style={{ color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--text-muted)' }} className="mr-1.5">{i + 1}.</span>
                        {d.domain}
                      </span>
                      <span className="font-mono ml-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        {fmt(d.views)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No referrer data yet</p>
              )}
            </div>
          </div>

          {/* Blog post performance */}
          {blogPosts.length > 0 && (
            <div className="card-static p-5">
              <h3
                className="text-sm font-display mb-3"
                style={{ color: 'var(--text-primary)' }}
              >
                Blog Post Traffic by Source
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: 'var(--text-muted)' }}>
                      <th className="text-left py-2 pr-3 font-medium">#</th>
                      <th className="text-left py-2 pr-3 font-medium">Post</th>
                      <th className="text-right py-2 pr-3 font-medium">Total</th>
                      <th className="text-right py-2 pr-3 font-medium">Twitter</th>
                      <th className="text-right py-2 pr-3 font-medium">Google</th>
                      <th className="text-right py-2 font-medium">Direct</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blogPosts.map((b, i) => {
                      const slug = b.path.replace('/blog/', '');
                      return (
                        <tr key={b.path} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                          <td className="py-2 pr-3 font-mono" style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td className="py-2 pr-3 max-w-[260px] truncate" style={{ color: 'var(--text-secondary)' }}>
                            {slug}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {fmt(b.views)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono" style={{ color: '#1DA1F2' }}>
                            {fmt(b.fromTwitter)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono" style={{ color: '#4285F4' }}>
                            {fmt(b.fromGoogle)}
                          </td>
                          <td className="py-2 text-right font-mono" style={{ color: 'var(--text-muted)' }}>
                            {fmt(b.fromDirect)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* UTM Campaigns */}
          {data.campaigns.length > 0 && (
            <div className="card-static p-5">
              <h3
                className="text-sm font-display mb-3"
                style={{ color: 'var(--text-primary)' }}
              >
                UTM Campaigns
              </h3>
              <div className="space-y-1.5">
                {data.campaigns.map((c, i) => (
                  <div key={`${c.campaign}-${c.source}`} className="flex justify-between items-center text-xs">
                    <span className="truncate max-w-[350px]" style={{ color: 'var(--text-secondary)' }}>
                      <span style={{ color: 'var(--text-muted)' }} className="mr-1.5">{i + 1}.</span>
                      {c.campaign}
                      <span style={{ color: 'var(--text-muted)' }} className="ml-1">({c.source})</span>
                    </span>
                    <span className="font-mono ml-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {fmt(c.views)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
