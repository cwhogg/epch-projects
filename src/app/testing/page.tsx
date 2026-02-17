import Link from 'next/link';
import { getAllContentCalendars, getPublishedPieces, isRedisConfigured } from '@/lib/db';
import { ContentCalendar } from '@/types';
import { PUBLISH_TARGETS } from '@/lib/publish-targets';
import ProgramToggleButton from '@/components/ProgramToggleButton';
import TestingAnalytics from '@/components/TestingAnalytics';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ programs: (ContentCalendar & { publishedCount: number; siteName: string })[] }> {
  if (!isRedisConfigured()) {
    return { programs: [] };
  }

  const [calendars, publishedKeys] = await Promise.all([
    getAllContentCalendars(),
    getPublishedPieces(),
  ]);
  const publishedSet = new Set(publishedKeys);

  const publishedByTarget = new Map<string, number>();
  for (const cal of calendars) {
    const targetId = cal.targetId || 'secondlook';
    const count = cal.pieces.filter((p) => publishedSet.has(`${cal.ideaId}:${p.id}`)).length;
    publishedByTarget.set(targetId, (publishedByTarget.get(targetId) || 0) + count);
  }

  const programs = calendars
    .map((cal) => {
      const targetId = cal.targetId || 'secondlook';
      const publishedCount = publishedByTarget.get(targetId) || 0;
      const target = PUBLISH_TARGETS[targetId];
      const siteName = target ? target.siteUrl.replace('https://', '') : targetId;
      return { ...cal, publishedCount, siteName };
    })
    .sort((a, b) => {
      const aActive = a.active !== false ? 0 : 1;
      const bActive = b.active !== false ? 0 : 1;
      return aActive - bActive;
    });

  return { programs };
}

export default async function TestingPage() {
  const { programs } = await getData();

  return (
    <div className="space-y-8 sm:space-y-12">
      {/* Header */}
      <header className="animate-slide-up stagger-1 relative">
        <div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none hidden sm:block"
          style={{
            background: 'radial-gradient(circle, rgba(251, 191, 36, 0.12) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        <h1 className="text-2xl sm:text-3xl font-display relative" style={{ color: 'var(--text-primary)' }}>
          Testing
        </h1>
        <p className="mt-2 text-sm sm:text-base relative" style={{ color: 'var(--text-secondary)' }}>
          Active content programs and weekly performance analytics.
        </p>
      </header>

      {/* Programs Section */}
      {programs.length > 0 && (
        <section className="animate-slide-up stagger-2">
          <h2 className="text-lg font-display mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                      {isActive ? (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(52, 211, 153, 0.15)', color: 'var(--accent-emerald)' }}>
                          {program.publishedCount} published
                        </span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(113, 113, 122, 0.15)', color: 'var(--text-muted)' }}>
                          Paused
                        </span>
                      )}
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {program.siteName}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/project/${program.ideaId}/analytics`}
                      className="text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                      style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--color-purple-light)', border: '1px solid rgba(139, 92, 246, 0.25)' }}
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

      {/* Weekly Analytics (client component) */}
      <div className="animate-slide-up stagger-3">
        <TestingAnalytics />
      </div>
    </div>
  );
}
