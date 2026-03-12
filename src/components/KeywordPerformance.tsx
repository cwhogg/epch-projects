'use client';

import { GSCQueryRow } from '@/types';

interface KeywordPerformanceProps {
  queryData: GSCQueryRow[];
}

function QueryTable({ queries }: { queries: GSCQueryRow[] }) {
  return (
    <>
      {/* Mobile: card list */}
      <div className="sm:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
        {queries.map((q, i) => (
          <div key={i} className="py-3 space-y-1.5">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {q.query}
            </span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Clicks: </span>
                <span style={{ color: 'var(--text-primary)' }}>{q.clicks.toLocaleString()}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Impr: </span>
                <span style={{ color: 'var(--text-primary)' }}>{q.impressions.toLocaleString()}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>CTR: </span>
                <span style={{ color: 'var(--text-primary)' }}>{(q.ctr * 100).toFixed(1)}%</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Pos: </span>
                <span style={{ color: 'var(--text-primary)' }}>{q.position.toFixed(1)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              <th className="text-left py-2 pr-3 font-medium">Query</th>
              <th className="text-right py-2 pr-3 font-medium">Clicks</th>
              <th className="text-right py-2 pr-3 font-medium">Impressions</th>
              <th className="text-right py-2 pr-3 font-medium">CTR</th>
              <th className="text-right py-2 font-medium">Position</th>
            </tr>
          </thead>
          <tbody>
            {queries.map((q, i) => (
              <tr
                key={i}
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <td className="py-2 pr-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                  {q.query}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {q.clicks.toLocaleString()}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {q.impressions.toLocaleString()}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {(q.ctr * 100).toFixed(1)}%
                </td>
                <td className="py-2 text-right tabular-nums">
                  {q.position.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function KeywordPerformance({ queryData }: KeywordPerformanceProps) {
  const sorted = [...queryData].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

  return (
    <div className="card-static p-5 sm:p-6">
      <h2
        className="font-display text-base mb-4 flex items-center gap-2"
        style={{ color: 'var(--text-primary)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        Top Search Queries
      </h2>

      {sorted.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No search query data yet. GSC requires a minimum number of impressions before revealing individual queries.
        </p>
      ) : (
        <QueryTable queries={sorted} />
      )}
    </div>
  );
}
