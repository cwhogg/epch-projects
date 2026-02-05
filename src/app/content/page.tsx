import Link from 'next/link';
import { getAllContentCalendars, getPublishedPieces, isRedisConfigured } from '@/lib/db';
import { ContentCalendar } from '@/types';
import { PUBLISH_TARGETS } from '@/lib/publish-targets';
import { getAllPaintedDoorSites } from '@/lib/painted-door-db';
import ProgramToggleButton from '@/components/ProgramToggleButton';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ calendars: (ContentCalendar & { generatedCount: number; publishedCount: number; siteName: string })[]; }> {
  if (!isRedisConfigured()) {
    return { calendars: [] };
  }

  const [calendars, publishedKeys, paintedDoorSites] = await Promise.all([
    getAllContentCalendars(),
    getPublishedPieces(),
    getAllPaintedDoorSites().catch(() => []),
  ]);
  const publishedSet = new Set(publishedKeys);

  // Build lookup from painted door site IDs to their URLs
  const dynamicSiteMap = new Map(
    paintedDoorSites.map((s) => [s.id, s.siteUrl.replace('https://', '')])
  );

  const enriched = calendars.map((cal) => {
    const targetId = cal.targetId || 'secondlook';
    const target = PUBLISH_TARGETS[targetId];
    const siteName = target
      ? target.siteUrl.replace('https://', '')
      : dynamicSiteMap.get(targetId) || targetId;
    const generatedCount = cal.pieces.filter((p) => p.status === 'complete').length;
    const publishedCount = cal.pieces.filter((p) => publishedSet.has(`${cal.ideaId}:${p.id}`)).length;
    return { ...cal, generatedCount, publishedCount, siteName };
  });

  // Sort: active first, paused last
  enriched.sort((a, b) => {
    const aActive = a.active !== false ? 0 : 1;
    const bActive = b.active !== false ? 0 : 1;
    return aActive - bActive;
  });

  return { calendars: enriched };
}

export default async function ContentPage() {
  const { calendars } = await getData();

  return (
    <div className="space-y-8 sm:space-y-12">
      {/* Header */}
      <header className="animate-slide-up stagger-1 relative">
        <div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none hidden sm:block"
          style={{
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        <h1 className="text-2xl sm:text-3xl font-display relative" style={{ color: 'var(--text-primary)' }}>
          Content
        </h1>
        <p className="mt-2 text-sm sm:text-base relative" style={{ color: 'var(--text-secondary)' }}>
          All content calendars and published pieces across your ideas.
        </p>
      </header>

      {calendars.length === 0 ? (
        <div className="card-static p-8 sm:p-12 text-center animate-slide-up stagger-2">
          <div
            className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(139, 92, 246, 0.12)' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <h2 className="text-xl font-display mb-2" style={{ color: 'var(--text-primary)' }}>
            No content calendars yet
          </h2>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
            Analyze an idea to get started with content generation.
          </p>
          <Link href="/analysis" className="btn btn-primary">
            Go to Analysis
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-slide-up stagger-2">
          {calendars.map((cal, index) => {
            const isActive = cal.active !== false;
            return (
              <div
                key={cal.ideaId}
                className="card p-5 flex flex-col"
                style={{ animationDelay: `${0.1 + index * 0.05}s`, opacity: isActive ? 1 : 0.5 }}
              >
                <Link href={`/analyses/${cal.ideaId}/content`} className="block flex-1">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-display font-medium text-base" style={{ color: 'var(--text-primary)' }}>
                      {cal.ideaName}
                    </h3>
                    <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {cal.siteName}
                    </span>
                  </div>

                  {/* Counts */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                      {cal.pieces.length} pieces
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(52, 211, 153, 0.1)', color: '#34d399' }}>
                      {cal.generatedCount} generated
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa' }}>
                      {cal.publishedCount} published
                    </span>
                  </div>

                  {/* Strategy summary */}
                  {cal.strategySummary && (
                    <p className="text-sm line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                      {cal.strategySummary}
                    </p>
                  )}
                </Link>

                {/* Footer with toggle */}
                <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center gap-2">
                    {isActive ? (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399' }}>
                        Active
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(113, 113, 122, 0.15)', color: 'var(--text-muted)' }}>
                        Paused
                      </span>
                    )}
                    <ProgramToggleButton ideaId={cal.ideaId} active={isActive} />
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(cal.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
