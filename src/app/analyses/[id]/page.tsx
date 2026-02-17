import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAnalysisFromDb, getAnalysisContent, getContentCalendar, getContentPieces, getGSCLink, getGSCAnalytics, isRedisConfigured } from '@/lib/db';
import { getAllFoundationDocs, getCanvasState, getAllAssumptions, getPivotSuggestions, getPivotHistory } from '@/lib/db';
import { getPaintedDoorSite, getEmailSignupCount } from '@/lib/painted-door-db';
import { getAnalysis } from '@/lib/data';
import ScoreRing from '@/components/ScoreRing';
import ValidationCanvas from '@/components/ValidationCanvas';
import { Analysis, FoundationDocType, FOUNDATION_DOC_TYPES, ASSUMPTION_TYPES } from '@/types';
import type { ValidationCanvasData } from '@/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface DashboardData {
  analysis: Analysis;
  seoData?: string;
  foundationDocs: Partial<Record<FoundationDocType, boolean>>;
  foundationCount: number;
  websiteStatus: string | null;
  websiteDomain: string | null;
  websiteSignups: number;
  contentTotal: number;
  contentComplete: number;
  contentPending: number;
  contentTypes: string[];
  hasGSCLink: boolean;
  gscImpressions: number | null;
  gscClicks: number | null;
  gscCTR: number | null;
  risks: string[];
  agreedKeywords: number;
  serpValidated: number;
  validationCanvas: ValidationCanvasData | null;
}

const FOUNDATION_LABELS: Record<FoundationDocType, string> = {
  'strategy': 'Strategy',
  'positioning': 'Positioning',
  'brand-voice': 'Brand Voice',
  'design-principles': 'Design Principles',
  'seo-strategy': 'SEO Strategy',
  'social-media-strategy': 'Social Media',
};

function getBadgeClass(rec: string) {
  switch (rec) {
    case 'Tier 1': return 'badge-success';
    case 'Tier 2': return 'badge-warning';
    case 'Tier 3': return 'badge-danger';
    default: return 'badge-neutral';
  }
}

function getConfidenceStyle(conf: string) {
  switch (conf) {
    case 'High': return { color: 'var(--accent-emerald)' };
    case 'Medium': return { color: 'var(--accent-amber)' };
    case 'Low': return { color: 'var(--color-danger)' };
    default: return { color: 'var(--text-muted)' };
  }
}

function getWebsiteStatusStyle(status: string) {
  switch (status) {
    case 'live': return { bg: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)' };
    case 'deploying':
    case 'pushing':
    case 'generating': return { bg: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)' };
    case 'failed': return { bg: 'rgba(248, 113, 113, 0.15)', color: 'var(--color-danger)' };
    default: return { bg: 'rgba(113, 113, 122, 0.1)', color: 'var(--text-muted)' };
  }
}

function getWebsiteStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

async function getDashboardData(id: string): Promise<DashboardData | null> {
  if (isRedisConfigured()) {
    const analysis = await getAnalysisFromDb(id);
    if (!analysis) return null;

    const [content, foundationDocsMap, calendar, pieces, gscLink, pdSite, canvasState] = await Promise.all([
      getAnalysisContent(id),
      getAllFoundationDocs(analysis.ideaId).catch(() => ({})),
      getContentCalendar(id),
      getContentPieces(id),
      getGSCLink(id),
      getPaintedDoorSite(id).catch(() => null),
      getCanvasState(id).catch(() => null),
    ]);

    // Parse SEO data for analysis card summary
    let agreedKeywords = 0;
    let serpValidated = 0;
    if (content?.seoData) {
      try {
        const seo = JSON.parse(content.seoData);
        agreedKeywords = seo.synthesis?.comparison?.agreedKeywords?.length ?? 0;
        serpValidated = seo.synthesis?.serpValidated?.filter((v: { hasContentGap: boolean }) => v.hasContentGap)?.length ?? 0;
      } catch { /* ignore parse errors */ }
    }

    // Get signup count if site exists
    const websiteSignups = pdSite ? await getEmailSignupCount(pdSite.id).catch(() => 0) : 0;

    // Fetch validation canvas data
    let validationCanvas: ValidationCanvasData | null = null;
    if (canvasState) {
      const [canvasAssumptions, ...pivotResults] = await Promise.all([
        getAllAssumptions(id).catch(() => ({})),
        ...ASSUMPTION_TYPES.flatMap(aType => [
          getPivotSuggestions(id, aType).catch(() => []),
          getPivotHistory(id, aType).catch(() => []),
        ]),
      ]);
      const canvasPivotSuggestions: Record<string, unknown[]> = {};
      const canvasPivotHistory: Record<string, unknown[]> = {};
      ASSUMPTION_TYPES.forEach((aType, i) => {
        const sug = pivotResults[i * 2] as unknown[];
        const hist = pivotResults[i * 2 + 1] as unknown[];
        if (sug.length > 0) canvasPivotSuggestions[aType] = sug;
        if (hist.length > 0) canvasPivotHistory[aType] = hist;
      });
      validationCanvas = {
        canvas: canvasState,
        assumptions: canvasAssumptions as Record<string, unknown>,
        pivotSuggestions: canvasPivotSuggestions,
        pivotHistory: canvasPivotHistory,
      } as unknown as ValidationCanvasData;
    }

    // Get GSC summary metrics if linked
    let gscImpressions: number | null = null;
    let gscClicks: number | null = null;
    let gscCTR: number | null = null;
    if (gscLink) {
      const gscData = await getGSCAnalytics(analysis.ideaId).catch(() => null);
      if (gscData?.timeSeries?.length) {
        // Sum last 7 days
        const last7 = gscData.timeSeries.slice(-7);
        gscImpressions = last7.reduce((sum, d) => sum + d.impressions, 0);
        gscClicks = last7.reduce((sum, d) => sum + d.clicks, 0);
        gscCTR = gscImpressions > 0 ? (gscClicks / gscImpressions) * 100 : 0;
      }
    }

    const foundationDocs: Partial<Record<FoundationDocType, boolean>> = {};
    for (const docType of FOUNDATION_DOC_TYPES) {
      foundationDocs[docType] = docType in foundationDocsMap;
    }

    const completePieces = pieces.filter(p => p.status === 'complete');
    const pendingPieces = pieces.filter(p => p.status === 'pending' || p.status === 'generating');
    const contentTypes = [...new Set(pieces.map(p => p.type))];

    return {
      analysis,
      seoData: content?.seoData,
      foundationDocs,
      foundationCount: Object.keys(foundationDocsMap).length,
      websiteStatus: pdSite?.status ?? null,
      websiteDomain: pdSite?.siteUrl ?? null,
      websiteSignups,
      contentTotal: calendar?.pieces.length ?? 0,
      contentComplete: completePieces.length,
      contentPending: pendingPieces.length,
      contentTypes: contentTypes.map(t => t.replace(/-/g, ' ')),
      hasGSCLink: !!gscLink,
      gscImpressions,
      gscClicks,
      gscCTR,
      risks: analysis.risks ?? [],
      agreedKeywords,
      serpValidated,
      validationCanvas,
    };
  }

  // Filesystem fallback
  const fallback = getAnalysis(id);
  if (!fallback) return null;
  return {
    analysis: fallback.analysis,
    foundationDocs: {},
    foundationCount: 0,
    websiteStatus: null,
    websiteDomain: null,
    websiteSignups: 0,
    contentTotal: 0,
    contentComplete: 0,
    contentPending: 0,
    contentTypes: [],
    hasGSCLink: false,
    gscImpressions: null,
    gscClicks: null,
    gscCTR: null,
    risks: fallback.analysis.risks ?? [],
    agreedKeywords: 0,
    serpValidated: 0,
    validationCanvas: null,
  };
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default async function ProjectDashboard({ params }: PageProps) {
  const { id } = await params;
  const data = await getDashboardData(id);

  if (!data) {
    notFound();
  }

  const { analysis } = data;

  const getHeaderGradient = () => {
    switch (analysis.recommendation) {
      case 'Tier 1': return 'radial-gradient(ellipse at top left, rgba(52, 211, 153, 0.1) 0%, transparent 50%)';
      case 'Tier 2': return 'radial-gradient(ellipse at top left, rgba(251, 191, 36, 0.08) 0%, transparent 50%)';
      case 'Tier 3': return 'radial-gradient(ellipse at top left, rgba(248, 113, 113, 0.08) 0%, transparent 50%)';
      default: return 'none';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <header
        className="animate-slide-up stagger-1 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2 pb-6 rounded-xl"
        style={{ background: getHeaderGradient() }}
      >
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm mb-4 transition-colors hover:text-[var(--accent-coral)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back to Projects
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display" style={{ color: 'var(--text-primary)' }}>
              {analysis.ideaName}
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Analyzed on {new Date(analysis.completedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-3">
              <span className={`badge ${getBadgeClass(analysis.recommendation)}`}>
                {analysis.recommendation}
              </span>
              <span className="text-sm font-medium" style={getConfidenceStyle(analysis.confidence)}>
                {analysis.confidence}
              </span>
            </div>
            {data.websiteStatus === 'live' && data.websiteDomain && (
              <a
                href={data.websiteDomain.startsWith('http') ? data.websiteDomain : `https://${data.websiteDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost text-sm"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                View Site
              </a>
            )}
            {!data.websiteStatus && (
              <Link href={`/analyses/${id}/painted-door`} className="btn btn-ghost text-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                Create Website
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Validation Canvas */}
      {data.validationCanvas && (
        <ValidationCanvas
          ideaId={id}
          canvas={data.validationCanvas.canvas}
          assumptions={data.validationCanvas.assumptions}
          pivotSuggestions={data.validationCanvas.pivotSuggestions}
          pivotHistory={data.validationCanvas.pivotHistory}
        />
      )}

      {/* Pipeline Summary Cards */}
      <div className="flex flex-col gap-3">

        {/* Analysis Card */}
        <Link href={`/analyses/${id}/analysis`} className="card-static p-5 block transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg animate-slide-up stagger-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Analysis</span>
            <svg className="transition-transform" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </div>
          <div className="flex items-center gap-5 mt-3">
            <ScoreRing score={analysis.scores.overall} label="" size={44} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-display text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                  {analysis.recommendation} — {analysis.recommendation === 'Tier 1' ? 'Pursue' : analysis.recommendation === 'Tier 2' ? 'Explore' : analysis.recommendation === 'Tier 3' ? 'Deprioritize' : ''}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  SEO {analysis.scores.seoOpportunity ?? '?'} · Competition {analysis.scores.competitiveLandscape ?? '?'} · WTP {analysis.scores.willingnessToPay ?? '?'} · Differentiation {analysis.scores.differentiationPotential ?? '?'} · Expertise {analysis.scores.expertiseAlignment ?? '?'}
                </span>
              </div>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {data.risks.length > 0 ? `${data.risks.length} key risk${data.risks.length !== 1 ? 's' : ''} identified` : 'No risks flagged'}
                {data.agreedKeywords > 0 ? ` · ${data.agreedKeywords} agreed keywords` : ''}
                {data.serpValidated > 0 ? ` · ${data.serpValidated} SERP-validated content gaps` : ''}
              </p>
            </div>
          </div>
        </Link>

        {/* Foundation Card */}
        <Link href={`/analyses/${id}/foundation`} className="card-static p-5 block transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg animate-slide-up stagger-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Foundation Documents</span>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-1">
                  {FOUNDATION_DOC_TYPES.map((dt) => (
                    <div
                      key={dt}
                      className="w-2 h-2 rounded-full"
                      style={{ background: data.foundationDocs[dt] ? 'var(--accent-emerald)' : 'var(--border-default)' }}
                    />
                  ))}
                </div>
                <span className="text-xs font-medium" style={{ color: data.foundationCount === 6 ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                  {data.foundationCount}/6
                </span>
              </div>
            </div>
            <svg className="transition-transform" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </div>
          {data.foundationCount > 0 ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3">
              {FOUNDATION_DOC_TYPES.map((dt) => (
                <div key={dt} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: data.foundationDocs[dt] ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-elevated)',
                      color: data.foundationDocs[dt] ? 'var(--accent-emerald)' : 'var(--text-muted)',
                    }}
                  >
                    {data.foundationDocs[dt] ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    ) : (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /></svg>
                    )}
                  </div>
                  {FOUNDATION_LABELS[dt]}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>Not started</p>
          )}
        </Link>

        {/* Website Card */}
        <Link href={`/analyses/${id}/painted-door`} className="card-static p-5 block transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg animate-slide-up stagger-4">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Painted Door Site</span>
            <svg className="transition-transform" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </div>
          {data.websiteStatus ? (
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <span
                className="text-xs font-medium px-2 py-0.5 rounded flex items-center gap-1.5"
                style={{ background: getWebsiteStatusStyle(data.websiteStatus).bg, color: getWebsiteStatusStyle(data.websiteStatus).color }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
                {getWebsiteStatusLabel(data.websiteStatus)}
              </span>
              {data.websiteDomain && (
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {data.websiteDomain.replace(/^https?:\/\//, '')}
                </span>
              )}
              {data.websiteStatus === 'live' && data.websiteSignups > 0 && (
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {data.websiteSignups} signup{data.websiteSignups !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>Not started</p>
          )}
        </Link>

        {/* Content Card */}
        <Link href={`/analyses/${id}/content`} className="card-static p-5 block transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg animate-slide-up stagger-5">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Content Pipeline</span>
            <svg className="transition-transform" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </div>
          {data.contentTotal > 0 ? (
            <div className="flex items-center gap-6 mt-2 flex-wrap">
              <div className="text-center">
                <div className="font-display text-xl font-medium" style={{ color: 'var(--accent-emerald)' }}>{data.contentComplete}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Complete</div>
              </div>
              <div className="text-center">
                <div className="font-display text-xl font-medium" style={{ color: 'var(--accent-amber)' }}>{data.contentPending}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Pending</div>
              </div>
              <div className="text-center">
                <div className="font-display text-xl font-medium" style={{ color: 'var(--text-secondary)' }}>{data.contentTotal}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Total</div>
              </div>
              {data.contentTypes.length > 0 && (
                <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
                  {data.contentTypes.join(', ')}
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>Not started</p>
          )}
        </Link>

        {/* Performance Card (conditional) */}
        {data.hasGSCLink && data.gscImpressions !== null && (
          <Link href={`/analyses/${id}/analytics`} className="card-static p-5 block transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg animate-slide-up stagger-6">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Performance</span>
              <svg className="transition-transform" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            </div>
            <div className="flex items-center gap-6 mt-2 flex-wrap">
              <div className="text-center">
                <div className="font-display text-xl font-medium" style={{ color: 'var(--text-primary)' }}>{formatNumber(data.gscImpressions)}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Impressions</div>
              </div>
              <div className="text-center">
                <div className="font-display text-xl font-medium" style={{ color: 'var(--text-primary)' }}>{formatNumber(data.gscClicks!)}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Clicks</div>
              </div>
              <div className="text-center">
                <div className="font-display text-xl font-medium" style={{ color: 'var(--text-primary)' }}>{data.gscCTR!.toFixed(1)}%</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>CTR</div>
              </div>
              <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>Last 7 days · GSC</span>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
