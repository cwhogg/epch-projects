import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAnalysisFromDb, getAnalysisContent, getFoundationDoc, isRedisConfigured } from '@/lib/db';
import { getAnalysis } from '@/lib/data';
import ScoreRing from '@/components/ScoreRing';
import SEODeepDive from '@/components/SEODeepDive';
import ReanalyzeForm from '@/components/ReanalyzeForm';
import DeleteButton from '@/components/DeleteButton';
import CollapsibleAnalysis from '@/components/CollapsibleAnalysis';
import { Analysis, FoundationDocument } from '@/types';
import { getBadgeClass, getConfidenceStyle } from '@/lib/analysis-styles';
import { getHeaderGradient } from '../utils';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface PageContent {
  main: string;
  competitors?: string;
  keywords?: string;
  seoData?: string;
}

async function getPageData(id: string): Promise<{ analysis: Analysis; content: PageContent; foundationDocs: FoundationDocument[] } | null> {
  if (isRedisConfigured()) {
    const analysis = await getAnalysisFromDb(id);
    if (analysis) {
      const [content, strategyDoc, positioningDoc] = await Promise.all([
        getAnalysisContent(id),
        getFoundationDoc(analysis.ideaId, 'strategy').catch(() => null),
        getFoundationDoc(analysis.ideaId, 'positioning').catch(() => null),
      ]);
      const foundationDocs = [strategyDoc, positioningDoc].filter(Boolean) as FoundationDocument[];
      return { analysis, content: content || { main: 'Analysis content not available' }, foundationDocs };
    }
  }
  const fallback = getAnalysis(id);
  if (!fallback) return null;
  return { analysis: fallback.analysis, content: fallback.content, foundationDocs: [] };
}

export default async function AnalysisDetailPage({ params }: PageProps) {
  const { id } = await params;
  const result = await getPageData(id);

  if (!result) {
    notFound();
  }

  const { analysis, content, foundationDocs } = result;

  const headerGradient = getHeaderGradient(analysis.recommendation);

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <header
        className="animate-slide-up stagger-1 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2 pb-6 rounded-xl"
        style={{ background: headerGradient }}
      >
        <Link
          href={`/project/${id}`}
          className="inline-flex items-center gap-1 text-sm mb-4 transition-colors hover:text-[var(--accent-coral)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back to Project
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display" style={{ color: 'var(--text-primary)' }}>
              Analysis — {analysis.ideaName}
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
              <ReanalyzeForm ideaId={analysis.id} foundationDocs={foundationDocs} />
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

      {/* Full Analysis — Collapsible */}
      <CollapsibleAnalysis content={content.main} />
    </div>
  );
}
