'use client';

import { useState, useEffect, useCallback } from 'react';
import { WeeklyReport } from '@/types';
import PerformanceTable from '@/components/PerformanceTable';
import AlertsList from '@/components/AlertsList';

interface ReportResponse {
  report: WeeklyReport;
  availableWeeks: string[];
}

function SummaryCard({
  label,
  value,
  change,
  format,
}: {
  label: string;
  value: number;
  change: number | null;
  format?: 'number' | 'position' | 'percent';
}) {
  const fmt = format ?? 'number';
  let display: string;
  if (fmt === 'percent') {
    display = `${(value * 100).toFixed(1)}%`;
  } else if (fmt === 'position') {
    display = value.toFixed(1);
  } else {
    display = value.toLocaleString();
  }

  let changeDisplay: React.ReactNode = null;
  if (change !== null && change !== 0) {
    // For position, negative change is improvement (lower rank number)
    const isGood = fmt === 'position' ? change < 0 : change > 0;
    const color = isGood ? '#34d399' : '#f87171';
    const arrow = isGood ? (fmt === 'position' ? '↑' : '↑') : (fmt === 'position' ? '↓' : '↓');
    const displayVal = fmt === 'percent'
      ? `${(Math.abs(change) * 100).toFixed(1)}%`
      : Math.abs(change).toLocaleString();
    changeDisplay = (
      <span className="text-sm ml-2" style={{ color }}>
        {arrow} {displayVal}
      </span>
    );
  }

  return (
    <div className="card-static p-5">
      <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>
        {display}
        {changeDisplay}
      </p>
    </div>
  );
}

export default function AnalyticsPage() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async (week?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = week
        ? `/api/analytics/report?week=${encodeURIComponent(week)}`
        : '/api/analytics/report';
      const res = await fetch(url);
      if (res.status === 404) {
        const data = await res.json();
        setReport(null);
        setAvailableWeeks(data.availableWeeks || []);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch report: ${res.status}`);
      }
      const data: ReportResponse = await res.json();
      setReport(data.report);
      setAvailableWeeks(data.availableWeeks || []);
      if (!week) setSelectedWeek(data.report.weekId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  async function handleRunNow() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/cron/analytics', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to run analytics');
      }
      // Refresh the report
      await fetchReport();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run analytics');
    } finally {
      setRunning(false);
    }
  }

  function handleWeekChange(week: string) {
    setSelectedWeek(week);
    fetchReport(week);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="animate-slide-up stagger-1">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl sm:text-3xl font-display" style={{ color: 'var(--text-primary)' }}>
              Analytics
            </h1>
            <div className="flex items-center gap-3 shrink-0">
            {availableWeeks.length > 0 && (
              <select
                value={selectedWeek}
                onChange={(e) => handleWeekChange(e.target.value)}
                className="input text-sm"
                style={{ width: 'auto', padding: '0.5rem 0.75rem' }}
              >
                {availableWeeks.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            )}
            <button
              onClick={handleRunNow}
              disabled={running}
              className="btn btn-primary text-sm"
            >
              {running ? (
                <>
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Running...
                </>
              ) : (
                'Run Now'
              )}
            </button>
            </div>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Weekly performance tracking for published content
          </p>
        </div>
      </header>

      {error && (
        <div className="card-static p-4" style={{ borderLeft: '3px solid #f87171' }}>
          <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
        </div>
      )}

      {loading && !report && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card-static p-6 animate-shimmer" style={{ height: 80 }} />
          ))}
        </div>
      )}

      {!loading && !report && (
        <div className="card-static p-8 sm:p-12 text-center animate-slide-up stagger-2">
          <div
            className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--accent-coral-soft)' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20V10" />
              <path d="M18 20V4" />
              <path d="M6 20v-4" />
            </svg>
          </div>
          <h2 className="text-xl font-display mb-2" style={{ color: 'var(--text-primary)' }}>
            No analytics data yet
          </h2>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
            Run the analytics agent to generate your first weekly report.
          </p>
          <button onClick={handleRunNow} disabled={running} className="btn btn-primary">
            {running ? 'Running...' : 'Run Analytics Now'}
          </button>
        </div>
      )}

      {report && (
        <>
          {/* Summary Cards */}
          <section className="animate-slide-up stagger-2">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                label="Total Clicks"
                value={report.siteSummary.totalClicks}
                change={report.siteSummary.clicksChange}
              />
              <SummaryCard
                label="Impressions"
                value={report.siteSummary.totalImpressions}
                change={report.siteSummary.impressionsChange}
              />
              <SummaryCard
                label="Avg Position"
                value={report.siteSummary.averagePosition}
                change={null}
                format="position"
              />
              <SummaryCard
                label="Avg CTR"
                value={report.siteSummary.averageCtr}
                change={null}
                format="percent"
              />
            </div>
          </section>

          {/* Alerts */}
          {report.alerts.length > 0 && (
            <section className="animate-slide-up stagger-3">
              <h2 className="text-lg font-display mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Alerts
              </h2>
              <AlertsList alerts={report.alerts} />
            </section>
          )}

          {/* Performance Table */}
          <section className="animate-slide-up stagger-4">
            <h2 className="text-lg font-display mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20V10" />
                <path d="M18 20V4" />
                <path d="M6 20v-4" />
              </svg>
              Per-Piece Performance
            </h2>
            <PerformanceTable pieces={report.pieces} />
          </section>

          {/* Unmatched Pages */}
          {report.unmatchedPages.length > 0 && (
            <section className="animate-slide-up stagger-5">
              <h2 className="text-lg font-display mb-4" style={{ color: 'var(--text-primary)' }}>
                Unmatched Pages
              </h2>
              <div className="card-static overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Page
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Clicks
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Impressions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.unmatchedPages.map((page, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td className="px-4 py-2 truncate max-w-xs" style={{ color: 'var(--text-secondary)' }}>
                          {page.query}
                        </td>
                        <td className="px-4 py-2" style={{ color: 'var(--text-primary)' }}>
                          {page.clicks}
                        </td>
                        <td className="px-4 py-2" style={{ color: 'var(--text-primary)' }}>
                          {page.impressions}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Report metadata */}
          <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
            Report for week {report.weekId} — generated {new Date(report.generatedAt).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}
