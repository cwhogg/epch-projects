import Link from 'next/link';
import { getAllPaintedDoorSites, getEmailSignupCount } from '@/lib/painted-door-db';
import { isRedisConfigured } from '@/lib/db';
import { PaintedDoorSite } from '@/types';

export const dynamic = 'force-dynamic';

async function getSites(): Promise<(PaintedDoorSite & { signupCount: number })[]> {
  if (!isRedisConfigured()) return [];

  const sites = await getAllPaintedDoorSites();
  const enriched = await Promise.all(
    sites.map(async (site) => {
      const signupCount = await getEmailSignupCount(site.id);
      return { ...site, signupCount };
    }),
  );

  return enriched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
  live: { bg: 'rgba(52, 211, 153, 0.15)', color: '#34d399', label: 'Live' },
  deploying: { bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', label: 'Deploying' },
  generating: { bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', label: 'Generating' },
  pushing: { bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', label: 'Pushing' },
  failed: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'Failed' },
};

export default async function WebsitePage() {
  const sites = await getSites();

  return (
    <div className="space-y-8 sm:space-y-12">
      {/* Header */}
      <header className="animate-slide-up stagger-1 relative">
        <div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none hidden sm:block"
          style={{
            background: 'radial-gradient(circle, rgba(56, 189, 248, 0.12) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        <h1 className="text-2xl sm:text-3xl font-display relative" style={{ color: 'var(--text-primary)' }}>
          Website
        </h1>
        <p className="mt-2 text-sm sm:text-base relative" style={{ color: 'var(--text-secondary)' }}>
          Painted door test sites — validate demand before building.
        </p>
      </header>

      {/* Sites Grid */}
      {sites.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-slide-up stagger-2">
          {sites.map((site) => {
            const status = statusStyles[site.status] || statusStyles.generating;
            const primaryColor = site.brand?.colors?.primary || '#38bdf8';

            return (
              <div key={site.id} className="card-static overflow-hidden">
                {/* Color header */}
                <div
                  className="h-16 relative"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, ${site.brand?.colors?.accent || primaryColor})`,
                  }}
                >
                  <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.15)' }} />
                  <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
                    <span className="text-xs font-medium text-white/90 truncate">
                      {site.brand?.siteName || site.ideaName}
                    </span>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}
                    >
                      {status.label}
                    </span>
                  </div>
                </div>

                {/* Card body */}
                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                      {site.ideaName}
                    </h3>
                    {site.brand?.tagline && (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                        {site.brand.tagline}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: status.bg, color: status.color }}
                    >
                      {status.label}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {site.signupCount} signup{site.signupCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    {site.siteUrl && site.status === 'live' && (
                      <a
                        href={site.siteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                        style={{
                          background: 'rgba(56, 189, 248, 0.1)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                        }}
                      >
                        Visit site
                      </a>
                    )}
                    <Link
                      href={`/analyses/${site.ideaId}/painted-door`}
                      className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                      style={{
                        background: 'rgba(167, 139, 250, 0.1)',
                        color: '#a78bfa',
                        border: '1px solid rgba(167, 139, 250, 0.25)',
                      }}
                    >
                      Details
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="animate-slide-up stagger-2 text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ background: 'rgba(56, 189, 248, 0.1)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <h3 className="text-lg font-display mb-2" style={{ color: 'var(--text-primary)' }}>
            No painted door sites yet
          </h3>
          <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Generate a painted door site from an analysis to validate demand before building the full product.
          </p>
        </div>
      )}
    </div>
  );
}
