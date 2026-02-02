'use client';

import { GSCQueryRow, KeywordComparison } from '@/types';

interface KeywordPerformanceProps {
  comparisons: KeywordComparison[];
  unexpectedWinners: GSCQueryRow[];
}

function StatusBadge({ comparison }: { comparison: KeywordComparison }) {
  if (!comparison.actual) {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full"
        style={{ background: 'rgba(107, 114, 128, 0.15)', color: '#9ca3af' }}
      >
        No data
      </span>
    );
  }
  if (comparison.actual.clicks > 0) {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full"
        style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399' }}
      >
        Getting clicks
      </span>
    );
  }
  if (comparison.actual.impressions > 0) {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full"
        style={{ background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24' }}
      >
        Impressions only
      </span>
    );
  }
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full"
      style={{ background: 'rgba(107, 114, 128, 0.15)', color: '#9ca3af' }}
    >
      No data
    </span>
  );
}

export default function KeywordPerformance({
  comparisons,
  unexpectedWinners,
}: KeywordPerformanceProps) {
  return (
    <div className="space-y-6">
      {/* Predicted Keywords */}
      <div className="card-static p-5 sm:p-6">
        <h2
          className="font-display text-base mb-4 flex items-center gap-2"
          style={{ color: 'var(--text-primary)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          Predicted Keywords Performance
        </h2>

        {comparisons.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No predicted keywords found in the analysis.
          </p>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="sm:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {comparisons.map((c, i) => (
                <div key={i} className="py-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {c.keyword}
                    </span>
                    <StatusBadge comparison={c} />
                  </div>
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {c.predicted?.intentType && <span>{c.predicted.intentType}</span>}
                    {c.predicted?.estimatedVolume && (
                      <>
                        <span>·</span>
                        <span>Vol: {c.predicted.estimatedVolume}</span>
                      </>
                    )}
                  </div>
                  {c.actual && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Clicks: </span>
                        <span style={{ color: 'var(--text-primary)' }}>{c.actual.clicks.toLocaleString()}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Impr: </span>
                        <span style={{ color: 'var(--text-primary)' }}>{c.actual.impressions.toLocaleString()}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>CTR: </span>
                        <span style={{ color: 'var(--text-primary)' }}>{(c.actual.ctr * 100).toFixed(1)}%</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Pos: </span>
                        <span style={{ color: 'var(--text-primary)' }}>{c.actual.position.toFixed(1)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: 'var(--text-muted)' }}>
                    <th className="text-left py-2 pr-3 font-medium">Keyword</th>
                    <th className="text-left py-2 pr-3 font-medium">Intent</th>
                    <th className="text-left py-2 pr-3 font-medium">Est. Volume</th>
                    <th className="text-right py-2 pr-3 font-medium">Clicks</th>
                    <th className="text-right py-2 pr-3 font-medium">Impressions</th>
                    <th className="text-right py-2 pr-3 font-medium">CTR</th>
                    <th className="text-right py-2 pr-3 font-medium">Position</th>
                    <th className="text-left py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((c, i) => (
                    <tr
                      key={i}
                      style={{
                        borderTop: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <td className="py-2 pr-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                        {c.keyword}
                      </td>
                      <td className="py-2 pr-3">{c.predicted?.intentType || '—'}</td>
                      <td className="py-2 pr-3">{c.predicted?.estimatedVolume || '—'}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {c.actual?.clicks.toLocaleString() ?? '—'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {c.actual?.impressions.toLocaleString() ?? '—'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {c.actual ? `${(c.actual.ctr * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {c.actual ? c.actual.position.toFixed(1) : '—'}
                      </td>
                      <td className="py-2">
                        <StatusBadge comparison={c} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Unexpected Winners */}
      {unexpectedWinners.length > 0 && (
        <div className="card-static p-5 sm:p-6">
          <h2
            className="font-display text-base mb-4 flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Unexpected Winners
          </h2>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Queries driving traffic that were not in your predicted keyword list.
          </p>

          {/* Mobile: card list */}
          <div className="sm:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {unexpectedWinners.map((q, i) => (
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
                {unexpectedWinners.map((q, i) => (
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
        </div>
      )}
    </div>
  );
}
