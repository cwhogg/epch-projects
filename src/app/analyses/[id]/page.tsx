import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAnalysis } from '@/lib/data';
import { getAnalysisFromDb, getAnalysisContent, isRedisConfigured } from '@/lib/db';
import MarkdownContent from '@/components/MarkdownContent';
import ReanalyzeForm from '@/components/ReanalyzeForm';
import DeleteButton from '@/components/DeleteButton';
import { Analysis } from '@/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface AnalysisData {
  analysis: Analysis;
  content: { main: string; competitors?: string; keywords?: string };
}

async function getAnalysisData(id: string): Promise<AnalysisData | null> {
  if (isRedisConfigured()) {
    const analysis = await getAnalysisFromDb(id);
    if (analysis) {
      const content = await getAnalysisContent(id);
      return {
        analysis,
        content: content || { main: 'Analysis content not available' },
      };
    }
  }
  return getAnalysis(id);
}

function getBadgeClass(rec: string) {
  switch (rec) {
    case 'Test First':
      return 'badge-success';
    case 'Test Later':
      return 'badge-warning';
    case "Don't Test":
      return 'badge-danger';
    default:
      return 'badge-neutral';
  }
}

function getConfidenceStyle(conf: string) {
  switch (conf) {
    case 'High':
      return { color: '#34d399' };
    case 'Medium':
      return { color: '#fbbf24' };
    case 'Low':
      return { color: '#f87171' };
    default:
      return { color: 'var(--text-muted)' };
  }
}

// Score ring component
function ScoreRing({ score, label, size = 72 }: { score: number | null; label: string; size?: number }) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percent = score !== null ? score / 10 : 0;
  const offset = circumference - percent * circumference;

  const getColor = () => {
    if (score === null) return 'var(--text-muted)';
    if (score >= 7) return '#34d399';
    if (score >= 4) return '#fbbf24';
    return '#f87171';
  };

  const getGlow = () => {
    if (score === null || score < 7) return 'none';
    return `drop-shadow(0 0 6px ${getColor()}50)`;
  };

  return (
    <div className="flex flex-col items-center gap-2 group">
      <div
        className="relative transition-transform duration-200 group-hover:scale-105"
        style={{ width: size, height: size, filter: getGlow() }}
      >
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border-default)"
            strokeWidth={strokeWidth}
          />
          {score !== null && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={getColor()}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
          )}
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center font-display font-semibold"
          style={{ fontSize: size * 0.35, color: score !== null ? getColor() : 'var(--text-muted)' }}
        >
          {score !== null ? score : '?'}
        </div>
      </div>
      <span className="text-xs text-center transition-colors group-hover:text-[var(--text-secondary)]" style={{ color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

export default async function AnalysisPage({ params }: PageProps) {
  const { id } = await params;
  const result = await getAnalysisData(id);

  if (!result) {
    notFound();
  }

  const { analysis, content } = result;

  // Get gradient color based on recommendation
  const getHeaderGradient = () => {
    switch (analysis.recommendation) {
      case 'Test First':
        return 'radial-gradient(ellipse at top left, rgba(52, 211, 153, 0.1) 0%, transparent 50%)';
      case 'Test Later':
        return 'radial-gradient(ellipse at top left, rgba(251, 191, 36, 0.08) 0%, transparent 50%)';
      case "Don't Test":
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
          href="/"
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
          <div className="flex items-center gap-3">
            <span className={`badge ${getBadgeClass(analysis.recommendation)}`}>
              {analysis.recommendation}
            </span>
            <span className="text-sm font-medium" style={getConfidenceStyle(analysis.confidence)}>
              {analysis.confidence}
            </span>
          </div>
        </div>
      </header>

      {/* Scores Grid */}
      <div className="card-static p-5 sm:p-6 animate-slide-up stagger-2">
        <h2 className="font-display text-base mb-5" style={{ color: 'var(--text-primary)' }}>
          Scores
        </h2>
        <div className="flex flex-wrap justify-center sm:justify-between gap-4 sm:gap-6">
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Key Risks
          </h2>
          <ul className="space-y-2">
            {analysis.risks.map((risk, index) => (
              <li key={index} className="flex items-start gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span style={{ color: '#f87171' }}>•</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 animate-slide-up stagger-4">
        <ReanalyzeForm ideaId={analysis.id} />
        <DeleteButton ideaId={analysis.id} ideaName={analysis.ideaName} />
      </div>

      {/* Full Analysis */}
      <div className="card-static p-5 sm:p-6 animate-slide-up stagger-5">
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
