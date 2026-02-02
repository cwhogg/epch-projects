import Link from 'next/link';
import { getLeaderboard, getAnalyses } from '@/lib/data';
import { getLeaderboardFromDb, getAnalysesFromDb, getAllGSCLinks, getAllContentCalendars, getPublishedPieces, isRedisConfigured } from '@/lib/db';
import { Analysis, LeaderboardEntry, ContentCalendar } from '@/types';
import { PUBLISH_TARGETS } from '@/lib/publish-targets';
import ProgramToggleButton from '@/components/ProgramToggleButton';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ leaderboard: LeaderboardEntry[]; analyses: Analysis[]; gscLinkedIds: Set<string>; programs: (ContentCalendar & { publishedCount: number; siteName: string })[] }> {
  if (isRedisConfigured()) {
    const [leaderboard, analyses, gscLinks, calendars, publishedKeys] = await Promise.all([
      getLeaderboardFromDb(),
      getAnalysesFromDb(),
      getAllGSCLinks(),
      getAllContentCalendars(),
      getPublishedPieces(),
    ]);
    const publishedSet = new Set(publishedKeys);
    const programs = calendars.map((cal) => {
      const publishedCount = cal.pieces.filter((p) => publishedSet.has(`${cal.ideaId}:${p.id}`)).length;
      const target = PUBLISH_TARGETS[cal.targetId || 'secondlook'];
      const siteName = target ? target.siteUrl.replace('https://', '') : cal.targetId || 'secondlook';
      return { ...cal, publishedCount, siteName };
    });
    return { leaderboard, analyses, gscLinkedIds: new Set(gscLinks.map((l) => l.ideaId)), programs };
  }
  return {
    leaderboard: getLeaderboard(),
    analyses: getAnalyses(),
    gscLinkedIds: new Set(),
    programs: [],
  };
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
function ScoreRing({ score, label, size = 56 }: { score: number | null; label: string; size?: number }) {
  const strokeWidth = 4;
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
    return `drop-shadow(0 0 4px ${getColor()}40)`;
  };

  return (
    <div className="flex flex-col items-center gap-1 transition-transform duration-200 hover:scale-110">
      <div className="relative" style={{ width: size, height: size, filter: getGlow() }}>
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
          style={{ fontSize: size * 0.32, color: score !== null ? getColor() : 'var(--text-muted)' }}
        >
          {score !== null ? score : '?'}
        </div>
      </div>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

export default async function Home() {
  const { leaderboard, analyses: rawAnalyses, gscLinkedIds, programs } = await getData();
  const analyses = [...rawAnalyses].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );

  return (
    <div className="space-y-8 sm:space-y-12">
      {/* Header */}
      <header className="animate-slide-up stagger-1 relative">
        {/* Decorative gradient orb */}
        <div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none hidden sm:block"
          style={{
            background: 'radial-gradient(circle, rgba(255, 107, 91, 0.12) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        <h1 className="text-2xl sm:text-3xl font-display relative" style={{ color: 'var(--text-primary)' }}>
          Product Ideas
        </h1>
        <p className="mt-2 text-sm sm:text-base relative" style={{ color: 'var(--text-secondary)' }}>
          AI-powered analysis across competition, SEO, and willingness to pay.
        </p>
      </header>

      {/* Programs */}
      {programs.length > 0 && (
        <section className="animate-slide-up stagger-2">
          <h2 className="text-lg font-display mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Content Programs
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((program) => {
              const isActive = program.active !== false;
              return (
                <div
                  key={program.ideaId}
                  className="card-static p-4 flex items-center justify-between gap-3"
                  style={{ opacity: isActive ? 1 : 0.5 }}
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {program.ideaName}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: isActive ? 'rgba(52, 211, 153, 0.15)' : 'rgba(156, 163, 175, 0.15)', color: isActive ? '#34d399' : '#9ca3af' }}>
                        {isActive ? `${program.publishedCount}/${program.pieces.length} published` : 'Paused'}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {program.siteName}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/analyses/${program.ideaId}/analytics`}
                      className="text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                      style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.25)' }}
                    >
                      Analytics
                    </Link>
                    <ProgramToggleButton ideaId={program.ideaId} active={isActive} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Empty State */}
      {leaderboard.length === 0 ? (
        <div className="card-static p-8 sm:p-12 text-center animate-slide-up stagger-2">
          <div
            className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--accent-coral-soft)' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </div>
          <h2 className="text-xl font-display mb-2" style={{ color: 'var(--text-primary)' }}>
            No ideas yet
          </h2>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
            Add your first product idea to start researching.
          </p>
          <Link href="/ideas/new" className="btn btn-primary">
            Add Your First Idea
          </Link>
        </div>
      ) : (
        <>
          {/* Leaderboard - Card format for mobile */}
          <section className="animate-slide-up stagger-2">
            <h2 className="text-lg font-display mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20V10" />
                <path d="M18 20V4" />
                <path d="M6 20v-4" />
              </svg>
              Leaderboard
            </h2>

            {/* Mobile: Stack cards */}
            <div className="space-y-3 sm:hidden">
              {leaderboard.map((entry, index) => (
                <Link
                  key={entry.ideaId}
                  href={`/analyses/${entry.ideaId}`}
                  className="card block p-4"
                  style={{ animationDelay: `${0.1 + index * 0.05}s` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-sm font-display font-semibold"
                          style={{ color: 'var(--accent-coral)' }}
                        >
                          #{entry.rank}
                        </span>
                        <span className={`badge ${getBadgeClass(entry.recommendation)}`}>
                          {entry.recommendation}
                        </span>
                      </div>
                      <h3 className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {entry.ideaName}
                      </h3>
                      <p className="text-sm mt-1 truncate" style={{ color: 'var(--text-muted)' }}>
                        {entry.topStrength}
                      </p>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-medium" style={getConfidenceStyle(entry.confidence)}>
                        {entry.confidence}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop: Table */}
            <div className="hidden sm:block card-static overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Rank
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Idea
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Recommendation
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Confidence
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Top Strength
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Top Risk
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => (
                    <tr
                      key={entry.ideaId}
                      className="group"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <td className="px-4 py-4">
                        <span className="font-display font-semibold" style={{ color: 'var(--accent-coral)' }}>
                          #{entry.rank}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <Link
                          href={`/analyses/${entry.ideaId}`}
                          className="font-medium group-hover:underline"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {entry.ideaName}
                        </Link>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`badge ${getBadgeClass(entry.recommendation)}`}>
                          {entry.recommendation}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm font-medium" style={getConfidenceStyle(entry.confidence)}>
                          {entry.confidence}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {entry.topStrength}
                      </td>
                      <td className="px-4 py-4 text-sm max-w-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {entry.topRisk}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* All Analyses Grid */}
          <section className="animate-slide-up stagger-3">
            <h2 className="text-lg font-display mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              All Analyses
            </h2>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {analyses.map((analysis, index) => (
                <Link
                  key={analysis.id}
                  href={`/analyses/${analysis.id}`}
                  className="card block p-5"
                  style={{ animationDelay: `${0.15 + index * 0.05}s` }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <h3 className="font-display font-medium text-base" style={{ color: 'var(--text-primary)' }}>
                      {analysis.ideaName}
                    </h3>
                    <span className={`badge ${getBadgeClass(analysis.recommendation)} shrink-0`}>
                      {analysis.recommendation}
                    </span>
                  </div>

                  {/* Summary */}
                  <p className="text-sm line-clamp-2 mb-4" style={{ color: 'var(--text-secondary)' }}>
                    {analysis.summary || 'No summary available'}
                  </p>

                  {/* Scores */}
                  <div className="flex items-center justify-between gap-2 mb-4 overflow-x-auto pb-1">
                    <ScoreRing score={analysis.scores.competitiveLandscape} label="Comp" size={48} />
                    <ScoreRing score={analysis.scores.willingnessToPay} label="WTP" size={48} />
                    <ScoreRing score={analysis.scores.differentiationPotential} label="Diff" size={48} />
                    <ScoreRing score={analysis.scores.seoOpportunity} label="SEO" size={48} />
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <div className="flex gap-2">
                      {analysis.hasCompetitorAnalysis && (
                        <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--accent-coral-soft)', color: 'var(--accent-coral)' }}>
                          Competitors
                        </span>
                      )}
                      {analysis.hasKeywordAnalysis && (
                        <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa' }}>
                          Keywords
                        </span>
                      )}
                      {analysis.hasContentGenerated && (
                        <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399' }}>
                          Content
                        </span>
                      )}
                      {gscLinkedIds.has(analysis.id) && (
                        <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>
                          Analytics
                        </span>
                      )}
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(analysis.completedAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
