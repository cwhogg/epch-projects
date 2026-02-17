import Link from 'next/link';
import { getAnalysesFromDb, isRedisConfigured, getAllAssumptions } from '@/lib/db';
import { getAnalyses } from '@/lib/data';
import { Analysis, AssumptionType, AssumptionStatus, ASSUMPTION_TYPES } from '@/types';
import { getBadgeClass, getAssumptionStatusBackground, ASSUMPTION_LABELS } from '@/lib/analysis-styles';
import { buildAssumptionStatuses } from '@/lib/project-summaries';

export const dynamic = 'force-dynamic';

interface ProjectSummary {
  analysis: Analysis;
  assumptions: Record<AssumptionType, AssumptionStatus> | null;
}

async function getProjectSummaries(): Promise<ProjectSummary[]> {
  if (!isRedisConfigured()) {
    const analyses = getAnalyses();
    return analyses.map((a) => ({
      analysis: a,
      assumptions: null,
    }));
  }

  const analyses = await getAnalysesFromDb();

  const summaries = await Promise.all(analyses.map(async (analysis) => {
    let assumptions: Record<AssumptionType, AssumptionStatus> | null = null;
    try {
      const raw = await getAllAssumptions(analysis.ideaId);
      assumptions = buildAssumptionStatuses(raw);
    } catch {
      // Canvas data unavailable — show "Awaiting validation" fallback
    }

    return { analysis, assumptions };
  }));

  return summaries.sort((a, b) =>
    (b.analysis.scores.overall ?? 0) - (a.analysis.scores.overall ?? 0)
  );
}

export default async function Home() {
  const projects = await getProjectSummaries();

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <header className="animate-slide-up stagger-1 relative">
        <div
          className="absolute -top-10 right-0 w-96 h-72 rounded-full pointer-events-none hidden sm:block"
          style={{
            background: 'radial-gradient(ellipse, rgba(255, 107, 91, 0.1) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display" style={{ color: 'var(--text-primary)' }}>
              Projects
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Track every product from idea to optimized SEO test
            </p>
          </div>
          <Link
            href="/ideas/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all self-start"
            style={{
              background: 'linear-gradient(135deg, #ff6b5b 0%, #ff8f6b 100%)',
              color: '#fff',
              boxShadow: '0 4px 14px rgba(255, 107, 91, 0.4)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Test New Product
          </Link>
        </div>
      </header>

      {/* Project List */}
      {projects.length > 0 ? (
        <div className="flex flex-col gap-4">
          {projects.map((project, i) => (
            <Link
              key={project.analysis.id}
              href={`/analyses/${project.analysis.id}`}
              className="card p-5 sm:p-6 block animate-slide-up"
              style={{ animationDelay: `${0.1 + i * 0.05}s` }}
            >
              {/* Row 1: Project Identity */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-display text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                    {project.analysis.ideaName}
                  </span>
                  <span className={`badge ${getBadgeClass(project.analysis.recommendation)}`}>
                    {project.analysis.recommendation}
                  </span>
                </div>
                <svg className="shrink-0 ml-3" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>

              {/* Row 2: Validation Status Segments (or fallback) */}
              <div className="mt-4">
                {project.assumptions ? (
                  <>
                    <div className="flex gap-0.5">
                      {ASSUMPTION_TYPES.map((type) => (
                        <div
                          key={type}
                          className="flex-1 h-2 rounded-full"
                          style={{ background: getAssumptionStatusBackground(project.assumptions![type]) }}
                        />
                      ))}
                    </div>
                    <div className="hidden sm:flex mt-2 gap-0.5">
                      {ASSUMPTION_TYPES.map((type) => (
                        <span
                          key={type}
                          className="flex-1 text-center font-medium uppercase tracking-wide"
                          style={{ fontSize: '11px', color: 'var(--text-muted)' }}
                        >
                          {ASSUMPTION_LABELS[type]}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Awaiting validation
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 animate-slide-up stagger-2">
          <p className="text-lg font-display" style={{ color: 'var(--text-secondary)' }}>
            No projects yet.
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Start by testing a new product idea.
          </p>
          <Link
            href="/ideas/new"
            className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: 'linear-gradient(135deg, #ff6b5b 0%, #ff8f6b 100%)',
              color: '#fff',
              boxShadow: '0 4px 14px rgba(255, 107, 91, 0.4)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Test New Product
          </Link>
        </div>
      )}
    </div>
  );
}
