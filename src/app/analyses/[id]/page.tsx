import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAnalysis } from '@/lib/data';
import { getAnalysisFromDb, getAnalysisContent, getContentCalendar, getContentPieces, getGSCLink, isRedisConfigured } from '@/lib/db';
import { getPaintedDoorSite } from '@/lib/painted-door-db';
import MarkdownContent from '@/components/MarkdownContent';
import ReanalyzeForm from '@/components/ReanalyzeForm';
import DeleteButton from '@/components/DeleteButton';
import ScoreRing from '@/components/ScoreRing';
import SEODeepDive from '@/components/SEODeepDive';
import { Analysis } from '@/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface AnalysisData {
  analysis: Analysis;
  content: { main: string; competitors?: string; keywords?: string; seoData?: string };
  contentCalendarExists: boolean;
  contentPieceCount: number;
  hasGSCLink: boolean;
  paintedDoorSite: { siteUrl: string; status: string } | null;
}

async function getAnalysisData(id: string): Promise<AnalysisData | null> {
  if (isRedisConfigured()) {
    const analysis = await getAnalysisFromDb(id);
    if (analysis) {
      const [content, calendar, pieces, gscLink, pdSite] = await Promise.all([
        getAnalysisContent(id),
        getContentCalendar(id),
        getContentPieces(id),
        getGSCLink(id),
        getPaintedDoorSite(id).catch(() => null),
      ]);
      return {
        analysis,
        content: content || { main: 'Analysis content not available' },
        contentCalendarExists: !!calendar,
        contentPieceCount: pieces.filter((p) => p.status === 'complete').length,
        hasGSCLink: !!gscLink,
        paintedDoorSite: pdSite ? { siteUrl: pdSite.siteUrl, status: pdSite.status } : null,
      };
    }
  }
  const fallback = getAnalysis(id);
  if (!fallback) return null;
  return { ...fallback, contentCalendarExists: false, contentPieceCount: 0, hasGSCLink: false, paintedDoorSite: null };
}

function getBadgeClass(rec: string) {
  switch (rec) {
    case 'Tier 1':
      return 'badge-success';
    case 'Tier 2':
      return 'badge-warning';
    case 'Tier 3':
      return 'badge-danger';
    default:
      return 'badge-neutral';
  }
}

function getConfidenceStyle(conf: string) {
  switch (conf) {
    case 'High':
      return { color: 'var(--accent-emerald)' };
    case 'Medium':
      return { color: 'var(--accent-amber)' };
    case 'Low':
      return { color: 'var(--color-danger)' };
    default:
      return { color: 'var(--text-muted)' };
  }
}

export default async function AnalysisPage({ params }: PageProps) {
  const { id } = await params;
  const result = await getAnalysisData(id);

  if (!result) {
    notFound();
  }

  const { analysis, content, contentCalendarExists, contentPieceCount, hasGSCLink, paintedDoorSite } = result;

  // Get gradient color based on recommendation
  const getHeaderGradient = () => {
    switch (analysis.recommendation) {
      case 'Tier 1':
        return 'radial-gradient(ellipse at top left, rgba(52, 211, 153, 0.1) 0%, transparent 50%)';
      case 'Tier 2':
        return 'radial-gradient(ellipse at top left, rgba(251, 191, 36, 0.08) 0%, transparent 50%)';
      case 'Tier 3':
        return 'radial-gradient(ellipse at top left, rgba(248, 113, 113, 0.08) 0%, transparent 50%)';
      default:
        return 'none';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
      {/* Header with ambient gradient */}
      <header
        className="animate-slide-up stagger-1 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2 pb-6 rounded-xl"
        style={{ background: getHeaderGradient() }}
      >
        <Link
          href="/analysis"
          className="inline-flex items-center gap-1 text-sm mb-4 transition-colors hover:text-[var(--accent-coral)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back
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
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/analyses/${analysis.id}/painted-door`}
                className="btn btn-ghost text-sm"
              >
                {paintedDoorSite?.status === 'live' ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    View Site
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    Create Website
                  </>
                )}
              </Link>
              <Link
                href={`/analyses/${analysis.id}/foundation`}
                className="btn btn-ghost text-sm"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                Foundation Docs
              </Link>
              <ReanalyzeForm ideaId={analysis.id} />
              <DeleteButton ideaId={analysis.id} ideaName={analysis.ideaName} />
            </div>
          </div>
        </div>
      </header>

      {/* Scores Grid */}
      <div className="card-static p-5 sm:p-6 animate-slide-up stagger-2">
        <h2 className="font-display text-base mb-5" style={{ color: 'var(--text-primary)' }}>
          Scores
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 sm:gap-6 justify-items-center">
          <ScoreRing score={analysis.scores.seoOpportunity} label="SEO" />
          <ScoreRing score={analysis.scores.competitiveLandscape} label="Competition" />
          <ScoreRing score={analysis.scores.willingnessToPay} label="WTP" />
          <ScoreRing score={analysis.scores.differentiationPotential} label="Differentiation" />
          <ScoreRing score={analysis.scores.expertiseAlignment} label="Expertise" />
          <ScoreRing score={analysis.scores.overall} label="Overall" size={80} />
        </div>
      </div>

      {/* Risks */}
      {analysis.risks && analysis.risks.length > 0 && (
        <div className="card-static p-5 sm:p-6 animate-slide-up stagger-3">
          <h2 className="font-display text-base mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Key Risks
          </h2>
          <ul className="space-y-2">
            {analysis.risks.map((risk, index) => (
              <li key={index} className="flex items-start gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--color-danger)' }}>•</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* SEO Deep Dive */}
      <SEODeepDive seoDataJson={content.seoData} />

      {/* Full Analysis */}
      <div className="card-static p-5 sm:p-6 animate-slide-up stagger-4">
        <h2 className="font-display text-base mb-4" style={{ color: 'var(--text-primary)' }}>
          Full Analysis
        </h2>
        <div className="prose-editorial">
          <MarkdownContent content={content.main} />
        </div>
      </div>
    </div>
  );
}
