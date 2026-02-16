import Link from 'next/link';
import { getAnalysesFromDb, getAllContentCalendars, isRedisConfigured, getAllFoundationDocs } from '@/lib/db';
import { getAllPaintedDoorSites } from '@/lib/painted-door-db';
import { getAnalyses } from '@/lib/data';
import { Analysis, PaintedDoorSite, ContentCalendar, FoundationDocType, FOUNDATION_DOC_TYPES } from '@/types';

export const dynamic = 'force-dynamic';

interface ProjectSummary {
  analysis: Analysis;
  foundationCount: number;
  websiteStatus: string | null;
  contentTotal: number;
  contentComplete: number;
  hasGSCLink: boolean;
}

function getBadgeClass(rec: string) {
  switch (rec) {
    case 'Tier 1': return 'badge-success';
    case 'Tier 2': return 'badge-warning';
    case 'Tier 3': return 'badge-danger';
    default: return 'badge-neutral';
  }
}

async function getProjectSummaries(): Promise<ProjectSummary[]> {
  if (!isRedisConfigured()) {
    const analyses = getAnalyses();
    return analyses.map((a) => ({
      analysis: a,
      foundationCount: 0,
      websiteStatus: null,
      contentTotal: 0,
      contentComplete: 0,
      hasGSCLink: false,
    }));
  }

  const [analyses, allSites, allCalendars] = await Promise.all([
    getAnalysesFromDb(),
    getAllPaintedDoorSites(),
    getAllContentCalendars(),
  ]);

  const summaries = await Promise.all(analyses.map(async (analysis) => {
    const docs = await getAllFoundationDocs(analysis.ideaId).catch(() => ({}));
    const site = allSites.find((s: PaintedDoorSite) => s.ideaId === analysis.ideaId);
    const calendar = allCalendars.find((c: ContentCalendar) => c.ideaId === analysis.ideaId);

    return {
      analysis,
      foundationCount: Object.keys(docs).length,
      websiteStatus: site?.status ?? null,
      contentTotal: calendar?.pieces.length ?? 0,
      contentComplete: calendar?.pieces.filter(p => p.status === 'complete').length ?? 0,
      hasGSCLink: false, // Avoid N+1 Redis calls for GSC links on home page
    };
  }));

  // Sort by overall score descending
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
        <div className="flex flex-col gap-3">
          {projects.map((project, i) => (
            <Link
              key={project.analysis.id}
              href={`/analyses/${project.analysis.id}`}
              className="card-static p-5 block transition-all hover:border-[var(--border-default)] hover:-translate-y-0.5 hover:shadow-lg animate-slide-up"
              style={{ animationDelay: `${0.1 + i * 0.05}s` }}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                      {project.analysis.ideaName}
                    </span>
                    <span className={`badge ${getBadgeClass(project.analysis.recommendation)}`}>
                      {project.analysis.recommendation}
                    </span>
                  </div>
                  <p className="text-sm mt-1 line-clamp-1" style={{ color: 'var(--text-secondary)' }}>
                    {project.analysis.summary}
                  </p>
                </div>
                <svg className="shrink-0 mt-1 transition-transform" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>

              {/* Pipeline Progress Row */}
              <div className="flex gap-5 mt-4 flex-wrap text-xs" style={{ color: 'var(--text-muted)' }}>
                {/* Analysis — always complete */}
                <div className="flex items-center gap-2">
                  <span className="font-medium">Analysis</span>
                  <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-emerald)' }} />
                </div>

                {/* Foundation */}
                <div className="flex items-center gap-2">
                  <span className="font-medium">Foundation</span>
                  <div className="flex gap-0.5">
                    {FOUNDATION_DOC_TYPES.map((_, idx) => (
                      <div
                        key={idx}
                        className="w-[7px] h-[7px] rounded-full"
                        style={{ background: idx < project.foundationCount ? 'var(--accent-emerald)' : 'var(--border-default)' }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.6875rem' }}>{project.foundationCount}/6</span>
                </div>

                {/* Website */}
                <div className="flex items-center gap-2">
                  <span className="font-medium">Website</span>
                  {project.websiteStatus ? (
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded"
                      style={{
                        background: project.websiteStatus === 'live' ? 'rgba(16, 185, 129, 0.15)'
                          : project.websiteStatus === 'failed' ? 'rgba(248, 113, 113, 0.15)'
                          : ['deploying', 'pushing', 'generating'].includes(project.websiteStatus) ? 'rgba(245, 158, 11, 0.15)'
                          : 'rgba(113, 113, 122, 0.1)',
                        color: project.websiteStatus === 'live' ? 'var(--accent-emerald)'
                          : project.websiteStatus === 'failed' ? 'var(--color-danger)'
                          : ['deploying', 'pushing', 'generating'].includes(project.websiteStatus) ? 'var(--accent-amber)'
                          : 'var(--text-muted)',
                      }}
                    >
                      {project.websiteStatus.charAt(0).toUpperCase() + project.websiteStatus.slice(1)}
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.6875rem' }}>Not Started</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex items-center gap-2">
                  <span className="font-medium">Content</span>
                  {project.contentTotal > 0 ? (
                    <span style={{ fontSize: '0.6875rem' }}>{project.contentComplete} complete / {project.contentTotal} total</span>
                  ) : (
                    <span style={{ fontSize: '0.6875rem' }}>Not started</span>
                  )}
                </div>

                {/* Analytics */}
                <div className="flex items-center gap-2">
                  <span className="font-medium">Analytics</span>
                  <span style={{ fontSize: '0.6875rem' }}>--</span>
                </div>
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
