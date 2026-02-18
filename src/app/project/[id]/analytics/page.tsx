'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
const AnalyticsChart = dynamic(() => import('@/components/AnalyticsChart'), { ssr: false });
import KeywordPerformance from '@/components/KeywordPerformance';
import PerformanceTable from '@/components/PerformanceTable';
import AlertsList from '@/components/AlertsList';
import SummaryCard from '@/components/SummaryCard';
import PropertySelectorWithHelper, { GSCProperty } from '@/components/PropertySelectorWithHelper';
import GSCSetupChecklist from '@/components/GSCSetupChecklist';
import WeeklySummaryCard from '@/components/WeeklySummaryCard';
import {
  GSCAnalyticsData,
  GSCQueryRow,
  KeywordComparison,
  GSCAnalyticsSummary,
} from '@/types';
import { fuzzyMatchPair } from '@/lib/utils';
import { useGSCData, AnalysisInfo } from '@/hooks/useGSCData';
import { useWeeklyReport } from '@/hooks/useWeeklyReport';


function buildComparisons(
  predictedKeywords: AnalysisInfo['seoData'] extends null ? never : NonNullable<AnalysisInfo['seoData']>['synthesis']['topKeywords'],
  queryData: GSCQueryRow[],
): { comparisons: KeywordComparison[]; unexpectedWinners: GSCQueryRow[]; summary: Partial<GSCAnalyticsSummary> } {
  const comparisons: KeywordComparison[] = [];
  const matchedQueries = new Set<string>();

  for (const kw of predictedKeywords) {
    const matchingRow = queryData.find((q) => fuzzyMatchPair(q.query, kw.keyword));
    if (matchingRow) {
      matchedQueries.add(matchingRow.query);
    }
    comparisons.push({
      keyword: kw.keyword,
      predicted: {
        intentType: kw.intentType,
        estimatedVolume: kw.estimatedVolume,
        estimatedCompetitiveness: kw.estimatedCompetitiveness,
      },
      actual: matchingRow
        ? {
            clicks: matchingRow.clicks,
            impressions: matchingRow.impressions,
            ctr: matchingRow.ctr,
            position: matchingRow.position,
          }
        : null,
    });
  }

  const unexpectedWinners = queryData
    .filter((q) => !matchedQueries.has(q.query) && !predictedKeywords.some((kw) => fuzzyMatchPair(q.query, kw.keyword)))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);

  const withTraffic = comparisons.filter((c) => c.actual && c.actual.impressions > 0).length;

  return {
    comparisons,
    unexpectedWinners,
    summary: {
      predictedKeywordsWithTraffic: withTraffic,
      totalPredictedKeywords: predictedKeywords.length,
    },
  };
}

function computeSummary(analytics: GSCAnalyticsData): Omit<GSCAnalyticsSummary, 'predictedKeywordsWithTraffic' | 'totalPredictedKeywords' | 'unpredictedQueries'> {
  const totalClicks = analytics.timeSeries.reduce((sum, r) => sum + r.clicks, 0);
  const totalImpressions = analytics.timeSeries.reduce((sum, r) => sum + r.impressions, 0);
  const averageCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

  let positionSum = 0;
  let positionCount = 0;
  for (const r of analytics.timeSeries) {
    if (r.impressions > 0) {
      positionSum += r.position * r.impressions;
      positionCount += r.impressions;
    }
  }
  const averagePosition = positionCount > 0 ? positionSum / positionCount : 0;

  const topQuery = analytics.queryData.length > 0
    ? analytics.queryData.sort((a, b) => b.clicks - a.clicks)[0].query
    : null;

  return { totalClicks, totalImpressions, averageCtr, averagePosition, topQuery };
}

export default function AnalyticsPage() {
  const params = useParams();
  const ideaId = params.id as string;

  const {
    loading,
    error,
    analysisInfo,
    linkedSiteUrl,
    analytics,
    properties,
    selectedProperty,
    setSelectedProperty,
    linking,
    refreshing,
    gscConfigured,
    handleLink,
    handleUnlink,
    handleRefresh,
    handlePropertyRefresh,
  } = useGSCData(ideaId);

  const {
    weeklyReport,
    availableWeeks,
    selectedWeek,
    reportLoading,
    runningReport,
    ideaPieces,
    ideaAlerts,
    ideaSummary,
    handleRunReport,
    handleWeekChange,
  } = useWeeklyReport(ideaId);

  // Build keyword comparisons
  const predictedKeywords = analysisInfo?.seoData?.synthesis?.topKeywords || [];
  const { comparisons, unexpectedWinners, summary: predictionSummary } = analytics
    ? buildComparisons(predictedKeywords, analytics.queryData)
    : { comparisons: [], unexpectedWinners: [], summary: {} };
  const overallSummary = analytics ? computeSummary(analytics) : null;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Link
          href={`/project/${ideaId}`}
          className="inline-flex items-center gap-1 text-sm mb-6 transition-colors hover:text-[var(--accent-coral)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          Back to Analysis
        </Link>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading analytics...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <header className="animate-slide-up stagger-1">
        <Link
          href={`/project/${ideaId}`}
          className="inline-flex items-center gap-1 text-sm mb-4 transition-colors hover:text-[var(--accent-coral)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          Back to Analysis
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display" style={{ color: 'var(--text-primary)' }}>
              Search Analytics
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {analysisInfo?.ideaName || 'Analysis'} — Google Search Console data
            </p>
          </div>
          {linkedSiteUrl && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="btn btn-ghost text-sm"
              >
                {refreshing ? 'Refreshing...' : 'Refresh Data'}
              </button>
              <button onClick={handleUnlink} className="btn btn-ghost text-sm" style={{ color: '#f87171' }}>
                Unlink
              </button>
            </div>
          )}
        </div>
      </header>

      {error && (
        <div
          className="p-4 rounded-lg text-sm"
          style={{ background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.2)' }}
        >
          {error}
        </div>
      )}

      {/* GSC not configured */}
      {!gscConfigured && (
        <div className="card-static p-8 text-center animate-slide-up stagger-2">
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(139, 92, 246, 0.1)' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className="text-lg font-display mb-2" style={{ color: 'var(--text-primary)' }}>
            Google Search Console Not Configured
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            Set <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-elevated)' }}>GOOGLE_SERVICE_ACCOUNT_JSON</code> or <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-elevated)' }}>GOOGLE_CLIENT_EMAIL</code> + <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-elevated)' }}>GOOGLE_PRIVATE_KEY</code> environment variables.
          </p>
        </div>
      )}

      {/* Property Linking */}
      {gscConfigured && !linkedSiteUrl && (
        <div className="card-static p-6 animate-slide-up stagger-2">
          <h2
            className="font-display text-base mb-4 flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Link GSC Property
          </h2>
          {properties.length === 0 ? (
            <GSCSetupChecklist
              onRefresh={handlePropertyRefresh}
            />
          ) : (
            <PropertySelectorWithHelper
              properties={properties}
              selectedProperty={selectedProperty}
              onSelectProperty={setSelectedProperty}
              onRefresh={handlePropertyRefresh}
              onLink={handleLink}
              linking={linking}
              ideaId={ideaId}
            />
          )}
        </div>
      )}

      {/* Analytics content */}
      {analytics && overallSummary && (
        <>
          {/* Linked property info */}
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Property: {analytics.siteUrl} · Data: {analytics.startDate} to {analytics.endDate}
            {analytics.fetchedAt && ` · Fetched: ${new Date(analytics.fetchedAt).toLocaleString()}`}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-slide-up stagger-2">
            <SummaryCard
              label="Total Clicks"
              value={overallSummary.totalClicks.toLocaleString()}
            />
            <SummaryCard
              label="Total Impressions"
              value={overallSummary.totalImpressions.toLocaleString()}
            />
            <SummaryCard
              label="Avg CTR"
              value={`${(overallSummary.averageCtr * 100).toFixed(1)}%`}
            />
            <SummaryCard
              label="Avg Position"
              value={overallSummary.averagePosition.toFixed(1)}
              subtitle={overallSummary.topQuery ? `Top: "${overallSummary.topQuery}"` : undefined}
            />
          </div>

          {/* Prediction Accuracy */}
          {predictedKeywords.length > 0 && predictionSummary.totalPredictedKeywords != null && (
            <div
              className="card-static p-5 animate-slide-up stagger-3"
            >
              <h2
                className="font-display text-base mb-3 flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                Prediction Accuracy
              </h2>
              <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                {predictionSummary.predictedKeywordsWithTraffic} of {predictionSummary.totalPredictedKeywords} predicted keywords received impressions
                ({predictionSummary.totalPredictedKeywords! > 0
                  ? `${Math.round((predictionSummary.predictedKeywordsWithTraffic! / predictionSummary.totalPredictedKeywords!) * 100)}%`
                  : '0%'})
              </p>
              <div
                className="w-full h-2 rounded-full overflow-hidden"
                style={{ background: 'var(--border-default)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${predictionSummary.totalPredictedKeywords! > 0
                      ? (predictionSummary.predictedKeywordsWithTraffic! / predictionSummary.totalPredictedKeywords!) * 100
                      : 0}%`,
                    background: '#34d399',
                  }}
                />
              </div>
            </div>
          )}

          {/* Time Series Chart */}
          {analytics.timeSeries.length > 0 && (
            <div className="animate-slide-up stagger-4">
              <AnalyticsChart timeSeries={analytics.timeSeries} />
            </div>
          )}

          {/* Keyword Comparison */}
          <div className="animate-slide-up stagger-5">
            <KeywordPerformance
              comparisons={comparisons}
              unexpectedWinners={unexpectedWinners}
            />
          </div>

          {/* Per-page Performance */}
          {analytics.pageData.length > 0 && (
            <div className="card-static p-5 sm:p-6 animate-slide-up stagger-6">
              <h2
                className="font-display text-base mb-4 flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                Per-Page Performance
              </h2>
              {/* Mobile: card list */}
              <div className="sm:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {analytics.pageData.map((page, i) => (
                  <div key={i} className="py-3 space-y-1.5">
                    <span className="text-sm font-medium break-all" style={{ color: 'var(--text-primary)' }}>
                      {page.query}
                    </span>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Clicks: </span>
                        <span style={{ color: 'var(--text-primary)' }}>{page.clicks.toLocaleString()}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Impr: </span>
                        <span style={{ color: 'var(--text-primary)' }}>{page.impressions.toLocaleString()}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>CTR: </span>
                        <span style={{ color: 'var(--text-primary)' }}>{(page.ctr * 100).toFixed(1)}%</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Pos: </span>
                        <span style={{ color: 'var(--text-primary)' }}>{page.position.toFixed(1)}</span>
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
                      <th className="text-left py-2 pr-3 font-medium">URL</th>
                      <th className="text-right py-2 pr-3 font-medium">Clicks</th>
                      <th className="text-right py-2 pr-3 font-medium">Impressions</th>
                      <th className="text-right py-2 pr-3 font-medium">CTR</th>
                      <th className="text-right py-2 font-medium">Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.pageData.map((page, i) => (
                      <tr
                        key={i}
                        style={{
                          borderTop: '1px solid var(--border-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <td className="py-2 pr-3 max-w-xs truncate" style={{ color: 'var(--text-primary)' }}>
                          {page.query}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {page.clicks.toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {page.impressions.toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {(page.ctr * 100).toFixed(1)}%
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {page.position.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Weekly Report — Per-Piece Performance */}
      {!reportLoading && ideaPieces.length > 0 && ideaSummary && (
        <>
          {/* Divider between GSC and weekly report sections */}
          <div className="pt-2">
            <div style={{ borderTop: '1px solid var(--border-default)' }} />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-display flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20V10" />
                <path d="M18 20V4" />
                <path d="M6 20v-4" />
              </svg>
              Weekly Performance
            </h2>
            <div className="flex flex-wrap items-center gap-2">
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
                onClick={handleRunReport}
                disabled={runningReport}
                className="btn btn-ghost text-sm"
              >
                {runningReport ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Running...
                  </>
                ) : (
                  'Run Report'
                )}
              </button>
            </div>
          </div>

          {/* Weekly Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <WeeklySummaryCard
              label="Weekly Clicks"
              value={ideaSummary.totalClicks}
              change={ideaSummary.clicksChange}
            />
            <WeeklySummaryCard
              label="Weekly Impressions"
              value={ideaSummary.totalImpressions}
              change={ideaSummary.impressionsChange}
            />
            <WeeklySummaryCard
              label="Avg Position"
              value={ideaSummary.averagePosition}
              change={null}
              format="position"
            />
            <WeeklySummaryCard
              label="Avg CTR"
              value={ideaSummary.averageCtr}
              change={null}
              format="percent"
            />
          </div>

          {/* Alerts for this idea */}
          {ideaAlerts.length > 0 && (
            <section>
              <h3 className="text-base font-display mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Alerts
              </h3>
              <AlertsList alerts={ideaAlerts} />
            </section>
          )}

          {/* Per-Piece Performance Table */}
          <section>
            <h3 className="text-base font-display mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-violet)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Per-Piece Performance
            </h3>
            <PerformanceTable pieces={ideaPieces} />
          </section>

          {/* Report metadata */}
          <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
            Report for week {weeklyReport!.weekId} — generated {new Date(weeklyReport!.generatedAt).toLocaleString()}
          </p>
        </>
      )}

      {/* No weekly report data prompt */}
      {!reportLoading && ideaPieces.length === 0 && !weeklyReport && (
        <div className="card-static p-6 text-center">
          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
            No weekly performance report yet. Run the analytics agent to track per-piece performance.
          </p>
          <button onClick={handleRunReport} disabled={runningReport} className="btn btn-ghost text-sm">
            {runningReport ? 'Running...' : 'Run Report'}
          </button>
        </div>
      )}
    </div>
  );
}
